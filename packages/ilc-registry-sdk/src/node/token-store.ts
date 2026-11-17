/**
 * Where `ilc-registry login` keeps its tokens, and where `auth: { type: 'cli' }` reads them from. The token itself
 * is in the macOS Keychain when it was available at login, in the token file otherwise. The file always holds the
 * expiry, the scopes and where the token is, and that entry decides which source is read, so a stale Keychain item
 * can never stand in for a newer token in the file. The token is in one place only. Node only; a browser bundle gets `token-store.unsupported.ts`
 * through the package's `#token-store` import instead.
 */
import { HomeFileSource, tokenFilePath, type StoredIn } from './sources/home-file.js';
import { MacosKeychainSource } from './sources/macos-keychain.js';
import type { TokenSource, TokenSourceId } from './sources/token-source.js';

export { tokenFilePath } from './sources/home-file.js';
export type { StoredIn } from './sources/home-file.js';
export type { TokenSourceId } from './sources/token-source.js';

/** A token as `readStoredToken` resolves it */
export interface StoredToken {
    token: string;
    /** When the Registry stops accepting the token */
    expiresAt: Date;
    /** The scopes the Registry granted */
    scopes: string[];
    /** Where the token came from */
    source: TokenSourceId;
}

/** What `login` hands over for storing */
export interface TokenToStore {
    token: string;
    expiresAt: Date;
    scopes: string[];
}

/** What the token file knows about a Registry, never the token itself */
export interface StoredTokenEntry {
    registryUrl: string;
    expiresAt: Date;
    scopes: string[];
    storedIn: StoredIn;
}

export interface TokenStoreSources {
    keychain: MacosKeychainSource;
    file: HomeFileSource;
}

/** The key of a Registry URL in every source: origin plus path, without a trailing slash, query or fragment */
export function normalizeRegistryUrl(registryUrl: string): string {
    let url: URL;
    try {
        url = new URL(registryUrl);
    } catch {
        throw new TypeError(`Registry URL must be absolute, got "${registryUrl}"`);
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export class TokenStore {
    private readonly keychain: MacosKeychainSource;
    private readonly file: HomeFileSource;

    constructor(sources: Partial<TokenStoreSources> = {}) {
        this.keychain = sources.keychain ?? new MacosKeychainSource();
        this.file = sources.file ?? new HomeFileSource();
    }

    /**
     * The token for the Registry, from the source its file entry names; absent without an entry, once expired, or
     * when that source no longer has it. Nothing is cached, so a login in another process is seen at once.
     */
    read(registryUrl: string): StoredToken | undefined {
        const key = normalizeRegistryUrl(registryUrl);
        const entry = this.file.readEntry(key);
        if (entry === undefined) {
            return undefined;
        }
        const expiresAt = new Date(entry.expiresAt);
        if (expiresAt.getTime() <= Date.now()) {
            return undefined;
        }
        const source: TokenSource = entry.storedIn === 'keychain' ? this.keychain : this.file;
        const token = source.read(key);
        if (token === undefined) {
            return undefined;
        }
        return { token, expiresAt, scopes: entry.scopes, source: source.id };
    }

    /** Every Registry the file knows, expired ones included, with where its token is */
    list(): StoredTokenEntry[] {
        return Object.entries(this.file.readAll()).map(([registryUrl, entry]) => ({
            registryUrl,
            expiresAt: new Date(entry.expiresAt),
            scopes: entry.scopes,
            storedIn: entry.storedIn,
        }));
    }

    /**
     * Stores the token in the Keychain when it is available, in the file otherwise, and the expiry and the scopes in
     * the file either way; says where the token went
     */
    write(registryUrl: string, stored: TokenToStore): StoredIn {
        const key = normalizeRegistryUrl(registryUrl);
        const metadata = { expiresAt: stored.expiresAt.toISOString(), scopes: stored.scopes };
        if (this.keychain.isAvailable()) {
            try {
                this.keychain.write(key, stored.token);
                this.file.writeEntry(key, { ...metadata, storedIn: 'keychain' });
                return 'keychain';
            } catch {
                // A Keychain that refuses, locked for example: the file takes the token, as on other platforms. An
                // older item is removed when the Keychain allows it, and the entry's `storedIn` keeps it out of reads
                // either way.
                this.keychain.clear(key);
            }
        }
        this.file.writeEntry(key, { ...metadata, token: stored.token, storedIn: 'file' });
        return 'file';
    }

    /** Forgets the token of the Registry everywhere it could be stored */
    clear(registryUrl: string): void {
        const key = normalizeRegistryUrl(registryUrl);
        this.keychain.clear(key);
        this.file.removeEntry(key);
    }
}

const defaultStore = new TokenStore();

/** The token stored for the Registry, when there is one and it has not expired */
export function readStoredToken(registryUrl: string): StoredToken | undefined {
    return defaultStore.read(registryUrl);
}

/** Every Registry with a stored token, expired ones included */
export function listStoredTokens(): StoredTokenEntry[] {
    return defaultStore.list();
}

/** Stores the token for the Registry, replacing any earlier one; says whether it went to the Keychain or the file */
export function saveStoredToken(registryUrl: string, stored: TokenToStore): StoredIn {
    return defaultStore.write(registryUrl, stored);
}

/** Forgets the token stored for the Registry, in the Keychain and in the file */
export function removeStoredToken(registryUrl: string): void {
    defaultStore.clear(registryUrl);
}

/** Where a stored token is, for messages: the file path, or the Keychain item */
export function describeStorage(storedIn: StoredIn): string {
    return storedIn === 'keychain' ? 'the macOS Keychain (service ilc-registry)' : tokenFilePath();
}
