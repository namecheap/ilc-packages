/**
 * The token file: `$XDG_CONFIG_HOME/ilc-registry/tokens.json`, or `~/.config/ilc-registry/tokens.json`, readable by
 * its owner only, with one entry per Registry URL. The entry always carries what is not secret, the expiry, the
 * scopes and where the token itself is, and carries the token only when the Keychain holds none. Written through a
 * temporary file and a rename, so a reader never sees a partial file.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { TokenSource } from './token-source.js';

/** Where the token value itself is kept */
export type StoredIn = 'keychain' | 'file';

/** One entry of the file, as the file holds it */
export interface FileEntry {
    /** Present only when `storedIn` is `file` */
    token?: string;
    /** ISO date */
    expiresAt: string;
    scopes: string[];
    storedIn: StoredIn;
}

const DIRECTORY_NAME = 'ilc-registry';
const FILE_NAME = 'tokens.json';

/** Where the token file is */
export function tokenFilePath(): string {
    const configHome = process.env['XDG_CONFIG_HOME'];
    const base = configHome !== undefined && configHome !== '' ? configHome : join(homedir(), '.config');
    return join(base, DIRECTORY_NAME, FILE_NAME);
}

export class HomeFileSource implements TokenSource {
    readonly id = 'file';

    read(registryUrl: string): string | undefined {
        return this.readEntry(registryUrl)?.token;
    }

    readEntry(registryUrl: string): FileEntry | undefined {
        return this.readAll()[registryUrl];
    }

    /** Every entry, keyed by the normalised Registry URL; a missing or unreadable file counts as empty */
    readAll(): Record<string, FileEntry> {
        let text: string;
        try {
            text = readFileSync(tokenFilePath(), 'utf8');
        } catch {
            return {};
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            return {};
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return {};
        }
        const entries: Record<string, FileEntry> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (isFileEntry(value)) {
                entries[key] = value;
            }
        }
        return entries;
    }

    /** Replaces the entry of the Registry; returns the file path */
    writeEntry(registryUrl: string, entry: FileEntry): string {
        const entries = this.readAll();
        entries[registryUrl] = entry;
        return this.writeAll(entries);
    }

    /** Removes the entry of the Registry; `true` when there was one */
    removeEntry(registryUrl: string): boolean {
        const entries = this.readAll();
        if (!(registryUrl in entries)) {
            return false;
        }
        delete entries[registryUrl];
        this.writeAll(entries);
        return true;
    }

    private writeAll(entries: Record<string, FileEntry>): string {
        const path = tokenFilePath();
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
        try {
            writeFileSync(temporary, `${JSON.stringify(entries, null, 4)}\n`, { mode: 0o600, flag: 'wx' });
            renameSync(temporary, path);
        } catch (error) {
            rmSync(temporary, { force: true });
            throw error;
        }
        return path;
    }
}

function isFileEntry(value: unknown): value is FileEntry {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const entry = value as Record<string, unknown>;
    return (
        (entry['token'] === undefined || typeof entry['token'] === 'string') &&
        typeof entry['expiresAt'] === 'string' &&
        Array.isArray(entry['scopes']) &&
        entry['scopes'].every((scope) => typeof scope === 'string') &&
        (entry['storedIn'] === 'keychain' || entry['storedIn'] === 'file')
    );
}
