import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HomeFileSource } from './sources/home-file.js';
import { MacosKeychainSource, SECURITY_BINARY } from './sources/macos-keychain.js';
import { normalizeRegistryUrl, TokenStore } from './token-store.js';

const registryUrl = 'https://registry.test';
const inOneHour = () => new Date(Date.now() + 3_600_000);

/** A Keychain that keeps its items in a map, or none when the platform has no Keychain */
function fakeKeychain(platform: NodeJS.Platform = 'darwin', items = new Map<string, string>()) {
    const source = new MacosKeychainSource({
        getPlatform: () => platform,
        existsSync: (path) => path === SECURITY_BINARY,
        execFileSync: ((_file: string, args: string[]) => {
            const account = args[args.indexOf('-a') + 1] ?? '';
            switch (args[0]) {
                case 'add-generic-password':
                    items.set(account, args[args.indexOf('-w') + 1] ?? '');
                    return '';
                case 'find-generic-password': {
                    const item = items.get(account);
                    if (item === undefined) {
                        throw Object.assign(new Error('not found'), { status: 44 });
                    }
                    return `${item}\n`;
                }
                case 'delete-generic-password':
                    items.delete(account);
                    return '';
                default:
                    throw new Error(`unexpected ${args[0]}`);
            }
        }) as unknown as typeof import('node:child_process').execFileSync,
    });
    return { source, items };
}

let configHome: string;
let file: HomeFileSource;

beforeEach(() => {
    configHome = mkdtempSync(join(tmpdir(), 'ilc-registry-sdk-'));
    vi.stubEnv('XDG_CONFIG_HOME', configHome);
    file = new HomeFileSource();
});

afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(configHome, { recursive: true, force: true });
});

describe('normalizeRegistryUrl', () => {
    it('keeps the origin and the path without a trailing slash, query or fragment', () => {
        expect(normalizeRegistryUrl('HTTPS://Registry.Test:443/base/?x=1#f')).toBe('https://registry.test/base');
        expect(normalizeRegistryUrl('https://registry.test/')).toBe('https://registry.test');
        expect(normalizeRegistryUrl('http://127.0.0.1:4001')).toBe('http://127.0.0.1:4001');
    });

    it('rejects a relative URL', () => {
        expect(() => normalizeRegistryUrl('registry.test')).toThrow(TypeError);
    });
});

describe('TokenStore', () => {
    it('stores the token in the Keychain and only the metadata in the file when the Keychain is available', () => {
        const keychain = fakeKeychain();
        const store = new TokenStore({ keychain: keychain.source, file });
        const expiresAt = inOneHour();

        expect(store.write('https://registry.test/', { token: 'secret', expiresAt, scopes: ['override:sign'] })).toBe(
            'keychain',
        );

        expect(keychain.items.get(registryUrl)).toBe('secret');
        expect(file.readEntry(registryUrl)).toEqual({
            expiresAt: expiresAt.toISOString(),
            scopes: ['override:sign'],
            storedIn: 'keychain',
        });
        expect(store.read(registryUrl)).toEqual({
            token: 'secret',
            expiresAt,
            scopes: ['override:sign'],
            source: 'keychain',
        });
    });

    it('removes the token copy from the file once the Keychain holds it', () => {
        const items = new Map<string, string>();
        const withoutKeychain = new TokenStore({
            keychain: fakeKeychain('linux', items).source,
            file,
        });
        withoutKeychain.write(registryUrl, { token: 'secret', expiresAt: inOneHour(), scopes: [] });
        expect(file.read(registryUrl)).toBe('secret');

        const withKeychain = new TokenStore({
            keychain: fakeKeychain('darwin', items).source,
            file,
        });
        withKeychain.write(registryUrl, { token: 'newer', expiresAt: inOneHour(), scopes: [] });

        expect(file.read(registryUrl)).toBeUndefined();
        expect(file.readEntry(registryUrl)?.storedIn).toBe('keychain');
        expect(items.get(registryUrl)).toBe('newer');
    });

    it('stores the token in the file where the Keychain is not available', () => {
        const store = new TokenStore({ keychain: fakeKeychain('linux').source, file });
        const expiresAt = inOneHour();

        expect(store.write(registryUrl, { token: 'secret', expiresAt, scopes: ['override:sign'] })).toBe('file');

        expect(file.readEntry(registryUrl)).toEqual({
            token: 'secret',
            expiresAt: expiresAt.toISOString(),
            scopes: ['override:sign'],
            storedIn: 'file',
        });
        expect(store.read(registryUrl)).toEqual({
            token: 'secret',
            expiresAt,
            scopes: ['override:sign'],
            source: 'file',
        });
    });

    it('falls back to the file when the Keychain refuses the write, and an old item there never wins', () => {
        // The Keychain still answers reads and deletes, but refuses to add or replace an item
        const items = new Map([[registryUrl, 'stale']]);
        const keychain = new MacosKeychainSource({
            getPlatform: () => 'darwin',
            existsSync: () => true,
            execFileSync: ((_file: string, args: string[]) => {
                if (args[0] === 'add-generic-password') {
                    throw new Error('User interaction is not allowed.');
                }
                if (args[0] === 'delete-generic-password') {
                    items.delete(registryUrl);
                    return '';
                }
                return `${items.get(registryUrl) ?? ''}\n`;
            }) as unknown as typeof import('node:child_process').execFileSync,
        });
        const store = new TokenStore({ keychain, file });

        expect(store.write(registryUrl, { token: 'secret', expiresAt: inOneHour(), scopes: [] })).toBe('file');

        expect(file.read(registryUrl)).toBe('secret');
        expect(items.has(registryUrl), 'the stale Keychain item is removed').toBe(false);
        expect(store.read(registryUrl)).toMatchObject({ token: 'secret', source: 'file' });
    });

    it('reads the token from the source the file entry names, whatever the other source holds', () => {
        const items = new Map([[registryUrl, 'from-keychain']]);
        const store = new TokenStore({ keychain: fakeKeychain('darwin', items).source, file });
        file.writeEntry(registryUrl, {
            token: 'from-file',
            expiresAt: inOneHour().toISOString(),
            scopes: ['override:sign'],
            storedIn: 'file',
        });
        expect(store.read(registryUrl)).toMatchObject({ token: 'from-file', source: 'file' });

        file.writeEntry(registryUrl, { expiresAt: inOneHour().toISOString(), scopes: [], storedIn: 'keychain' });
        expect(store.read(registryUrl)).toMatchObject({ token: 'from-keychain', source: 'keychain' });

        // The entry says Keychain but the item is gone: absent, not the file's leftover
        items.delete(registryUrl);
        expect(store.read(registryUrl)).toBeUndefined();
    });

    it('sees a token that another process stored, without any restart', () => {
        const items = new Map<string, string>();
        const store = new TokenStore({ keychain: fakeKeychain('darwin', items).source, file });
        expect(store.read(registryUrl)).toBeUndefined();

        // `ilc-registry login` in another process
        new TokenStore({ keychain: fakeKeychain('darwin', items).source, file }).write(registryUrl, {
            token: 'fresh',
            expiresAt: inOneHour(),
            scopes: ['override:sign'],
        });

        expect(store.read(registryUrl)).toMatchObject({ token: 'fresh', source: 'keychain' });
    });

    it('reads an expired token as absent wherever it is, while the listing still shows it', () => {
        const keychain = fakeKeychain();
        const store = new TokenStore({ keychain: keychain.source, file });
        store.write(registryUrl, {
            token: 'secret',
            expiresAt: new Date(Date.now() - 1000),
            scopes: ['override:sign'],
        });
        const withoutKeychain = new TokenStore({
            keychain: fakeKeychain('linux').source,
            file,
        });
        withoutKeychain.write('https://other.test', {
            token: 'secret',
            expiresAt: new Date(Date.now() - 1000),
            scopes: [],
        });

        expect(store.read(registryUrl)).toBeUndefined();
        expect(withoutKeychain.read('https://other.test')).toBeUndefined();
        expect(store.list()).toEqual([
            { registryUrl, expiresAt: expect.any(Date), scopes: ['override:sign'], storedIn: 'keychain' },
            { registryUrl: 'https://other.test', expiresAt: expect.any(Date), scopes: [], storedIn: 'file' },
        ]);
    });

    it('reads a Keychain item the file knows nothing about as absent', () => {
        const keychain = fakeKeychain('darwin', new Map([[registryUrl, 'orphan']]));
        const store = new TokenStore({ keychain: keychain.source, file });

        expect(store.read(registryUrl)).toBeUndefined();
    });

    it('clears the Keychain and the file', () => {
        const keychain = fakeKeychain();
        const store = new TokenStore({ keychain: keychain.source, file });
        store.write(registryUrl, { token: 'secret', expiresAt: inOneHour(), scopes: [] });

        store.clear('https://registry.test/');

        expect(keychain.items.size).toBe(0);
        expect(file.readAll()).toEqual({});
        expect(store.read(registryUrl)).toBeUndefined();
    });
});
