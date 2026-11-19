---
'ilc-registry-sdk': minor
---

Adds the `ilc-registry` command, with `login`, `logout` and `status`, which logs in to the Registry in the browser
through its OAuth authorization code flow with PKCE and keeps the token in the macOS Keychain, or in an owner-only
file under `~/.config/ilc-registry` on other platforms.
The new `auth: { type: 'cli' }` makes `buildOverrideCookie` send that token, and throws `login-required` naming the
login command when none is stored. The same flow is available to Node code from the new `ilc-registry-sdk/auth`
entry point; the root entry point still bundles for browsers.
