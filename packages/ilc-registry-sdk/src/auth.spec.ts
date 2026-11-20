import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveAuth } from './auth.js';
import { saveStoredToken } from './node/token-store.js';
import { signOverrideConfig } from './signOverrideConfig.js';

const registryUrl = 'https://registry.test';

/** No Keychain: the tokens of these tests live in a temporary file */
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
beforeEach(() => {
    Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
});
afterEach(() => {
    Object.defineProperty(process, 'platform', platform);
});

describe('resolveAuth', () => {
    it('composes the Registry token from the id and the secret of an auth entity', () => {
        const strategy = resolveAuth({ type: 'token', id: 'root_api_token', secret: 'token_secret' }, registryUrl);

        expect(strategy.credentials).toBe('omit');
        expect(strategy.headers).toEqual({ Authorization: 'Bearer cm9vdF9hcGlfdG9rZW4=:dG9rZW5fc2VjcmV0' });
    });

    it('encodes non-ASCII parts as UTF-8 like the Registry decodes them', () => {
        const strategy = resolveAuth({ type: 'token', id: 'ключ', secret: 's' }, registryUrl);

        expect(strategy.headers['Authorization']).toBe(`Bearer ${Buffer.from('ключ').toString('base64')}:cw==`);
    });

    it('sends a composed bearer token as is', () => {
        const strategy = resolveAuth({ type: 'bearer', token: 'cm9vdF9hcGlfdG9rZW4=:dG9rZW5fc2VjcmV0' }, registryUrl);

        expect(strategy.credentials).toBe('omit');
        expect(strategy.headers).toEqual({ Authorization: 'Bearer cm9vdF9hcGlfdG9rZW4=:dG9rZW5fc2VjcmV0' });
    });

    it('relies on the browser cookies only for a session', () => {
        const strategy = resolveAuth({ type: 'session' }, registryUrl);

        expect(strategy.credentials).toBe('include');
        expect(strategy.headers).toEqual({});
    });
});

describe('resolveAuth for the cli token', () => {
    let configHome: string;

    beforeEach(() => {
        configHome = mkdtempSync(join(tmpdir(), 'ilc-registry-sdk-'));
        vi.stubEnv('XDG_CONFIG_HOME', configHome);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        rmSync(configHome, { recursive: true, force: true });
    });

    it('sends the stored token as a bearer without cookies', () => {
        saveStoredToken('https://registry.test', {
            token: 'opaque',
            expiresAt: inOneHour(),
            scopes: ['override:sign'],
        });

        const strategy = resolveAuth({ type: 'cli' }, 'https://registry.test/');

        expect(strategy.credentials).toBe('omit');
        expect(strategy.headers).toEqual({ Authorization: 'Bearer opaque' });
        expect(strategy.missing).toBeUndefined();
        expect(strategy.rejected).toContain('ilc-registry login --registry https://registry.test');
    });

    it('has nothing to send without a stored token and says how to log in', () => {
        const strategy = resolveAuth({ type: 'cli' }, 'https://registry.test');

        expect(strategy.headers).toEqual({});
        expect(strategy.missing).toBe(
            'No valid token is stored for https://registry.test: run `ilc-registry login --registry https://registry.test`',
        );
    });

    it('treats an expired token as none', () => {
        saveStoredToken('https://registry.test', { token: 'old', expiresAt: new Date(Date.now() - 1), scopes: [] });

        expect(resolveAuth({ type: 'cli' }, 'https://registry.test').missing).toBeDefined();
    });

    it('makes the signing call unauthorized without asking the Registry', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>();
        vi.stubGlobal('fetch', fetch);

        const outcome = await signOverrideConfig('%7B%7D', {
            registryUrl: 'https://registry.test',
            auth: { type: 'cli' },
        });

        expect(outcome).toEqual({ kind: 'unauthorized', message: expect.stringContaining('ilc-registry login') });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('tells the user to log in again when the Registry rejects the stored token', async () => {
        saveStoredToken('https://registry.test', { token: 'revoked', expiresAt: inOneHour(), scopes: [] });
        vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('', { status: 401 })));

        const outcome = await signOverrideConfig('%7B%7D', {
            registryUrl: 'https://registry.test',
            auth: { type: 'cli' },
        });

        expect(outcome).toEqual({ kind: 'unauthorized', message: expect.stringContaining('again') });
    });
});

function inOneHour(): Date {
    return new Date(Date.now() + 3_600_000);
}
