# ilc-plugins-sdk

## 4.0.0

### Major Changes

- [#14](https://github.com/namecheap/ilc-packages/pull/14) [`4ba347e`](https://github.com/namecheap/ilc-packages/commit/4ba347e778cf98157b2d39d4cda49168291135db) Thanks [@stas-nc](https://github.com/stas-nc)! - The package now declares an `exports` map with three entry points: `ilc-plugins-sdk`, `ilc-plugins-sdk/browser` and `ilc-plugins-sdk/webpack`. Deep imports such as `ilc-plugins-sdk/dist/server` no longer resolve; everything they offered is exported from the three entry points.
  
  `import { PluginManager } from 'ilc-plugins-sdk'` now works from ESM in Node.js. The CommonJS re-export it compiled to could not be detected by Node.js, so the import used to throw at runtime.
  
  `IlcError` from `ilc-plugins-sdk` is an interface. It was declared as a class, but no class was ever exported at runtime, so `new IlcError()` and `instanceof IlcError` never worked; `implements IlcError` and the type uses keep working.
  
  `webpack` is an optional peer dependency, needed only for `ilc-plugins-sdk/webpack`.
