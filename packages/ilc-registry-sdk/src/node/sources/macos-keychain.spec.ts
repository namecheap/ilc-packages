import {
    KEYCHAIN_SERVICE,
    MacosKeychainSource,
    NOT_FOUND_STATUS,
    SECURITY_BINARY,
    type KeychainDeps,
} from './macos-keychain.js';

const registryUrl = 'https://registry.test';

/** A source over a fake `security` that answers each call from `security(args)` */
function fakes(platform: NodeJS.Platform = 'darwin', security: (args: readonly string[]) => string = () => '') {
    const execFileSync = vi.fn((_file: string, args: readonly string[]) => security(args));
    const source = new MacosKeychainSource({
        execFileSync: execFileSync as unknown as KeychainDeps['execFileSync'],
        existsSync: (path) => path === SECURITY_BINARY,
        getPlatform: () => platform,
    });
    return { execFileSync, source };
}

function notFound(): never {
    throw Object.assign(new Error('The specified item could not be found in the keychain.'), {
        status: NOT_FOUND_STATUS,
    });
}

describe('MacosKeychainSource', () => {
    it('is available on darwin with the security binary only', () => {
        expect(fakes('darwin').source.isAvailable()).toBe(true);
        expect(fakes('linux').source.isAvailable()).toBe(false);
        expect(new MacosKeychainSource({ getPlatform: () => 'darwin', existsSync: () => false }).isAvailable()).toBe(
            false,
        );
    });

    it('writes the token as a generic password of the ilc-registry service, one account per Registry', () => {
        const { execFileSync, source } = fakes();

        source.write(registryUrl, 'opaque');

        expect(execFileSync).toHaveBeenCalledWith(
            SECURITY_BINARY,
            ['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', registryUrl, '-w', 'opaque'],
            { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 5000 },
        );
    });

    it('reads the password without its trailing newline and asks the Keychain once per Registry', () => {
        const { execFileSync, source } = fakes('darwin', (args) =>
            args[0] === 'find-generic-password' ? 'opaque\n' : '',
        );

        expect(source.read(registryUrl)).toBe('opaque');
        expect(source.read(registryUrl)).toBe('opaque');
        expect(source.read('https://other.test')).toBe('opaque');

        expect(execFileSync).toHaveBeenCalledTimes(2);
        expect(execFileSync).toHaveBeenCalledWith(
            SECURITY_BINARY,
            ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', registryUrl, '-w'],
            expect.objectContaining({ timeout: 5000 }),
        );
    });

    it('reads a missing item as absent, and caches that too', () => {
        const { execFileSync, source } = fakes('darwin', notFound);

        expect(source.read(registryUrl)).toBeUndefined();
        expect(source.read(registryUrl)).toBeUndefined();
        expect(execFileSync).toHaveBeenCalledTimes(1);
    });

    it('reads any other failure as absent', () => {
        const { source } = fakes('darwin', () => {
            throw new Error('User interaction is not allowed.');
        });

        expect(source.read(registryUrl)).toBeUndefined();
    });

    it('serves a written token from the cache', () => {
        const { execFileSync, source } = fakes();

        source.write(registryUrl, 'opaque');

        expect(source.read(registryUrl)).toBe('opaque');
        expect(execFileSync).toHaveBeenCalledTimes(1);
    });

    it('does nothing on another platform, and refuses to write there', () => {
        const { execFileSync, source } = fakes('linux');

        expect(source.read(registryUrl)).toBeUndefined();
        source.clear(registryUrl);
        expect(() => source.write(registryUrl, 'opaque')).toThrow('not available');
        expect(execFileSync).not.toHaveBeenCalled();
    });

    it('clears the item and forgets the cached value; a missing item is not a failure', () => {
        const { execFileSync, source } = fakes('darwin', (args) =>
            args[0] === 'delete-generic-password' ? notFound() : 'x',
        );
        source.read(registryUrl);

        source.clear(registryUrl);

        expect(execFileSync).toHaveBeenCalledWith(
            SECURITY_BINARY,
            ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', registryUrl],
            expect.objectContaining({ timeout: 5000 }),
        );
        expect(source.read(registryUrl)).toBeUndefined();
        expect(execFileSync).toHaveBeenCalledTimes(2);
    });
});
