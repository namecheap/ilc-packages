# ilc-registry-sdk

SDK for the [ILC](https://github.com/namecheap/ilc) Registry API. Its first feature creates the cookies that apply an
override configuration on an ILC site, signed by the Registry when the Registry signs overrides: a caller hands over
the override and how it authenticates, and gets back the cookies to write. The encoding, the signing endpoint and
the cookie names stay inside.

```sh
pnpm add ilc-registry-sdk
```

Node 22 or a browser with `fetch`. ESM only.

## Usage

```ts
import { buildOverrideCookie } from 'ilc-registry-sdk';

const result = await buildOverrideCookie(
    { apps: { '@portal/news': { spaBundle: 'http://localhost:8239/dist/single_spa.js' } } },
    {
        registryUrl: 'https://ilc-registry.example.com',
        auth: { type: 'token', id: process.env.ILC_REGISTRY_ID, secret: process.env.ILC_REGISTRY_SECRET },
    },
);

for (const { name, value } of result.cookies) {
    await browser.setCookie({ name, value, domain: 'www.example.com', path: '/', secure: true });
}
```

`result` holds:

| Field            | Meaning                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `signed`         | Whether the Registry signed the override. `expiresAt` and `untrustedLinks` exist only when `true`.                 |
| `cookies`        | Every cookie to write as `{ name, value }`, in writing order: the signature, then the override. One when unsigned. |
| `expiresAt`      | When the signature stops being valid. Call again before it to keep the override applied.                           |
| `untrustedLinks` | Links of the override that ILC removes because their host is not in the Registry's trusted origins. Show them.     |
| `size`           | Size of the override cookie with its name, as the browser counts it.                                               |

The Registry reports untrusted links only while signing, so an unsigned result says nothing about the links: ILC
still drops untrusted ones on its own, silently.

The override can be an object or its JSON text. By default it is URI-encoded when it fits the 4096-byte cookie
limit and LZUTF8-compressed otherwise; the `compression` option, `'auto'`, `'always'` or `'never'`, changes that.
The Registry call uses the global `fetch` and gives up after `timeoutMs`, 10 seconds by default. The caller adds the domain and the
flags of each cookie, since every cookie writer takes them differently.

When no cookies can be produced, the call throws a `RegistryError` whose `code` says why:

| `code`             | Meaning                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| `invalid-override` | Not a JSON object, or with keys other than `apps`, `routes` and `sharedLibs`. |
| `too-large`        | Does not fit the cookie even compressed.                                      |
| `login-required`   | The Registry did not accept the credentials, or no CLI token is stored.       |
| `refused`          | The Registry refused to sign; the message says why.                           |
| `rate-limited`     | Over the per-user signing rate limit; `retryAfterMs` when the Registry said.  |
| `unreachable`      | No usable answer from the Registry.                                           |
| `login-failed`     | `login` was refused: the Registry answered with an OAuth error.               |

## Authentication

`auth` is plain data; its `type` picks the strategy:

| `auth`                          | For                                                   | What it does                                             |
| ------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `{ type: 'token', id, secret }` | scripts and services with a Registry auth entity      | Sends them as the Registry's bearer token, no cookies.   |
| `{ type: 'bearer', token }`     | a caller that already holds the composed bearer token | Sends `Authorization: Bearer <token>` as is, no cookies. |
| `{ type: 'session' }`           | code running in the browser, next to a Registry login | Sends the browser's cookies for the Registry, no token.  |
| `{ type: 'cli' }`               | a developer's machine, after `ilc-registry login`     | Sends the token stored for `registryUrl`; Node only.     |

The composed token is `base64(id):base64(secret)` of the auth entity, the form `type: 'token'` builds. Pass it with
`type: 'bearer'` when the caller is given the token and never the entity.

## CLI login

A developer logs in to the Registry once from the terminal, in the browser, and scripts on that machine sign
overrides with `auth: { type: 'cli' }` afterwards. The package installs the `ilc-registry` command:

```sh
ilc-registry login --registry https://ilc-registry.example.com
ilc-registry login --registry https://ilc-registry.example.com --scope override:sign --scope registry:read
ilc-registry status
ilc-registry logout --registry https://ilc-registry.example.com
```

`login` runs the OAuth authorization code flow with PKCE: it opens the Registry's login page in the browser (and
prints the URL, for when it cannot), takes the redirect on a loopback port, and exchanges the code for a token.
Over SSH or in a container, where the browser cannot reach the loopback port, paste the redirect URL into the
terminal when asked. The scope is `override:sign` unless `--scope` says otherwise. `--registry` can be left out
when `ILC_REGISTRY_URL` is set.

The token expires on its own after the lifetime the Registry gave it; `status` shows every Registry with its
scopes, expiry and where the token is, never the token. `logout` revokes the token at the Registry and removes it.

### Token storage

- **macOS**: the token goes to the login Keychain through `/usr/bin/security`, service `ilc-registry`, one account
  per Registry URL.
- **Linux**: the token goes to `$XDG_CONFIG_HOME/ilc-registry/tokens.json`, or `~/.config/ilc-registry/tokens.json`,
  with POSIX mode `0600` in a `0700` directory: other local user accounts cannot read it.
- **Windows**: the token goes to the same file under `%USERPROFILE%\.config`. Node passes the mode bits but
  Windows ignores them, so the file inherits the ACL of your profile directory, typically readable by your user,
  SYSTEM and Administrators only.

The file always holds what is not secret, the expiry and the scopes of each Registry, and where its token is. After
a Keychain write the token is removed from the file, so there is never a second copy in a less protected place.

The `cli` auth type takes the token from the macOS Keychain, read once per process, and otherwise from the token
file. A token that reaches a process through its environment, on CI or where a proxy substitutes it, is passed with
`auth: { type: 'bearer', token }` instead.

```ts
import { buildOverrideCookie } from 'ilc-registry-sdk';

const result = await buildOverrideCookie(override, {
    registryUrl: 'https://ilc-registry.example.com',
    auth: { type: 'cli' },
});
```

Without a token for that URL, or with an expired one, the call throws a `RegistryError` with code `login-required`
whose message names the `ilc-registry login` command to run; nothing is asked interactively.

The same flow is available to Node code from `ilc-registry-sdk/auth`:

```ts
import { login, logout, readStoredToken, tokenFilePath } from 'ilc-registry-sdk/auth';

const { scopes, expiresAt } = await login({ registryUrl: 'https://ilc-registry.example.com' });
```

`ilc-registry-sdk/auth` is Node only: the token store uses `node:fs` and `node:child_process`, and the login
starts a loopback HTTP server. The root entry point still bundles for browsers; there the `cli` auth type throws
when selected.

## Signed overrides

ILC applies the `ILC-overrideConfig` cookie from any browser. A Registry configured with a signing key makes ILC
apply an override only together with the `ILC-overrideConfigSignature` cookie the Registry issued for that exact
value, so only an authenticated Registry user can start one. See "Signed override configuration" in the ILC docs
for the mechanism.
