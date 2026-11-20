/** One place a token can come from, in the order `TokenStore` asks them */
export type TokenSourceId = 'keychain' | 'file';

export interface TokenSource {
    readonly id: TokenSourceId;
    /** The token stored for the Registry here, by its normalised URL; `undefined` when there is none */
    read(registryUrl: string): string | undefined;
}
