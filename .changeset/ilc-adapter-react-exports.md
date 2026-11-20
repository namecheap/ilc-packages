---
'ilc-adapter-react': major
---

The package declares an `exports` map with three entry points, `ilc-adapter-react`, `ilc-adapter-react/parcel` and `ilc-adapter-react/server`. Deep imports such as `ilc-adapter-react/dist/parcel` no longer resolve. The compiled output targets ES2019 and the automatic JSX runtime of React 17 and newer.
