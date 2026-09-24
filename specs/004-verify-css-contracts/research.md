# Research: Verifiable CSS Configuration Contracts

## 1. Authoritative inventory and stale manifests

**Decision**: Discover publishable packages from workspace metadata, extract `@cssproperty` declarations from source, and compare them per tag with checked-in `custom-elements.json`. Run the existing package build before the final comparison, and fail if generated manifests differ from committed manifests. Include component, open-package, and icon workspaces. Key each property by `(tag, exact CSS variable name)`; a common variable name in two tags is two contracts.

**Rationale**: The docs panel imports committed manifests (`apps/ui/src/store/component-manifests.ts`). The current `scripts/check-css-contracts.mjs` only validates consumer references against those manifests and defaults to one example app. It can pass when both source and implementation disagree with a stale manifest. `scripts/lib/component-contract-scope.mjs` already shows package discovery from package metadata, but its publishable scan omits icon packages and must be extended or complemented for this feature.

**Alternatives considered**: Treating committed manifests as the only truth would miss stale output. Maintaining a separate hand-written inventory would create another source of drift. Scanning only `@cssproperty` strings would miss generated metadata regressions.

## 2. Styling consumption and defaults

**Decision**: Compile component Sass and inspect actual CSS custom-property references and their target declarations. Compare source documentation, Sass theme entries, compiled fallback chains, and explicit TypeScript or inline-style consumers. Record owner, fallback reference, intended region, and state. Keep narrowly scoped classification metadata for dynamic consumers and delegated mappings; reject an unclassified public variable. Compare effective defaults after Sass expansion and normalized CSS values, while retaining authored values in diagnostics.

**Rationale**: `packages/tools/sass/css-variable.scss` maps theme keys to public names and supports fallback chains. `badge.scss` and `steps/src/step.scss` generate usages through loops, which a source-only regular expression misses. Chart theming reads variables through computed-style probes and forwards them to a canvas engine (`packages/components/chart/src/chart-theme.ts`); QR code, overlay, tooltip, side-nav, and reorder-list also read variables in TypeScript. `button-group.scss` forwards values to child components. A theme-map entry by itself does not prove that a property affects a rendered declaration.

**Alternatives considered**: Regex over Sass alone misses interpolation and fallback semantics. Treating every literal `var(...)` or `getComputedStyle(...)` as proof would accept no-op reads. Requiring manually specified consumption for every ordinary declaration would duplicate the source unnecessarily.

## 3. Observable verification

**Decision**: Use a manifest-derived coverage ledger and a deterministic verification case for each distinct public property and applicable state. A case declares renderable fixture, host target, state activation, valid contrasting value, observable target, and assertion kind. Confirm that the target's computed declaration, geometry, or programmatic output changes as intended; reading the custom property from the host is insufficient. Generate ordinary cases from compiled CSS where the target is unambiguous, and require explicit cases for stateful, slotted, pseudo-element, delegated, canvas, and other dynamic paths. Every property must end as verified, failed, or an approved exception.

**Rationale**: Existing Playwright fixtures in `tests/component-fixture.ts` wait for custom elements and Lit updates. Package tests already demonstrate host `style.setProperty`, `toHaveCSS`, pseudo-element computed styles, geometry checks, and chart theme inspection. The spec requires every property in Chromium and representative checks in Firefox and WebKit. Programmatic renderers may need an explicit refresh trigger and output assertion; a cached theme that never invalidates after a panel edit is a real failure, not a reason to waive the check.

**Alternatives considered**: Pixel screenshots introduce subjective baselines and do not identify the broken property. Checking only computed custom-property values on the host proves assignment, not effect. Running every generated icon in every browser repeats a shared styling path without adding proportional evidence.

## 4. Generated families and browser split

**Decision**: Check each generated icon tag's manifest contract individually. Exercise one representative generated icon per icon set at runtime for the shared CSS styling path. Phosphor weight variants change SVG paths but keep the same host size/color styling path, so they do not need separate styling samples. A future distinct styling implementation gets its own sample. Run the exhaustive property matrix in Chromium and a curated matrix covering every distinct rendering path and state mechanism in Firefox and WebKit.

**Rationale**: The root `playwright.config.ts` currently discovers only component and open-package test directories; icon tests need explicit discovery or a separate suite. The current test workflow runs changed component suites in all three browser projects. A dedicated style-contract target and browser-aware selection keep the chosen coverage intact. `packages/icons/feather-icons/src/feather-icon.scss` and `packages/icons/phosphor-icons/src/phosphor-icon.scss` show one shared base styling path per icon set.

**Alternatives considered**: Testing one icon's manifest would miss generated-tag drift. Running every icon's full runtime matrix would repeat the same implementation hundreds of times. Chromium-only runtime coverage would not meet the clarified cross-browser scope.

## 5. Configuration panel and published interface

**Decision**: Reconcile all discovered publishable tags against the docs site's manifest registry, then extract a pure inspector row and control descriptor from `ComponentConfigurationPanel.ts` so every manifest property can be checked for one exact mapping and valid control cardinality. Keep the panel's existing manifest-driven behavior. Test each distinct control family and shared change, reset, preset, copy, and export flows interactively with representative components. The audit command should emit a stable, sorted machine-readable report plus concise human diagnostics; its schema is a developer-facing contract.

**Rationale**: The current `buildRows()` groups all `border-radius`-typed properties with individual corners. On `c2-color-slider`, the unused shorthand plus four corners yield five names for `BoxSidesConfig`, which handles four values. `MdxCodeBlockScript.ts` writes changed variables to the host; `utils/playground.ts` handles reset and saved presets. The panel has no dedicated test suite today. Extracting the mapping calculation allows exhaustive validation without thousands of repeated UI interactions.

**Alternatives considered**: Repeating UI actions for every property is expensive and obscures CSS failures. Testing only direct host assignments misses control grouping and export defects. Replacing the panel with a per-component configuration table would duplicate the public contract.

## 6. Quality gates and compatibility

**Decision**: Add a full-library static and Chromium observable contract gate to pull-request CI, plus the representative Firefox and WebKit contract matrix. Keep normal component behavior tests and documentation/build gates. Resolve the initial audit to zero unexplained failures before enabling the blocking gate. Correct misspelled public names immediately, update every affected source, manifest, docs, preset, and example, and include an old-to-new migration table; do not retain an alias. Allow exceptions only for browser-owned or third-party surfaces with a documented alternative and dated review.

**Rationale**: `.github/workflows/component-tests.yml` currently runs build, docs checks, then changed-component browser suites; it does not run a full styling-contract audit. `.github/workflows/deploy.yml` also does not run the consumer-only CSS checker. The constitution requires documentation synchronization, meaningful browser evidence, and migration guidance for breaking changes. The user's clarification chooses immediate replacement of misspelled names.

**Alternatives considered**: A warning-only audit cannot prevent regressions. A permanent baseline of known failures conflicts with the zero-failure outcome. Silent aliases keep the typo in the public API and contradict the clarification.

## Open research items

None. Exact file placement and batching are implementation decisions for task generation; they do not change the design contracts above.
