# Component browser tests

Playwright runs real component scenarios through one shared Vite server. Tests live beside each component in `test/`. The server compiles source and SCSS on demand; component and core imports resolve to source, so the suites need no package build or Astro app. Existing component Vite configs remain the standalone development/build harnesses.

## Run

```bash
npm install
npx playwright install chromium # once, and after Playwright upgrades
npm run test:button             # button, Chromium
npm test -- packages/components/button/test # focus any component directory
npm test -- --grep 'keyboard'   # focus matching test titles
npm run test:all -- --list      # list tests without launching browsers
npm run test:type-check

npx playwright install         # install all three browser engines
npm run test:all                # all components, Chromium/Firefox/WebKit
npm run test:report             # inspect the last HTML report
```

Playwright starts Vite on `127.0.0.1:4175`, waits for the health page, and stops its server when finished. For repeated local runs, optionally keep `npm run test:serve` running; Playwright reuses it outside CI. A conflicting port fails instead of silently choosing another one. Browser processes are reused across tests, with an isolated browser context/page per test. Override concurrency with `--workers=4` when useful.

## Add a component suite

1. Add `packages/components/<name>/test/scenarios.html` with module imports for the component and any scenario-only dependencies. Set `document.documentElement.dataset.modulesReady = 'true'` after the imports resolve.
2. Add `*.spec.ts` next to it; Playwright discovers it automatically. Import `test` and `expect` from `tests/component-fixture.ts`, then call `renderScenario()` with the markup needed by each test.
3. The shared fixture opens the package harness, waits for module registration, inserts the markup and settles nested Lit components. Use role/name locators, real pointer/keyboard input, observable application results, and retrying assertions. Do not use arbitrary sleeps or dispatch synthetic clicks to test disabled behavior.
4. Cover meaningful states and transitions. Keep application behavior explicit: `c2-button` reflects `selected`; the toggle scenario owns changing it. Complete async scenarios using a control instead of real network requests or timeouts.
5. Add axe scans for representative states alongside explicit keyboard, focus, and ARIA assertions. Axe does not establish complete accessibility conformance. Keep screenshot baselines separate if added later.

The same discovery works for `open-packages/*/test`. The shared Vite configuration maps package exports from `dist/*.js` to their matching source files and maps core `.js` subpaths to source. Add explicit mappings for other entry conventions or generated icon packages before relying on them in new scenarios. Avoid importing all components in a global test entry: load only each scenario's dependencies.

Playwright transpiles tests without type-checking; `npm run test:type-check` checks the test infrastructure and scenario TypeScript separately from published package declarations.

For keyboard navigation, destructure the shared `tab` fixture and use `tab()` / `tab(true)` for forward/backward traversal. It uses Option+Tab on macOS WebKit, which otherwise skips buttons under the default OS settings; other browsers use Tab. This sends real keyboard input without modifying system preferences or component tabindex. See [Apple's Safari keyboard shortcuts](https://support.apple.com/guide/safari/cpsh003/mac).

## CI and scale

`component-tests.yml` runs on pull requests and main, with one job per browser. Each job starts one shared Vite server, runs with two workers, and uploads the report and failure traces for seven days. Retries are limited to one in CI, and focused tests (`test.only`) fail CI.

Initially CI runs the complete suite. Dependency-aware affected-component selection is intentionally deferred until more suites exist; a shared core, Sass, theme, or dependency change must include consumers. Local directory filtering is available now. At larger scale, distribute the full suite using Playwright's `--shard=1/4` (and corresponding jobs), retaining the full main-branch suite as a backstop. Measure suite timings before increasing workers or sharding.
