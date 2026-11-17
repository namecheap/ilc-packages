/**
 * The macOS login Keychain through `/usr/bin/security`: service `ilc-registry`, one account per Registry URL.
 * Available on darwin when the binary exists. Reads are cached: one `security` call per Registry and process.
 *
 * Accepted trade-off: the token goes to `add-generic-password` as `-w <value>`, since the command has no mode that
 * reads the password from stdin, so it is visible in argv to processes of the same user for the time of the call.
 * A same-user process can read the Keychain through `security` anyway, so this widens nothing.
 */
import { execFileSync as nodeExecFileSync } from 'node:child_process';
import { existsSync as nodeExistsSync } from 'node:fs';

import type { TokenSource } from './token-source.js';

export const SECURITY_BINARY = '/usr/bin/security';
export const KEYCHAIN_SERVICE = 'ilc-registry';
/** What `find-generic-password` exits with when there is no such item */
export const NOT_FOUND_STATUS = 44;
const TIMEOUT_MS = 5000;

export interface KeychainDeps {
    execFileSync: typeof nodeExecFileSync;
    existsSync: typeof nodeExistsSync;
    getPlatform: () => NodeJS.Platform;
}

const DEFAULT_DEPS: KeychainDeps = {
    execFileSync: nodeExecFileSync,
    existsSync: nodeExistsSync,
    getPlatform: () => process.platform,
};

export class MacosKeychainSource implements TokenSource {
    readonly id = 'keychain';

    private readonly deps: KeychainDeps;
    /** The last read per Registry URL; a key is present once the Keychain was asked */
    private readonly cache = new Map<string, string | undefined>();

    constructor(deps: Partial<KeychainDeps> = {}) {
        this.deps = { ...DEFAULT_DEPS, ...deps };
    }

    isAvailable(): boolean {
        return this.deps.getPlatform() === 'darwin' && this.deps.existsSync(SECURITY_BINARY);
    }

    read(registryUrl: string): string | undefined {
        if (!this.isAvailable()) {
            return undefined;
        }
        if (this.cache.has(registryUrl)) {
            return this.cache.get(registryUrl);
        }
        const value = this.find(registryUrl);
        this.cache.set(registryUrl, value);
        return value;
    }

    /** Adds or replaces the item; throws when the Keychain is not available or refuses */
    write(registryUrl: string, token: string): void {
        if (!this.isAvailable()) {
            throw new Error('The macOS Keychain is not available on this platform');
        }
        this.security(['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', registryUrl, '-w', token]);
        this.cache.set(registryUrl, token);
    }

    /** Removes the item; an absent item or an unavailable Keychain is not a failure */
    clear(registryUrl: string): void {
        if (!this.isAvailable()) {
            return;
        }
        try {
            this.security(['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', registryUrl]);
        } catch {
            // Absent, or already cleared
        }
        this.cache.set(registryUrl, undefined);
    }

    private find(registryUrl: string): string | undefined {
        try {
            const output = this.security(['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', registryUrl, '-w']);
            return output.replace(/\n$/, '');
        } catch {
            // Exit 44 is "not found"; a locked Keychain or any other failure reads as absent too, so the store
            // goes on to the next source
            return undefined;
        }
    }

    private security(args: string[]): string {
        return this.deps.execFileSync(SECURITY_BINARY, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: 'utf8',
            timeout: TIMEOUT_MS,
        });
    }
}
