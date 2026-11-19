---
'ilc-registry-sdk': patch
---

Fixes the package for projects compiled with `module: commonjs` and the older module resolution: `main`, `types` and
`typesVersions` now point at the entry points and their declarations, and the published declarations no longer
reference the package's internal `#token-store` import. The package stays an ES module; `require()` of it needs
Node 20.19 or 22.12 and later.
