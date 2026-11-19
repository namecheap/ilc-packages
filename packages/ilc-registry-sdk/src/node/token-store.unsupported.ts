/**
 * What a bundle for a browser gets as `#token-store`: the same functions, each refusing, since the token store needs
 * `node:fs` and `node:child_process`. The `cli` auth type is for Node, and only selecting it reaches these.
 */
type TokenStore = typeof import('./token-store.js');

export type { StoredIn, StoredToken, StoredTokenEntry, TokenSourceId, TokenToStore } from './token-store.js';

function unsupported(): never {
    throw new Error('The cli auth type needs Node: the token of `ilc-registry login` is read with node:fs');
}

export const tokenFilePath: TokenStore['tokenFilePath'] = unsupported;
export const normalizeRegistryUrl: TokenStore['normalizeRegistryUrl'] = unsupported;
export const readStoredToken: TokenStore['readStoredToken'] = unsupported;
export const listStoredTokens: TokenStore['listStoredTokens'] = unsupported;
export const saveStoredToken: TokenStore['saveStoredToken'] = unsupported;
export const removeStoredToken: TokenStore['removeStoredToken'] = unsupported;
export const describeStorage: TokenStore['describeStorage'] = unsupported;
