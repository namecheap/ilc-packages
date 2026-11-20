/** The command line of `ilc-registry`, parsed without dependencies */
import { parseArgs } from 'node:util';

import { DEFAULT_CLI_SCOPE } from '../constants.js';

export type CliCommand =
    | { command: 'login'; registryUrl: string; scopes: string[] }
    | { command: 'logout'; registryUrl: string }
    | { command: 'status'; registryUrl?: string }
    | { command: 'help' };

/** A command line the CLI cannot act on; the message goes to stderr with the usage */
export class UsageError extends Error {
    override readonly name = 'UsageError';
}

export const USAGE = `Usage: ilc-registry <command> [options]

Commands:
    login     Log in to the Registry in the browser and store the token
    logout    Revoke the stored token and remove it
    status    Show the stored tokens

Options:
    --registry <url>    The Registry URL; defaults to ILC_REGISTRY_URL
    --scope <scope>     A scope to ask for on login, repeatable; ${DEFAULT_CLI_SCOPE} by default
    -h, --help          Show this help
`;

/** Parses the arguments after the command name; `env` supplies `ILC_REGISTRY_URL` */
export function parseCliArgs(argv: string[], env: Record<string, string | undefined> = process.env): CliCommand {
    let parsed: ReturnType<typeof parseArgs<typeof config>>;
    try {
        parsed = parseArgs({ ...config, args: argv });
    } catch (error) {
        throw new UsageError(error instanceof Error ? error.message : String(error));
    }
    const { values, positionals } = parsed;
    if (values.help === true) {
        return { command: 'help' };
    }
    const [command, ...rest] = positionals;
    if (rest.length > 0) {
        throw new UsageError(`Unexpected argument: ${rest.join(' ')}`);
    }
    const registryUrl = values.registry ?? env['ILC_REGISTRY_URL'];

    switch (command) {
        case 'login':
            return {
                command,
                registryUrl: requireRegistry(registryUrl),
                scopes: values.scope !== undefined && values.scope.length > 0 ? values.scope : [DEFAULT_CLI_SCOPE],
            };
        case 'logout':
            return { command, registryUrl: requireRegistry(registryUrl) };
        case 'status':
            return registryUrl === undefined ? { command } : { command, registryUrl };
        case undefined:
            throw new UsageError('No command given');
        default:
            throw new UsageError(`Unknown command: ${command}`);
    }
}

const config = {
    options: {
        registry: { type: 'string' },
        scope: { type: 'string', multiple: true },
        help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
} as const;

function requireRegistry(registryUrl: string | undefined): string {
    if (registryUrl === undefined || registryUrl === '') {
        throw new UsageError('The Registry URL is needed: pass --registry <url> or set ILC_REGISTRY_URL');
    }
    return registryUrl;
}
