# Algebrite vendor record

- Package: `algebrite`
- Version: `1.4.0`
- License: MIT (`LICENSE`)
- Source package: npm registry tarball `algebrite-1.4.0.tgz`
- Original browser bundle SHA-256:
  `4C5D57E3263883D6B0F32A406D158695F4F8267E89CA2CDACED160F8C4F3B275`
- Vendored bundle SHA-256:
  `D51C5DBE412DF49E6EDA0376D81FB4C09DAF7B4D7EFC69AE693ED5876F2FF67E`

The only source change in the vendored bundle is:

```diff
-window.Algebrite = require('../dist/algebrite')
+globalThis.Algebrite = require('../dist/algebrite')
```

This makes the browser bundle load in both Manifest V3 extension contexts and
Node-based contract tests. The project integrity check pins the modified bundle
hash. Application code must use `js/math-core/symbolic-adapter.js` and must not
call this bundle directly.
