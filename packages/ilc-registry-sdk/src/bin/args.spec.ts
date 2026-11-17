import { parseCliArgs, UsageError } from './args.js';

const env = {};

describe('parseCliArgs', () => {
    it('parses a login with the default scope', () => {
        expect(parseCliArgs(['login', '--registry', 'https://registry.test'], env)).toEqual({
            command: 'login',
            registryUrl: 'https://registry.test',
            scopes: ['override:sign'],
        });
    });

    it('collects repeated scopes', () => {
        expect(
            parseCliArgs(
                ['login', '--registry', 'https://r.test', '--scope', 'registry:read', '--scope=registry:write'],
                env,
            ),
        ).toMatchObject({ scopes: ['registry:read', 'registry:write'] });
    });

    it('takes the Registry URL from the environment', () => {
        expect(parseCliArgs(['logout'], { ILC_REGISTRY_URL: 'https://env.test' })).toEqual({
            command: 'logout',
            registryUrl: 'https://env.test',
        });
        expect(
            parseCliArgs(['logout', '--registry', 'https://flag.test'], { ILC_REGISTRY_URL: 'https://env.test' }),
        ).toEqual({ command: 'logout', registryUrl: 'https://flag.test' });
    });

    it('lets status run without a Registry URL', () => {
        expect(parseCliArgs(['status'], env)).toEqual({ command: 'status' });
        expect(parseCliArgs(['status', '--registry', 'https://r.test'], env)).toEqual({
            command: 'status',
            registryUrl: 'https://r.test',
        });
    });

    it('returns help for --help and -h', () => {
        expect(parseCliArgs(['--help'], env)).toEqual({ command: 'help' });
        expect(parseCliArgs(['login', '-h'], env)).toEqual({ command: 'help' });
    });

    it.each([
        ['no command', []],
        ['an unknown command', ['frob']],
        ['an unknown option', ['status', '--verbose']],
        ['a stray argument', ['status', 'extra']],
        ['a login without a Registry URL', ['login']],
    ])('rejects %s', (_name, argv) => {
        expect(() => parseCliArgs(argv, env)).toThrow(UsageError);
    });
});
