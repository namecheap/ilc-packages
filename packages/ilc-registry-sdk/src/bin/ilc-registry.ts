#!/usr/bin/env node
/** `ilc-registry`: logs in to the ILC Registry for the `cli` auth type of ilc-registry-sdk */
import { listStoredTokens, login, logout, tokenFilePath } from '../auth/index.js';
import { describeStorage, normalizeRegistryUrl } from '#token-store';
import { parseCliArgs, USAGE, UsageError, type CliCommand } from './args.js';

interface Run {
    exitCode: number;
    stdout?: string;
    stderr?: string;
}

async function run(argv: string[]): Promise<Run> {
    let command: CliCommand;
    try {
        command = parseCliArgs(argv);
    } catch (error) {
        if (error instanceof UsageError) {
            return { exitCode: 2, stderr: `${error.message}\n\n${USAGE}` };
        }
        throw error;
    }

    switch (command.command) {
        case 'help':
            return { exitCode: 2, stderr: USAGE };
        case 'login': {
            const result = await login({ registryUrl: command.registryUrl, scopes: command.scopes });
            return {
                exitCode: 0,
                stdout:
                    `Logged in to ${result.registryUrl}\n` +
                    `Token saved to ${describeStorage(result.storedIn)}\n` +
                    `Scopes: ${result.scopes.join(' ')}\n` +
                    `Expires at ${result.expiresAt.toISOString()}\n`,
            };
        }
        case 'logout':
            await logout({ registryUrl: command.registryUrl });
            return { exitCode: 0, stdout: `Logged out of ${command.registryUrl}\n` };
        case 'status':
            return status(command.registryUrl);
    }
}

function status(registryUrl: string | undefined): Run {
    const wanted = registryUrl === undefined ? undefined : normalizeRegistryUrl(registryUrl);
    const entries = listStoredTokens().filter((entry) => wanted === undefined || entry.registryUrl === wanted);
    const lines = [`Token file: ${tokenFilePath()}`];
    if (entries.length === 0) {
        lines.push(wanted === undefined ? 'No stored tokens' : `No token stored for ${wanted}`);
    }
    const now = Date.now();
    for (const entry of entries) {
        const state = entry.expiresAt.getTime() > now ? 'valid' : 'expired';
        lines.push(
            `${entry.registryUrl}  stored in: ${entry.storedIn}  scopes: ${entry.scopes.join(' ')}  expires: ${entry.expiresAt.toISOString()}  ${state}`,
        );
    }
    return { exitCode: 0, stdout: `${lines.join('\n')}\n` };
}

function write(stream: NodeJS.WritableStream, text: string | undefined): Promise<void> {
    return new Promise((resolve) => {
        if (text === undefined || text === '') {
            resolve();
            return;
        }
        stream.write(text, () => resolve());
    });
}

void run(process.argv.slice(2))
    .catch((error: unknown): Run => ({
        exitCode: 1,
        stderr: `${error instanceof Error ? error.message : String(error)}\n`,
    }))
    .then(async (result) => {
        await write(process.stdout, result.stdout);
        await write(process.stderr, result.stderr);
        process.exit(result.exitCode);
    });
