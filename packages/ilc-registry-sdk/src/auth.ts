/**
 * How a client proves who it is to the Registry. Plain data: the signing call picks the strategy from `type` and the
 * caller never sees the mechanism.
 */
import { readStoredToken } from '#token-store';

export type Auth =
    /** The id and secret of a Registry auth entity, for scripts and services; sent as a bearer token, no cookies */
    | { type: 'token'; id: string; secret: string }
    /** A Registry bearer token already composed, `base64(id):base64(secret)`, for a caller that holds the token */
    | { type: 'bearer'; token: string }
    /** The Registry session of the browser the code runs in, as in the ILC Overrides extension */
    | { type: 'session' }
    /** The token saved by `ilc-registry login` for this Registry URL, read from the owner-only token file */
    | { type: 'cli' };

/** What the signing call needs from an `Auth` */
export interface AuthStrategy {
    headers: Record<string, string>;
    credentials: RequestCredentials;
    /**
     * Set when the strategy found no credentials to send, with what the caller should do about it: the request is
     * not sent, and reports `unauthorized` with this message.
     */
    missing?: string;
    /** What to tell the caller when the Registry did not accept the credentials, when the strategy knows a remedy */
    rejected?: string;
    /**
     * Called once when the Registry answered that the request was not authenticated. Returns `true` when the request
     * should be sent again, for example after a new login.
     */
    recover?(): Promise<boolean>;
}

export function resolveAuth(auth: Auth, registryUrl: string): AuthStrategy {
    switch (auth.type) {
        case 'token':
            return {
                credentials: 'omit',
                headers: { Authorization: `Bearer ${base64(auth.id)}:${base64(auth.secret)}` },
            };
        case 'bearer':
            return { credentials: 'omit', headers: { Authorization: `Bearer ${auth.token}` } };
        case 'session':
            return { credentials: 'include', headers: {} };
        case 'cli':
            return cliStrategy(registryUrl);
    }
}

/** The token `ilc-registry login` stored for the Registry; without one the call fails before reaching the Registry */
function cliStrategy(registryUrl: string): AuthStrategy {
    const loginCommand = `ilc-registry login --registry ${registryUrl}`;
    const stored = readStoredToken(registryUrl);
    if (stored === undefined) {
        return {
            credentials: 'omit',
            headers: {},
            missing: `No valid token is stored for ${registryUrl}: run \`${loginCommand}\``,
        };
    }
    return {
        credentials: 'omit',
        headers: { Authorization: `Bearer ${stored.token}` },
        rejected: `The Registry did not accept the stored token: run \`${loginCommand}\` again`,
    };
}

/** Base64 of the UTF-8 bytes, the way the Registry decodes the token parts; works in Node and in browsers */
function base64(text: string): string {
    return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}
