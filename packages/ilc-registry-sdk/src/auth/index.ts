/**
 * ilc-registry-sdk/auth: the CLI login against the Registry and the token store it writes. Node only, since the
 * store uses `node:fs` and `node:child_process` and the login starts a loopback HTTP server; the root entry point
 * stays usable in a browser bundle.
 *
 * The token store functions are wrapped here rather than re-exported, so the published declarations name the store
 * by its file and not by the package's `#token-store` import alias, which older module resolvers cannot follow.
 */
import * as tokenStore from '#token-store';
import type { StoredToken, StoredTokenEntry } from '../node/token-store.js';

export { login, DEFAULT_LOGIN_TIMEOUT_MS, type LoginOptions, type LoginResult } from './login.js';
export { logout, type LogoutOptions } from './logout.js';
export type { StoredIn, StoredToken, StoredTokenEntry, TokenSourceId } from '../node/token-store.js';

/** The token stored for the Registry, when there is one and it has not expired */
export function readStoredToken(registryUrl: string): StoredToken | undefined {
    return tokenStore.readStoredToken(registryUrl);
}

/** Every Registry with a stored token, expired ones included; never the token itself */
export function listStoredTokens(): StoredTokenEntry[] {
    return tokenStore.listStoredTokens();
}

/** The file that keeps the tokens' metadata, and the tokens themselves where no Keychain is available */
export function tokenFilePath(): string {
    return tokenStore.tokenFilePath();
}
