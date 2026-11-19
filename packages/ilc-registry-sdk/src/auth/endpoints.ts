/**
 * Where the Registry's OAuth endpoints are: read from its authorization server metadata (RFC 8414), or the
 * conventional paths under the Registry URL when it serves no metadata document.
 */
import { OAUTH_FALLBACK_PATHS, OAUTH_METADATA_PATH } from '../constants.js';
import { RegistryError } from '../errors.js';

export interface OAuthEndpoints {
    authorization: string;
    token: string;
    revocation: string;
}

export async function discoverEndpoints(registryUrl: string, timeoutMs: number): Promise<OAuthEndpoints> {
    const base = registryUrl.replace(/\/+$/, '');
    const fallback: OAuthEndpoints = {
        authorization: `${base}${OAUTH_FALLBACK_PATHS.authorize}`,
        token: `${base}${OAUTH_FALLBACK_PATHS.token}`,
        revocation: `${base}${OAUTH_FALLBACK_PATHS.revoke}`,
    };
    const url = `${base}${OAUTH_METADATA_PATH}`;

    let response: Response;
    try {
        response = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        throw new RegistryError('unreachable', `Registry is unreachable at ${url}: ${describeError(error)}`);
    }
    if (response.status === 404) {
        return fallback;
    }
    if (!response.ok) {
        throw new RegistryError('unreachable', `Registry answered ${response.status} at ${url}`);
    }

    let metadata: unknown;
    try {
        metadata = JSON.parse(await response.text());
    } catch {
        return fallback;
    }
    if (typeof metadata !== 'object' || metadata === null) {
        return fallback;
    }
    const document = metadata as Record<string, unknown>;
    return {
        authorization: endpoint(document['authorization_endpoint'], fallback.authorization),
        token: endpoint(document['token_endpoint'], fallback.token),
        revocation: endpoint(document['revocation_endpoint'], fallback.revocation),
    };
}

function endpoint(value: unknown, fallback: string): string {
    return typeof value === 'string' && value !== '' ? value : fallback;
}

export function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
