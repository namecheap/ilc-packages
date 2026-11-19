/**
 * `ilc-registry login`: the OAuth authorization code flow with PKCE against the Registry, for a native app (RFC 8252).
 * The Registry sends the browser back to a loopback server this process starts; a user without a browser on the
 * machine pastes the redirect URL into the terminal instead. The token lands in the token file.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createInterface } from 'node:readline';

import { CLI_CLIENT_ID, DEFAULT_CLI_SCOPE } from '../constants.js';
import { RegistryError } from '../errors.js';
import { normalizeRegistryUrl, saveStoredToken, type StoredIn } from '#token-store';
import { describeError, discoverEndpoints, type OAuthEndpoints } from './endpoints.js';
import { openBrowser as defaultOpenBrowser } from './open-browser.js';
import { codeChallenge, codeVerifier, randomState } from './pkce.js';

export interface LoginOptions {
    /** Origin of the Registry, with its base path when it has one, for example `https://registry.example.com` */
    registryUrl: string;
    /** The scopes to ask for; `override:sign` when omitted */
    scopes?: string[];
    /** Opens the authorize URL for the user; the platform's opener by default. The URL is printed either way. */
    openBrowser?: (url: string) => Promise<void> | void;
    /** How long to wait for the user to log in; 5 minutes by default */
    timeoutMs?: number;
    /** Where the pasted redirect URL is read from when it is a terminal; `process.stdin` by default */
    stdin?: NodeJS.ReadableStream & { isTTY?: boolean | undefined };
    /** Where the authorize URL and the paste prompt are written; `process.stdout` by default */
    stdout?: NodeJS.WritableStream;
}

export interface LoginResult {
    /** The Registry URL as the token file keys it */
    registryUrl: string;
    /** The scopes the Registry granted */
    scopes: string[];
    /** When the Registry stops accepting the token */
    expiresAt: Date;
    /** Where the token itself went: the macOS Keychain, or the token file where the Keychain is not available */
    storedIn: StoredIn;
}

export const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60_000;
/** For each request to the Registry itself: the metadata document and the token endpoint */
const REQUEST_TIMEOUT_MS = 10_000;
const CALLBACK_PATH = '/callback';

/** Logs the user in to the Registry in the browser and stores the token for `auth: { type: 'cli' }` */
export async function login(options: LoginOptions): Promise<LoginResult> {
    const registryUrl = normalizeRegistryUrl(options.registryUrl);
    const scopes = options.scopes !== undefined && options.scopes.length > 0 ? options.scopes : [DEFAULT_CLI_SCOPE];
    const timeoutMs = options.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS;
    const stdout = options.stdout ?? process.stdout;
    const stdin = options.stdin ?? process.stdin;

    const endpoints = await discoverEndpoints(registryUrl, REQUEST_TIMEOUT_MS);
    const verifier = codeVerifier();
    const state = randomState();
    const callback = await listenForCallback(state);
    const paste = promptForPaste(stdin, stdout, state);
    const timeout = rejectAfter(timeoutMs);
    try {
        const authorizeUrl = buildAuthorizeUrl(endpoints, {
            redirectUri: callback.redirectUri,
            challenge: codeChallenge(verifier),
            state,
            scopes,
        });
        stdout.write(`Open this URL in your browser to log in to the Registry:\n\n    ${authorizeUrl}\n\n`);
        const opening = Promise.resolve().then(() => (options.openBrowser ?? defaultOpenBrowser)(authorizeUrl));

        const code = await Promise.race([callback.code, paste.code, timeout.expiry, failureOf(opening)]);
        const token = await exchangeCode(endpoints, { code, redirectUri: callback.redirectUri, verifier, scopes });
        const storedIn = saveStoredToken(registryUrl, token);
        return { registryUrl, scopes: token.scopes, expiresAt: token.expiresAt, storedIn };
    } finally {
        timeout.clear();
        paste.close();
        await callback.close();
    }
}

interface AuthorizeParams {
    redirectUri: string;
    challenge: string;
    state: string;
    scopes: string[];
}

function buildAuthorizeUrl(endpoints: OAuthEndpoints, params: AuthorizeParams): string {
    const url = new URL(endpoints.authorization);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', CLI_CLIENT_ID);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('code_challenge', params.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', params.state);
    url.searchParams.set('scope', params.scopes.join(' '));
    return url.toString();
}

interface CallbackServer {
    redirectUri: string;
    /** The authorization code of the redirect, or the failure the redirect reported */
    code: Promise<string>;
    close(): Promise<void>;
}

/** Starts the loopback server the Registry redirects the browser to, on a free port of 127.0.0.1 */
async function listenForCallback(expectedState: string): Promise<CallbackServer> {
    let resolveCode: (code: string) => void = () => {};
    let rejectCode: (error: unknown) => void = () => {};
    const code = new Promise<string>((resolve, reject) => {
        resolveCode = resolve;
        rejectCode = reject;
    });
    let redirectUri = '';

    const server = createServer((request: IncomingMessage, response: ServerResponse) => {
        const url = new URL(request.url ?? '/', redirectUri);
        if (url.pathname !== CALLBACK_PATH) {
            respond(response, 404, 'Not found');
            return;
        }
        try {
            const received = parseRedirect(url, expectedState);
            respond(response, 200, 'You are logged in to the ILC Registry. You can close this tab.');
            resolveCode(received);
        } catch (error) {
            respond(response, 400, `Login failed: ${describeError(error)}. You can close this tab.`);
            rejectCode(error);
        }
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
        throw new Error('The loopback server has no TCP address');
    }
    redirectUri = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;

    return { redirectUri, code, close: () => closeServer(server) };
}

function respond(response: ServerResponse, status: number, text: string): void {
    response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(
        `<!doctype html><html><head><meta charset="utf-8"><title>ILC Registry login</title></head>` +
            `<body><p>${escapeHtml(text)}</p></body></html>`,
    );
}

function closeServer(server: Server): Promise<void> {
    return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
    });
}

/** The code of a redirect URL, after checking its `state`; throws `login-failed` for what the Registry reported */
function parseRedirect(url: URL, expectedState: string): string {
    const params = url.searchParams;
    if (params.get('state') !== expectedState) {
        throw new RegistryError('login-failed', 'The redirect does not belong to this login: its state is different');
    }
    const error = params.get('error');
    if (error !== null) {
        throw new RegistryError('login-failed', params.get('error_description') ?? `The Registry answered ${error}`);
    }
    const code = params.get('code');
    if (code === null || code === '') {
        throw new RegistryError('login-failed', 'The redirect carries no authorization code');
    }
    return code;
}

interface PastePrompt {
    code: Promise<string>;
    close(): void;
}

/** When stdin is a terminal, also takes the redirect URL pasted by the user, for a login over SSH or in a container */
function promptForPaste(
    stdin: NonNullable<LoginOptions['stdin']>,
    stdout: NodeJS.WritableStream,
    expectedState: string,
): PastePrompt {
    if (stdin.isTTY !== true) {
        return { code: new Promise(() => {}), close() {} };
    }
    const prompt = createInterface({ input: stdin, output: stdout, terminal: false });
    let answered = false;
    const code = new Promise<string>((resolve, reject) => {
        prompt.question('If the browser cannot reach this machine, paste the redirect URL here: ', (line) => {
            answered = true;
            try {
                resolve(parseRedirect(new URL(line.trim()), expectedState));
            } catch (error) {
                reject(
                    error instanceof TypeError
                        ? new RegistryError('login-failed', 'The pasted text is not a URL')
                        : error,
                );
            }
        });
    });
    return {
        code,
        close() {
            prompt.close();
            if (!answered) {
                stdout.write('\n');
            }
        },
    };
}

function rejectAfter(timeoutMs: number): { expiry: Promise<never>; clear(): void } {
    let timer: NodeJS.Timeout | undefined;
    const expiry = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(
                new RegistryError(
                    'login-failed',
                    `No login within ${Math.round(timeoutMs / 1000)} seconds; run the command again`,
                ),
            );
        }, timeoutMs);
    });
    return { expiry, clear: () => clearTimeout(timer) };
}

/** Never settles unless the promise rejects: lets a failure to open the browser end the wait for the redirect */
function failureOf(promise: Promise<unknown>): Promise<never> {
    return new Promise((_resolve, reject) => {
        promise.catch(reject);
    });
}

interface ExchangeParams {
    code: string;
    redirectUri: string;
    verifier: string;
    /** What was asked for; the token keeps these when the Registry does not say what it granted */
    scopes: string[];
}

interface IssuedToken {
    token: string;
    expiresAt: Date;
    scopes: string[];
}

/** Trades the authorization code for the access token at the token endpoint (RFC 6749 section 4.1.3) */
async function exchangeCode(endpoints: OAuthEndpoints, params: ExchangeParams): Promise<IssuedToken> {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.code,
        redirect_uri: params.redirectUri,
        client_id: CLI_CLIENT_ID,
        code_verifier: params.verifier,
    });
    let response: Response;
    try {
        response = await fetch(endpoints.token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: body.toString(),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        throw new RegistryError(
            'unreachable',
            `Registry is unreachable at ${endpoints.token}: ${describeError(error)}`,
        );
    }

    const text = await response.text();
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        json = undefined;
    }
    const answer = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : undefined;

    if (response.status !== 200) {
        if (answer !== undefined && typeof answer['error'] === 'string') {
            const description = answer['error_description'];
            const detail = typeof description === 'string' && description !== '' ? description : answer['error'];
            throw new RegistryError('login-failed', `The Registry refused the login (${answer['error']}): ${detail}`);
        }
        throw new RegistryError('unreachable', `Registry answered ${response.status} at ${endpoints.token}`);
    }
    if (answer === undefined || typeof answer['access_token'] !== 'string' || answer['access_token'] === '') {
        throw new RegistryError('unreachable', 'Registry answered 200 without an access token');
    }
    const expiresIn = answer['expires_in'];
    if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new RegistryError('unreachable', 'Registry answered 200 without a valid token lifetime');
    }
    const granted = answer['scope'];
    const scopes = typeof granted === 'string' && granted.trim() !== '' ? granted.trim().split(/\s+/) : params.scopes;
    return { token: answer['access_token'], expiresAt: new Date(Date.now() + expiresIn * 1000), scopes };
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
