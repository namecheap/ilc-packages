import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { HomeFileSource, tokenFilePath, type FileEntry } from './home-file.js';

const posix = process.platform !== 'win32';
const registryUrl = 'https://registry.test';
const entry: FileEntry = {
    token: 'opaque',
    expiresAt: '2030-01-01T00:00:00.000Z',
    scopes: ['override:sign'],
    storedIn: 'file',
};

let configHome: string;
let source: HomeFileSource;

beforeEach(() => {
    configHome = mkdtempSync(join(tmpdir(), 'ilc-registry-sdk-'));
    vi.stubEnv('XDG_CONFIG_HOME', configHome);
    source = new HomeFileSource();
});

afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(configHome, { recursive: true, force: true });
});

describe('tokenFilePath', () => {
    it('is under XDG_CONFIG_HOME when set', () => {
        expect(tokenFilePath()).toBe(join(configHome, 'ilc-registry', 'tokens.json'));
    });

    it('is under ~/.config otherwise', () => {
        vi.stubEnv('XDG_CONFIG_HOME', '');

        expect(tokenFilePath()).toMatch(/[\\/]\.config[\\/]ilc-registry[\\/]tokens\.json$/);
    });
});

describe('HomeFileSource', () => {
    it('writes the entry as JSON under the Registry URL', () => {
        const path = source.writeEntry(registryUrl, entry);

        expect(path).toBe(tokenFilePath());
        expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ [registryUrl]: entry });
    });

    it.skipIf(!posix)('creates the file for its owner only, in a directory of its own', () => {
        const path = source.writeEntry(registryUrl, entry);

        expect(statSync(path).mode & 0o777).toBe(0o600);
        expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    });

    it('reads the token of an entry, and nothing for an entry without one', () => {
        source.writeEntry(registryUrl, entry);
        source.writeEntry('https://keychain.test', { expiresAt: entry.expiresAt, scopes: [], storedIn: 'keychain' });

        expect(source.read(registryUrl)).toBe('opaque');
        expect(source.read('https://keychain.test')).toBeUndefined();
        expect(source.readEntry('https://keychain.test')).toEqual({
            expiresAt: entry.expiresAt,
            scopes: [],
            storedIn: 'keychain',
        });
        expect(source.read('https://unknown.test')).toBeUndefined();
    });

    it('replaces the entry of a Registry and keeps the others', () => {
        source.writeEntry(registryUrl, entry);
        source.writeEntry('https://other.test', entry);
        source.writeEntry(registryUrl, { ...entry, token: 'newer' });

        expect(Object.keys(source.readAll())).toEqual([registryUrl, 'https://other.test']);
        expect(source.read(registryUrl)).toBe('newer');
    });

    it('leaves no temporary file behind', () => {
        const path = source.writeEntry(registryUrl, entry);
        source.writeEntry('https://other.test', entry);

        expect(readdirSync(dirname(path))).toEqual(['tokens.json']);
    });

    it.skipIf(!posix)('replaces the file in one step instead of rewriting it in place', () => {
        const path = source.writeEntry(registryUrl, entry);
        const before = statSync(path).ino;

        source.writeEntry('https://other.test', entry);

        expect(statSync(path).ino).not.toBe(before);
    });

    it('removes an entry and says whether there was one', () => {
        source.writeEntry(registryUrl, entry);

        expect(source.removeEntry(registryUrl)).toBe(true);
        expect(source.removeEntry(registryUrl)).toBe(false);
        expect(source.readAll()).toEqual({});
    });

    it('reads a missing file as empty', () => {
        expect(source.readAll()).toEqual({});
    });

    it('skips an entry of another shape', () => {
        const path = source.writeEntry(registryUrl, entry);
        const entries = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
        entries['https://broken.test'] = { token: 7, expiresAt: entry.expiresAt, scopes: [], storedIn: 'file' };
        entries['https://nowhere.test'] = { expiresAt: entry.expiresAt, scopes: [], storedIn: 'cloud' };
        writeFileSync(path, JSON.stringify(entries));

        expect(Object.keys(source.readAll())).toEqual([registryUrl]);
    });

    it('reads a file that is not JSON as empty', () => {
        mkdirSync(dirname(tokenFilePath()), { recursive: true });
        writeFileSync(tokenFilePath(), '{');

        expect(source.readAll()).toEqual({});
    });
});
