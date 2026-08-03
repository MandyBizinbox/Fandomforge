# Template Builder V2 validation

Generated from feature branch commit: 9995728fab7005e3f14e3de29544c1e90045abf2

- npm ci: PASS
- focused frontend tests: PASS
- frontend production build: PASS
- backend models py_compile: PASS

## Test output tail
```text

> frontend@0.1.0 test
> craco test --watchAll=false --runInBand printAreaGeometry.test.js templateProductionResolver.test.js cataloguePricingUtils.test.js templateReadiness.test.js derivedMockupRenderer.test.js

◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
[visual-edits] @emergentbase/visual-edits not installed — visual editing disabled.
◇ injected env (0) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
[visual-edits] @emergentbase/visual-edits not installed — visual editing disabled.
PASS src/lib/templateReadiness.test.js
PASS src/lib/cataloguePricingUtils.test.js
PASS src/lib/templateProductionResolver.test.js
PASS src/lib/derivedMockupRenderer.test.js
PASS src/lib/printAreaGeometry.test.js

Test Suites: 5 passed, 5 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        1.819 s
Ran all test suites matching /printAreaGeometry.test.js|templateProductionResolver.test.js|cataloguePricingUtils.test.js|templateReadiness.test.js|derivedMockupRenderer.test.js/i.
```

## Build output tail
```text

> frontend@0.1.0 build
> craco build

◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
◇ injected env (0) from .env // tip: ⌁ auth for agents [www.vestauth.com]
Creating an optimized production build...
Compiled with warnings.

[eslint] 
src/components/admin/PaymentGatewaySettings.jsx
  Line 156:32:  React Hook useEffect has a missing dependency: 'load'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

src/components/admin/ShippingSettings.jsx
  Line 165:32:  React Hook useEffect has a missing dependency: 'load'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

src/components/admin/UserAccessAdmin.jsx
  Line 191:36:  React Hook useEffect has a missing dependency: 'loadRows'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

src/components/checkout/ShippingMethodSelector.jsx
  Line 158:6:  React Hook useEffect has missing dependencies: 'onChange' and 'onSlotChange'. Either include them or remove the dependency array. If 'onChange' changes too often, find the parent component that defines it and wrap that definition in useCallback        react-hooks/exhaustive-deps
  Line 161:9:  The 'selectedMethodSlots' conditional could make the dependencies of useEffect Hook (at line 170) change on every render. Move it inside the useEffect callback. Alternatively, wrap the initialization of 'selectedMethodSlots' in its own useMemo() Hook  react-hooks/exhaustive-deps

src/components/product-builder/ProductArtworkStudio.jsx
  Line 891:77:  React Hook useMemo has a missing dependency: 'allowedProfilesForArea'. Either include it or remove the dependency array                                                                           react-hooks/exhaustive-deps
  Line 956:9:   The 'setGroupSlots' function makes the dependencies of useCallback Hook (at line 1183) change on every render. To fix this, wrap the definition of 'setGroupSlots' in its own useCallback() Hook  react-hooks/exhaustive-deps
  Line 1010:6:  React Hook useEffect has missing dependencies: 'activeGroup', 'allowedProfilesForArea', and 'setGroupSlots'. Either include them or remove the dependency array                                   react-hooks/exhaustive-deps
  Line 1279:6:  React Hook useEffect has a missing dependency: 'patchPlacement'. Either include it or remove the dependency array                                                                                 react-hooks/exhaustive-deps

src/components/product-builder/ProductBuilder.jsx
  Line 1975:6:  React Hook useMemo has missing dependencies: 'creatorAmountForRetail' and 'noProfitMinimum'. Either include them or remove the dependency array  react-hooks/exhaustive-deps

Search for the keywords to learn more about each warning.
To ignore, add // eslint-disable-next-line to the line before.

File sizes after gzip:

  112.14 kB  build/static/js/main.b40e28ec.js
  84.88 kB   build/static/js/239.90d6aa76.chunk.js
  48.3 kB    build/static/js/554.4b7f2557.chunk.js
  22.57 kB   build/static/css/main.08d96946.css
  14.11 kB   build/static/js/324.051ed25d.chunk.js
  12.85 kB   build/static/js/499.d5b9659c.chunk.js
  12.39 kB   build/static/js/952.d2fe745f.chunk.js
  11.9 kB    build/static/js/842.f1556442.chunk.js
  11.23 kB   build/static/js/577.ab65bd71.chunk.js
  11.14 kB   build/static/js/35.4ef7d8d7.chunk.js
  9.78 kB    build/static/js/667.bf71f5dd.chunk.js
  7.22 kB    build/static/js/689.4974f7bd.chunk.js
  7.21 kB    build/static/js/109.cf7f29be.chunk.js
  7.2 kB     build/static/js/284.55c93876.chunk.js
  6.79 kB    build/static/js/788.26dcfdb6.chunk.js
  6.67 kB    build/static/js/30.3b630a1a.chunk.js
  6.61 kB    build/static/js/500.394cd37f.chunk.js
  6.56 kB    build/static/js/671.54a0f5f1.chunk.js
  6.25 kB    build/static/js/46.75926216.chunk.js
  5.92 kB    build/static/js/680.7542d855.chunk.js
  5.64 kB    build/static/js/958.ff172499.chunk.js
  5.33 kB    build/static/js/495.c4891856.chunk.js
  5.22 kB    build/static/js/809.4942f86f.chunk.js
  4.6 kB     build/static/js/82.9a17af02.chunk.js
  4.55 kB    build/static/js/913.b343761c.chunk.js
  4.5 kB     build/static/js/710.0cbc3381.chunk.js
  4.11 kB    build/static/js/701.7359a611.chunk.js
  4.1 kB     build/static/js/202.29622481.chunk.js
  4.08 kB    build/static/js/988.d05b8af6.chunk.js
  4.04 kB    build/static/js/489.e6cac1df.chunk.js
  3.97 kB    build/static/js/490.cf82069f.chunk.js
  3.9 kB     build/static/js/955.be3b3a2d.chunk.js
  3.86 kB    build/static/js/14.f561168b.chunk.js
  3.74 kB    build/static/js/504.add44f03.chunk.js
  3.02 kB    build/static/js/771.01cd617e.chunk.js
  2.95 kB    build/static/js/400.4ac7342f.chunk.js
  2.88 kB    build/static/js/487.b7d1787b.chunk.js
  2.73 kB    build/static/css/324.ea7aaaa1.chunk.css
  2.73 kB    build/static/css/771.ea7aaaa1.chunk.css
  2.56 kB    build/static/js/100.62c56d33.chunk.js
  2.37 kB    build/static/css/174.ae0b578c.chunk.css
  1.99 kB    build/static/js/634.15f287af.chunk.js
  1.46 kB    build/static/js/272.d080bcf7.chunk.js
  608 B      build/static/js/450.feb92252.chunk.js
  365 B      build/static/js/174.fdb68f50.chunk.js

The project was built assuming it is hosted at /.
You can control this with the homepage field in your package.json.

The build folder is ready to be deployed.
You may serve it with a static server:

  npm install -g serve
  serve -s build

Find out more about deployment here:

  https://cra.link/deployment

```

## Install output tail
```text
npm warn deprecated stable@0.1.8: Modern JS already guarantees Array#sort() is a stable sort, so this library is deprecated. See the compatibility table on MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#browser_compatibility
npm warn deprecated @babel/plugin-proposal-class-properties@7.18.6: This proposal has been merged to the ECMAScript standard and thus this plugin is no longer maintained. Please use @babel/plugin-transform-class-properties instead.
npm warn deprecated @babel/plugin-proposal-private-methods@7.18.6: This proposal has been merged to the ECMAScript standard and thus this plugin is no longer maintained. Please use @babel/plugin-transform-private-methods instead.
npm warn deprecated @babel/plugin-proposal-nullish-coalescing-operator@7.18.6: This proposal has been merged to the ECMAScript standard and thus this plugin is no longer maintained. Please use @babel/plugin-transform-nullish-coalescing-operator instead.
npm warn deprecated @babel/plugin-proposal-numeric-separator@7.18.6: This proposal has been merged to the ECMAScript standard and thus this plugin is no longer maintained. Please use @babel/plugin-transform-numeric-separator instead.
npm warn deprecated rollup-plugin-terser@7.0.2: This package has been deprecated and is no longer maintained. Please use @rollup/plugin-terser
npm warn deprecated @humanwhocodes/config-array@0.13.0: Use @eslint/config-array instead
npm warn deprecated whatwg-encoding@1.0.5: Use @exodus/bytes instead for a more spec-conformant and faster implementation
npm warn deprecated rimraf@3.0.2: Rimraf versions prior to v4 are no longer supported
npm warn deprecated abab@2.0.6: Use your platform's native atob() and btoa() methods instead
npm warn deprecated @babel/plugin-proposal-private-property-in-object@7.21.11: This proposal has been merged to the ECMAScript standard and thus this plugin is no longer maintained. Please use @babel/plugin-transform-private-property-in-object instead.
npm warn deprecated @babel/plugin-proposal-optional-chaining@7.21.0: This proposal has been merged to the ECMAScript standard and thus this plugin is no longer maintained. Please use @babel/plugin-transform-optional-chaining instead.
npm warn deprecated glob@7.2.3: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me
npm warn deprecated @humanwhocodes/object-schema@2.0.3: Use @eslint/object-schema instead
npm warn deprecated domexception@2.0.1: Use your platform's native DOMException instead
npm warn deprecated w3c-hr-time@1.0.2: Use your platform's native performance.now() and performance.timeOrigin.
npm warn deprecated q@1.5.1: You or someone you depend on is using Q, the JavaScript Promise library that gave JavaScript developers strong feelings about promises. They can almost certainly migrate to the native JavaScript promise now. Thank you literally everyone for joining me in this bet against the odds. Be excellent to each other.
npm warn deprecated
npm warn deprecated (For a CapTP with native promises, see @endo/eventual-send and @endo/captp)
npm warn deprecated sourcemap-codec@1.4.8: Please use @jridgewell/sourcemap-codec instead
npm warn deprecated workbox-cacheable-response@6.6.0: workbox-background-sync@6.6.0
npm warn deprecated source-map@0.8.0-beta.0: The work that was done in this beta branch won't be included in future versions
npm warn deprecated workbox-google-analytics@6.6.0: It is not compatible with newer versions of GA starting with v4, as long as you are using GAv3 it should be ok, but the package is not longer being maintained
npm warn deprecated svgo@1.3.2: This SVGO version is no longer supported. Upgrade to v2.x.x.
npm warn deprecated eslint@8.57.1: This version is no longer supported. Please see https://eslint.org/version-support for other options.

added 1500 packages, and audited 1501 packages in 16s

285 packages are looking for funding
  run `npm fund` for details

36 vulnerabilities (12 low, 6 moderate, 17 high, 1 critical)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
```
