# Release checks

[README](../README.md) · [API reference](API.md) · [Demo source guide](../example/demos/README.md)

The package is ESM. `webgpujs/esbuild` is an optional Node build-time export with its own declarations; Acorn is bundled into it and it does not import esbuild at runtime. Its root exports the factories, transpiler, stage contexts and public option/result types. A separate `webgpujs/webgpujs.js` export provides the classic browser bundle. Acorn is bundled; the published package has no runtime dependencies. The native Dawn runtime, build tools, matrix helpers and example assets stay in development dependencies or the repository.

Both `npm run build` and `tinybuild build` fully minify the library, optional plugin and demo bundles. The gallery retains authored shader/setup/update source for translation and display. The package check also fully minifies a consuming app and executes its transpiler; the GPU suite runs a mixed JS/WGSL chain through the minified release bundle.

TypeScript consumers should use TypeScript 7 or newer with DOM libraries. WebGPU interfaces come from TypeScript itself; `@webgpu/types` is not installed or automatically included. The compiler config retains a commented fallback for older DOM libraries. The library internally types the four runtime flag objects that the current DOM declarations omit. Relative declaration imports include `.js`, supporting both bundler and NodeNext resolution.

## Verify the release

```sh
npm ci
npm run typecheck
npm test
npm run test:gpu
npm run test:package -- --offline
npm run benchmark
```

`test:gpu` needs a working GPU adapter. `test:package` builds and packs the actual release, installs that tarball in a separate consumer, compiles strict consumer fixtures with `skipLibCheck:false` in bundler and NodeNext modes, and checks package imports and transpilation without a GPU. The fixture disables automatic ambient type-package inclusion. Named compute readback shapes, native descriptors, media inputs and vertex layouts are covered by these consumer checks.

The package allowlist includes the runtime bundles, active declarations, README, API/coverage documentation and license. Examples, screenshot assets, source history, tests, build scripts and native development binaries are excluded. Test artifacts and the checked tarball are saved under `.temp/package-check/`.

## Publish when approved

Keep the version in `package.json` and `package-lock.json` synchronized. Review the packed files and release notes before publishing. `prepublishOnly` runs type, unit and installed-package checks; `prepack` rebuilds runtime bundles and declarations.

```sh
npm pack --dry-run
# Run npm publish only when you intend to publish the release.
```

The demo keeps its existing address: [webgpujs.netlify.app](https://webgpujs.netlify.app/). Netlify builds the library and all demo hosts, then publishes `example/`. Publishing the npm package and deploying the gallery are separate actions.

## Stability gates

The [CI workflow](../.github/workflows/ci.yml) runs type, unit and installed-package checks on Windows, macOS and Linux using Node 22 and 24. GPU coverage is separate: run `npm run test:gpu` on an adapter-equipped machine and `http://localhost:8080/verify.html` in each browser/backend being claimed. Download the browser report and record failures and optional-feature availability in [COMPATIBILITY.md](COMPATIBILITY.md). Adding a CI matrix does not mean every job or browser has already passed.

Review ownership/disposal changes and deprecated aliases before freezing 1.0. `cleanup()` now releases helper allocations without destroying the device or unconfiguring its canvas. Applications that used it as whole-device shutdown must explicitly call `device.destroy()` after all consumers finish. Existing helpers do not recover automatically after device loss; recreate them.
