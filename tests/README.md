# Component browser tests

Playwright runs real component scenarios through one shared Vite server. Tests live beside each component in `test/`. The server compiles source and SCSS on demand; component and core imports resolve to source, so running the suites needs no package build or Astro app. `npm run test:type-check` is the exception: tsc resolves a component's `@c2n/*` imports through each package's `exports`, which point at the generated `dist/*.d.ts`, so it needs `npm run build` first — which is why CI builds before type-checking. Existing component Vite configs remain the standalone development/build harnesses.

## Run

```bash
npm install
npx playwright install chromium # once, and after Playwright upgrades
npm run test:button             # button, Chromium
npm test                       # changed component packages, Chromium
npm test -- --base=origin/develop # committed changes since a branch/ref
npm test -- packages/components/button/test # explicitly focus a component
npm test -- --grep 'keyboard'   # matching tests in changed packages
npm run test:all -- --list      # list tests without launching browsers
npm run test:type-check

npx playwright install         # install all three browser engines
npm run test:all                # all components, Chromium/Firefox/WebKit
npm run test:report             # inspect the last HTML report
```

`npm test` reads staged, unstaged and untracked files, then runs the suites belonging to changed `packages/components/*` and `open-packages/*` packages. On a local feature branch it also includes committed changes since `origin/HEAD` (currently `origin/develop`); pass `--base=<branch-or-sha>` to choose another comparison point. Changes to Playwright infrastructure, root package metadata, core, Sass, shared config or icon packages run every component suite because they can affect every package. If no changed package has a suite, the command exits successfully without starting Vite or a browser.

Playwright starts Vite on `127.0.0.1:4175`, waits for the health page, and stops its server when finished. For repeated local runs, optionally keep `npm run test:serve` running; Playwright reuses it outside CI. A conflicting port fails instead of silently choosing another one. Browser processes are reused across tests, with an isolated browser context/page per test. Override concurrency with `--workers=4` when useful.

## Add a component suite

1. Add `packages/components/<name>/test/scenarios.html` with module imports for the component and any scenario-only dependencies. Set `document.documentElement.dataset.modulesReady = 'true'` after the imports resolve.
2. Add `*.spec.ts` next to it; Playwright discovers it automatically. Import `test` and `expect` from `tests/component-fixture.ts`, then call `renderScenario()` with the markup needed by each test.
3. The shared fixture opens the package harness, waits for module registration, inserts the markup and settles nested Lit components. Use role/name locators, real pointer/keyboard input, observable application results, and retrying assertions. Do not use arbitrary sleeps or dispatch synthetic clicks to test disabled behavior.
4. Cover meaningful states and transitions. Keep application behavior explicit: `c2-button` reflects `selected`; the toggle scenario owns changing it. Complete async scenarios using a control instead of real network requests or timeouts.
5. Add axe scans for representative states alongside explicit keyboard, focus, and ARIA assertions. Axe does not establish complete accessibility conformance. Keep screenshot baselines separate if added later.

The same discovery works for `open-packages/*/test`. The shared Vite configuration maps package exports from `dist/*.js` to their matching source files and maps core `.js` subpaths to source. Add explicit mappings for other entry conventions or generated icon packages before relying on them in new scenarios. Avoid importing all components in a global test entry: load only each scenario's dependencies.

Playwright transpiles tests without type-checking; `npm run test:type-check` checks the test infrastructure and scenario TypeScript separately from published package declarations.

## Styling-contract verification

`npm run check:style-contracts` audits publishable source declarations, checked-in manifests, compiled Sass consumers and fallbacks, reviewed dynamic mappings, inspector registration, and case coverage. It exits `1` while a contract or case is missing, `2` for an invalid input, and `0` only when static readiness is complete. Its concise sorted diagnostics name the tag, exact variable, category, source, state, and target; use `npm run check:style-contracts -- --json` to retrieve every failure in deterministic machine-readable order, including those past the first 50 human-readable lines. `missing-case` means observable browser evidence has not yet been supplied, whereas `unused-property`, `undocumented-consumer`, or `default-mismatch` points to a component contract defect to investigate.

`npm run test:style-contracts -- --project=chromium` runs the current target-effect cases. Each case must observe the intended computed declaration, geometry, pseudo/slotted/delegated target, or programmatic output—not merely echo the custom property on its host. The registry in `scripts/data/style-contract-cases.json` gives each case an exact `(tag, name, state)` identity and a context with enough markup, data, dimensions, and settling condition to make it observable. Static readiness and browser startup validate the same reviewed registry, including supported browsers and reset mode. Context `stateSetup` sets required attributes, while `dimensions` applies and verifies target sizes before baseline capture. Pseudo-style cases name `pseudo: "::before"` or `"::after"`; geometry and programmatic cases supply `valueSyntax` (a CSS property that validates the custom-property value, such as `width` or `color`). Geometry cases also name `geometryMetric` (`width`, `height`, `x`, `y`, or `area`) so incidental movement cannot prove a size contract. Every case's observed syntax and contrasting value must agree with the published property type, or the case must include a reviewed `syntaxRationale` for a transformation; unresolved `var(...)`, `env(...)`, or `attr(...)` references are invalid test values. Programmatic cases name an explicit rendered `outputProbe` (`canvas-bitmap`, `svg-bitmap`, `image-bitmap`, or `text-content`). Bitmap probes compare decoded pixels, not markup or image URLs, and reject an unobservable image. All assertion kinds check host ownership and a stable before/after/restore cycle; dynamic paths can declare `stabilityWindowMs` to observe delayed or stepped output beyond three animation frames. `slotted-style` must target an element assigned to the tested host's slot; `delegated-style` names the expected `childTag`. Use a valid contrasting value, list the selected browsers, and reset the host property after the assertion. Add every applicable state separately. The generated icon tags are all checked statically; one live icon per set is enough only while its styling path remains shared.

The observable runner also tries an unrelated placebo host-style edit and a second valid value for the selected property. A reviewed case may provide `controlValue` when safe inference has no valid candidate (for example, `justify-content` or `font-style`); both values are checked against the observed syntax and published type in the browser. A mutation observer that redraws merely because the host style changed or the property exists cannot establish the property effect. Computed-style, text, canvas, image, and SVG targets must be rendered; bitmap targets also require positive rendered width and height even if intrinsic pixels change at zero CSS size. If a bitmap is hidden but mirrored to a visible public surface, target that visible surface. SVG bitmap capture includes live computed filters, clipping, and transforms before rasterization.

Reviewed non-CSS consumers belong in `scripts/data/style-contract-consumers.json` with an exact source and downstream sink. An exception in `scripts/data/style-contract-exceptions.json` is reserved for a browser-owned or third-party-rendered surface and needs a limitation, user impact, supported alternative, technical reason, reviewer/date, and reassessment date. Ordinary shadow styling is not exempt. Corrected public names have no alias; record the old and new spellings in `specs/004-verify-css-contracts/migration.md` and update every documentation surface.

The full `npm run verify:style-contracts` command currently fails closed with exit `2`: the exhaustive Chromium matrix, representative Firefox/WebKit matrix, panel flows, and final ledger are not complete. The current counts and known failures are in `specs/004-verify-css-contracts/audit-results.md`. Do not use a passing focused case as a release-quality verdict.

For keyboard navigation, destructure the shared `tab` fixture and use `tab()` / `tab(true)` for forward/backward traversal. It uses Option+Tab on macOS WebKit, which otherwise skips buttons under the default OS settings; other browsers use Tab. This sends real keyboard input without modifying system preferences or component tabindex. See [Apple's Safari keyboard shortcuts](https://support.apple.com/guide/safari/cpsh003/mac).

## CI and scale

`component-tests.yml` runs on pull requests and pushes to `develop` or `main`, with one job per browser. CI fetches history and compares the change with the event's base commit, so it runs only affected package suites even after changes are committed. Manual workflow runs execute the complete suite. Each browser job uploads its report and failure traces for seven days. Retries are limited to one in CI, and focused tests (`test.only`) fail CI.

Selection is package-based: changing Button runs Button, and changing Button plus Select runs both. Shared inputs run everything rather than trying to infer every transitive consumer. At larger scale, distribute manual full-suite runs using Playwright's `--shard=1/4` and corresponding jobs. Measure timings before increasing workers or sharding.

## Benchmarks

Two different things guard table performance, and they are deliberately separate.

`table.perf.spec.ts` runs with every other suite, on all three engines. It asserts _cost_, never wall-clock: a
quarter of a million rows must produce exactly as many DOM elements as a thousand, scrolling must not grow that
window, and a realtime row update must reuse every rendered row element instead of rebuilding the body. Those hold
on any machine, so they can fail the build. Turning virtualization off in the harness fails all six.

`table.bench.spec.ts` measures wall-clock and is skipped unless `C2_BENCH` is set, because the numbers belong to the
machine that produced them:

```bash
npm run bench:table            # measure, and compare against the recorded baseline
npm run bench:table:baseline   # record the current numbers as the new baseline
C2_BENCH_REPEATS=15 npm run bench:table   # more samples on a noisy machine
```

Each case reports the median of seven runs in milliseconds of table work — from the change, through Lit's render, to
the layout it forces, measured in the page so no driver round-trip is included. The run prints a comparison with
`packages/components/table/test/bench/baseline.json`, writes `test-results/table-bench.json`, and fails when a metric
is more than 2.5x its baseline (`C2_BENCH_TOLERANCE` overrides). The tolerance is wide on purpose: this catches a
regression that changes the shape of the work, not the noise between two runs. Metrics whose baseline is under half a
millisecond are reported but not gated, since `performance.now()` is quantized to about a tenth of one.

Re-record the baseline only once a change is understood, and commit it in the same change, so the next run compares
against the version it is meant to.
