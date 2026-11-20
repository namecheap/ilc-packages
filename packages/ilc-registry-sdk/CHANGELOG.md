# ilc-registry-sdk

## 0.3.1

### Patch Changes

- [#11](https://github.com/namecheap/ilc-packages/pull/11) [`1a56c62`](https://github.com/namecheap/ilc-packages/commit/1a56c62d34397dd18977c03327e8856d13e7b01f) Thanks [@stas-nc](https://github.com/stas-nc)! - Fixes the package for projects compiled with `module: commonjs` and the older module resolution: `main`, `types` and
  `typesVersions` now point at the entry points and their declarations, and the published declarations no longer
  reference the package's internal `#token-store` import. The package stays an ES module; `require()` of it needs
  Node 20.19 or 22.12 and later.

## 0.3.0

### Minor Changes

- [#9](https://github.com/namecheap/ilc-packages/pull/9) [`1adbdea`](https://github.com/namecheap/ilc-packages/commit/1adbdea39ddfeeb469a94523cda6e08363d72f71) Thanks [@stas-nc](https://github.com/stas-nc)! - Adds the `ilc-registry` command, with `login`, `logout` and `status`, which logs in to the Registry in the browser
  through its OAuth authorization code flow with PKCE and keeps the token in the macOS Keychain, or in an owner-only
  file under `~/.config/ilc-registry` on other platforms.
  The new `auth: { type: 'cli' }` makes `buildOverrideCookie` send that token, and throws `login-required` naming the
  login command when none is stored. The same flow is available to Node code from the new `ilc-registry-sdk/auth`
  entry point; the root entry point still bundles for browsers.

## 0.2.0

### Minor Changes

- [#7](https://github.com/namecheap/ilc-packages/pull/7) [`8b10757`](https://github.com/namecheap/ilc-packages/commit/8b107572d3fb5df56f21866448da48b582f68f11) Thanks [@stas-nc](https://github.com/stas-nc)! - Add `auth: { type: 'bearer', token }`, which sends a composed Registry bearer token (`base64(id):base64(secret)`) as
  is, for a caller that is given the token and never the auth entity.

## 0.1.0

### Minor Changes

- [#3](https://github.com/namecheap/ilc-packages/pull/3) [`323481a`](https://github.com/namecheap/ilc-packages/commit/323481ac0e584e1729751cfd83222329b71a1e6e) Thanks [@stas-nc](https://github.com/stas-nc)! - Add `buildOverrideCookie`, which encodes an ILC override configuration, has the Registry sign it when the Registry
  signs overrides, and returns the cookies to write. It is the package's only function: the encoding, the signing
  endpoint and the cookie names stay inside. Authentication is a plain `auth` object: the id and secret of a Registry
  auth entity, or the browser session. A refused or unreachable Registry surfaces as a `RegistryError` with a `code`.

## 0.0.1

### Patch Changes

- [#1](https://github.com/namecheap/ilc-packages/pull/1) [`89d352e`](https://github.com/namecheap/ilc-packages/commit/89d352e2361572cfc5ca6e4dad1756f610dfdf5a) Thanks [@stas-nc](https://github.com/stas-nc)! - Test release
