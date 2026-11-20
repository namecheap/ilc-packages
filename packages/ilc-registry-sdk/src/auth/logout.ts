/** `ilc-registry logout`: revokes the stored token at the Registry when it can, and forgets it everywhere either way */
import { CLI_CLIENT_ID } from '../constants.js';
import { normalizeRegistryUrl, readStoredToken, removeStoredToken } from '#token-store';
import { discoverEndpoints } from './endpoints.js';

export interface LogoutOptions {
    /** Origin of the Registry, with its base path when it has one, for example `https://registry.example.com` */
    registryUrl: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Revokes the token stored for the Registry, best effort, then removes it from the Keychain and the token file.
 */
export async function logout(options: LogoutOptions): Promise<void> {
    const registryUrl = normalizeRegistryUrl(options.registryUrl);
    const stored = readStoredToken(registryUrl);
    if (stored !== undefined) {
        await revoke(registryUrl, stored.token);
    }
    removeStoredToken(registryUrl);
}

/** RFC 7009: the Registry answers 200 whether or not it knew the token, and a failure here changes nothing */
async function revoke(registryUrl: string, token: string): Promise<void> {
    try {
        const endpoints = await discoverEndpoints(registryUrl, REQUEST_TIMEOUT_MS);
        await fetch(endpoints.revocation, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token, client_id: CLI_CLIENT_ID }).toString(),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        // The token expires on its own; the file entry is removed either way
    }
}
