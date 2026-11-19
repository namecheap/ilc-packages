/** The random values of one authorization code flow with PKCE (RFC 7636) */
import { createHash, randomBytes } from 'node:crypto';

/** 43 unreserved characters, the minimum RFC 7636 asks for; base64url of 32 random bytes has no padding */
export function codeVerifier(): string {
    return randomBytes(32).toString('base64url');
}

/** The S256 challenge of the verifier: base64url of its SHA-256 */
export function codeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** The `state` that ties the redirect back to this flow */
export function randomState(): string {
    return randomBytes(16).toString('base64url');
}
