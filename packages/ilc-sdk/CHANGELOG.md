# Change Log

## 8.0.0

### Major Changes

- [#4](https://github.com/namecheap/ilc-packages/pull/4) [`32dee1c`](https://github.com/namecheap/ilc-packages/commit/32dee1ca55a7fc79510c1fba9660c4ac7ddf722d) Thanks [@stas-nc](https://github.com/stas-nc)! - Node.js 22.12 or newer is now required. The package stays CommonJS, and its `url-join` dependency moved to version 6, which is ESM only; Node 22.12 is the first release that lets CommonJS code `require()` such a module.
  
  The package now declares an `exports` map with two entry points, `ilc-sdk` and `ilc-sdk/app`. Deep imports such as `ilc-sdk/dist/server/types` no longer resolve; everything they offered is exported from `ilc-sdk`, so change them to `import { AppAssets } from 'ilc-sdk'`. `ilc-sdk/app` now also resolves from ESM.
  
  `IlcSdk` and `IlcAppSdk` are also available as named exports, so `import { IlcSdk } from 'ilc-sdk'` works from ESM without a `.default` access. The default exports stay.

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [5.0.0](https://github.com/namecheap/ilc-sdk/compare/v4.0.0...v5.0.0) (2023-10-30)


### ⚠ BREAKING CHANGES

* Node >= 16 is required