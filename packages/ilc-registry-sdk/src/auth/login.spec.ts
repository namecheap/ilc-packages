import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { resolveAuth } from '../auth.js';
import { RegistryError } from '../errors.js';
import { listStoredTokens, readStoredToken } from '../node/token-store.js';
import { login } from './login.js';
import { logout } from './logout.js';

/** How the fake Registry answers the authorize request */
type AuthorizeBehaviour = 'redirect' | 'wrong-state' | 'error';

interface FakeRegistry {
    url: string;
    /** Whether the metadata document is served; without it the clients fall back to `/oauth/*` */
    metadata: boolean;
    authorize: AuthorizeBehaviour;
    /** Answer of the token endpoint instead of a token; `undefined` issues one */
    tokenAnswer?: { status: number; body: unknown };
    /** Paths requested, in order */
    requests: string[];
    /** Bodies the token endpoint received */
    tokenRequests: URLSearchParams[];
    /** Tokens the revocation endpoint received */
    revoked: string[];
    close(): Promise<void>;
}

const ISSUED_TOKEN = 'session-value';
const EXPIRES_IN = 3600;

async function startFakeRegistry(): Promise<FakeRegistry> {
    const codes = new Map<string, { challenge: string; redirectUri: string }>();
    const fake: Omit<FakeRegistry, 'close'> = {
        url: '',
        metadata: true,
        authorize: 'redirect',
        requests: [],
        tokenRequests: [],
        revoked: [],
    };

    const server: Server = createServer((request, response) => {
        void (async () => {
            const url = new URL(request.url ?? '/', fake.url);
            fake.requests.push(url.pathname);
            const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
                response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
                response.end(JSON.stringify(body));
            };

            switch (url.pathname) {
                case '/registry/.well-known/oauth-authorization-server':
                    if (!fake.metadata) {
                        json(404, { message: 'Not found' });
                        return;
                    }
                    json(200, {
                        issuer: `${fake.url}/registry`,
                        authorization_endpoint: `${fake.url}/custom/authorize`,
                        token_endpoint: `${fake.url}/custom/token`,
                        revocation_endpoint: `${fake.url}/custom/revoke`,
                        code_challenge_methods_supported: ['S256'],
                    });
                    return;
                case '/custom/authorize':
                case '/registry/oauth/authorize': {
                    const params = url.searchParams;
                    const redirectUri = params.get('redirect_uri') ?? '';
                    const redirect = new URL(redirectUri);
                    if (
                        params.get('response_type') !== 'code' ||
                        params.get('client_id') !== 'ilc-registry-cli' ||
                        params.get('code_challenge_method') !== 'S256' ||
                        !['127.0.0.1', 'localhost'].includes(redirect.hostname) ||
                        redirect.protocol !== 'http:'
                    ) {
                        json(400, { error: 'invalid_request' });
                        return;
                    }
                    redirect.searchParams.set(
                        'state',
                        fake.authorize === 'wrong-state' ? 'other' : (params.get('state') ?? ''),
                    );
                    if (fake.authorize === 'error') {
                        redirect.searchParams.set('error', 'access_denied');
                        redirect.searchParams.set('error_description', 'The user declined');
                    } else {
                        const code = `code-${codes.size + 1}`;
                        codes.set(code, { challenge: params.get('code_challenge') ?? '', redirectUri });
                        redirect.searchParams.set('code', code);
                    }
                    response.writeHead(302, { Location: redirect.toString() });
                    response.end();
                    return;
                }
                case '/custom/token':
                case '/registry/oauth/token': {
                    const body = new URLSearchParams(await readBody(request));
                    fake.tokenRequests.push(body);
                    if (fake.tokenAnswer !== undefined) {
                        json(fake.tokenAnswer.status, fake.tokenAnswer.body);
                        return;
                    }
                    const issued = codes.get(body.get('code') ?? '');
                    const verifier = body.get('code_verifier') ?? '';
                    const challenge = createHash('sha256').update(verifier).digest('base64url');
                    if (
                        body.get('grant_type') !== 'authorization_code' ||
                        issued === undefined ||
                        issued.redirectUri !== body.get('redirect_uri') ||
                        issued.challenge !== challenge
                    ) {
                        json(400, {
                            error: 'invalid_grant',
                            error_description: 'Code, verifier or redirect URI mismatch',
                        });
                        return;
                    }
                    json(200, {
                        access_token: ISSUED_TOKEN,
                        token_type: 'Bearer',
                        expires_in: EXPIRES_IN,
                        scope: 'override:sign registry:read',
                    });
                    return;
                }
                case '/custom/revoke':
                case '/registry/oauth/revoke':
                    fake.revoked.push(new URLSearchParams(await readBody(request)).get('token') ?? '');
                    response.writeHead(200).end();
                    return;
                default:
                    json(404, { message: 'Not found' });
            }
        })();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
        throw new Error('no address');
    }
    fake.url = `http://127.0.0.1:${address.port}`;

    return Object.assign(fake, {
        close: () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            }),
    });
}

function readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

/** A browser that asks the Registry to authorize and follows its redirect to the loopback server */
async function browser(url: string): Promise<void> {
    const response = await fetch(url, { redirect: 'manual' });
    const location = response.headers.get('location');
    if (response.status !== 302 || location === null) {
        throw new Error(`authorize answered ${response.status}`);
    }
    await fetch(location);
}

async function failure(promise: Promise<unknown>): Promise<RegistryError> {
    try {
        await promise;
    } catch (error) {
        if (error instanceof RegistryError) {
            return error;
        }
        throw error;
    }
    throw new Error('Expected a RegistryError');
}

/** No Keychain: the tokens of these tests live in a temporary file */
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
beforeEach(() => {
    Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
});
afterEach(() => {
    Object.defineProperty(process, 'platform', platform);
});

let fake: FakeRegistry;
let registryUrl: string;
let configHome: string;
let stdout: PassThrough;

beforeEach(async () => {
    fake = await startFakeRegistry();
    registryUrl = `${fake.url}/registry/`;
    configHome = mkdtempSync(join(tmpdir(), 'ilc-registry-sdk-'));
    vi.stubEnv('XDG_CONFIG_HOME', configHome);
    stdout = new PassThrough();
});

afterEach(async () => {
    vi.unstubAllEnvs();
    rmSync(configHome, { recursive: true, force: true });
    await fake.close();
});

describe('login', () => {
    it('logs in through the browser, stores the token and makes the cli auth send it', async () => {
        const before = Date.now();

        const result = await login({ registryUrl, openBrowser: browser, stdout });

        expect(result).toEqual({
            registryUrl: `${fake.url}/registry`,
            scopes: ['override:sign', 'registry:read'],
            expiresAt: expect.any(Date),
            storedIn: 'file',
        });
        expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + EXPIRES_IN * 1000);
        expect(readStoredToken(registryUrl)).toEqual({
            token: ISSUED_TOKEN,
            expiresAt: result.expiresAt,
            scopes: ['override:sign', 'registry:read'],
            source: 'file',
        });
        expect(resolveAuth({ type: 'cli' }, registryUrl).headers).toEqual({ Authorization: `Bearer ${ISSUED_TOKEN}` });
        expect(fake.requests).toEqual([
            '/registry/.well-known/oauth-authorization-server',
            '/custom/authorize',
            '/custom/token',
        ]);
        const tokenRequest = fake.tokenRequests[0]!;
        expect(tokenRequest.get('client_id')).toBe('ilc-registry-cli');
        expect(tokenRequest.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
        expect(tokenRequest.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    });

    it('asks for the given scopes and prints the authorize URL', async () => {
        let authorizeUrl = '';
        const output: string[] = [];
        stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()));

        await login({
            registryUrl,
            scopes: ['registry:read', 'registry:write'],
            openBrowser: (url) => {
                authorizeUrl = url;
                return browser(url);
            },
            stdout,
        });

        const params = new URL(authorizeUrl).searchParams;
        expect(params.get('scope')).toBe('registry:read registry:write');
        expect(params.get('response_type')).toBe('code');
        expect(params.get('code_challenge_method')).toBe('S256');
        expect(output.join('')).toContain(authorizeUrl);
    });

    it('falls back to the conventional endpoints without a metadata document', async () => {
        fake.metadata = false;

        await login({ registryUrl, openBrowser: browser, stdout });

        expect(fake.requests).toEqual([
            '/registry/.well-known/oauth-authorization-server',
            '/registry/oauth/authorize',
            '/registry/oauth/token',
        ]);
    });

    it('refuses a redirect with another state', async () => {
        fake.authorize = 'wrong-state';

        const error = await failure(login({ registryUrl, openBrowser: browser, stdout }));

        expect(error.code).toBe('login-failed');
        expect(error.message).toContain('state');
        expect(fake.tokenRequests).toEqual([]);
        expect(listStoredTokens()).toEqual([]);
    });

    it('reports the error the Registry redirected with', async () => {
        fake.authorize = 'error';

        const error = await failure(login({ registryUrl, openBrowser: browser, stdout }));

        expect(error).toMatchObject({ code: 'login-failed', message: 'The user declined' });
    });

    it('reports the error of the token endpoint', async () => {
        fake.tokenAnswer = { status: 400, body: { error: 'invalid_grant', error_description: 'Code expired' } };

        const error = await failure(login({ registryUrl, openBrowser: browser, stdout }));

        expect(error).toMatchObject({ code: 'login-failed', message: expect.stringContaining('Code expired') });
        expect(listStoredTokens()).toEqual([]);
    });

    it('reports a token endpoint without a usable answer as unreachable', async () => {
        fake.tokenAnswer = { status: 503, body: 'down' };

        const error = await failure(login({ registryUrl, openBrowser: browser, stdout }));

        expect(error).toMatchObject({ code: 'unreachable', message: expect.stringContaining('503') });
    });

    it('gives up after the timeout when nobody logs in', async () => {
        const error = await failure(login({ registryUrl, openBrowser: () => {}, timeoutMs: 50, stdout }));

        expect(error).toMatchObject({ code: 'login-failed', message: expect.stringContaining('No login') });
    });

    it('fails when the Registry is unreachable', async () => {
        await fake.close();

        const error = await failure(login({ registryUrl, openBrowser: browser, stdout }));

        expect(error.code).toBe('unreachable');
    });

    it('takes the redirect URL pasted into a terminal instead of the callback', async () => {
        const stdin = Object.assign(new PassThrough(), { isTTY: true });
        const openBrowser = async (url: string) => {
            const response = await fetch(url, { redirect: 'manual' });
            stdin.write(`${response.headers.get('location')}\n`);
        };

        const result = await login({ registryUrl, openBrowser, stdin, stdout });

        expect(result.scopes).toEqual(['override:sign', 'registry:read']);
        expect(readStoredToken(registryUrl)?.token).toBe(ISSUED_TOKEN);
    });
});

describe('logout', () => {
    it('revokes the stored token and removes the entry', async () => {
        await login({ registryUrl, openBrowser: browser, stdout });

        await logout({ registryUrl });

        expect(fake.revoked).toEqual([ISSUED_TOKEN]);
        expect(listStoredTokens()).toEqual([]);
    });

    it('removes the entry even when the Registry cannot be reached', async () => {
        await login({ registryUrl, openBrowser: browser, stdout });
        await fake.close();

        await logout({ registryUrl });

        expect(listStoredTokens()).toEqual([]);
    });

    it('does nothing without a stored token', async () => {
        await logout({ registryUrl });

        expect(fake.requests).toEqual([]);
    });
});
