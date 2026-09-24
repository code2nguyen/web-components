# Quickstart: Validate CSS Configuration Contracts

This guide describes the validation flow. `check:style-contracts` and `test:style-contracts` are available now, but they deliberately fail or cover only reviewed samples while the library audit is incomplete. Pull-request, release, and Pages workflows now collect a non-blocking full-inventory static diagnostic, publish its JSON artifact, and show failure counts in the job summary; pull requests also run the sample browser suite as a diagnostic in each browser. `verify:style-contracts` now emits a deterministic, schema-checked failed-property ledger and exits `1` for the current incomplete inventory; it does not yet execute or reconcile the complete browser and panel matrices, so a passing full gate and blocking release gate remain implementation work. See [the interface contract](contracts/styling-verification.md) for the intended final report and registry semantics and [the data model](data-model.md) for status rules.

## Prerequisites

- Node.js 24 and a clean root `npm ci` installation.
- Chromium, Firefox, and WebKit installed for the Playwright version pinned by this repository.
- Component manifests generated from the current source before the final audit.

```bash
npm ci
npx playwright install chromium firefox webkit
npm run build
```

The build is required because manifests and declaration output are part of the public contract. If source differs from checked-in manifests, regenerate and review the manifest changes before treating the audit as passing.

## Fast contract feedback

```bash
npm run check:style-contracts
npm run check:style-contracts -- --json # complete sorted static failure report
```

Expected: every publishable component, open-package element, and generated icon tag is discovered; source names, manifest names/defaults, compiled styling consumers, programmatic/delegated mappings, panel controls, and verification-case coverage agree. The command exits nonzero for a misspelled or unused variable, stale manifest, undocumented consumer, mismatched default, ambiguous composite control, or missing observable case. It does not claim that browser effects have passed.

## Full verification

```bash
npm run verify:style-contracts
```

Eventually expected: the static audit passes, every ordinary public property and applicable state has an observable Chromium result, generated icon families have per-tag contract coverage plus one representative live styling sample per icon set, each distinct rendering/state mechanism passes representative Firefox and WebKit checks, and every panel control family plus reset/save/copy/export flow passes. The final ledger has zero failed or unclassified properties. The current command reports each property as failed until the required browser and panel evidence exists; use `npm run verify:style-contracts -- --format=json --output=<path>` to inspect the sorted provisional ledger without mistaking it for a pass.

For a narrower diagnosis, run one planned browser project directly:

```bash
npm run test:style-contracts -- --project=chromium
npm run test:style-contracts -- --project=firefox
npm run test:style-contracts -- --project=webkit
```

The Firefox and WebKit commands will run only their representative matrices after that matrix is populated. None of these commands substitutes for the full gate when judging completion.

## Author a reviewed case

Add a renderable context and a `(tag, exact property name, state)` case to `scripts/data/style-contract-cases.json`. The context provides fixture markup and a settled target; optional declarative `stateSetup` attributes and `dimensions` are applied and verified before baseline capture. The case provides a valid contrasting value, the actual rendered target and declaration (or output assertion), browser selection including Chromium, and `reset: "remove-property"`. Static readiness and browser startup both validate the complete registry, including stale contexts, malformed setup, unsupported assertions, browsers, and reset modes. Pseudo-element cases must specify `pseudo: "::before"` or `"::after"`. Geometry or programmatic cases must specify `valueSyntax` as a CSS property that accepts the custom-property value (for example, `width` for a size or `color` for a canvas color). Geometry cases also specify the reviewed `geometryMetric` (`width`, `height`, `x`, `y`, or `area`) rather than comparing the entire box. Every case's observed syntax and contrasting value must match the published property type; an intentional transformation needs `syntaxRationale`. Use a literal contrasting value: unresolved `var(...)`, `env(...)`, or `attr(...)` references are invalid test input. A programmatic case must select the rendered `outputProbe` (`canvas-bitmap`, `svg-bitmap`, `image-bitmap`, or `text-content`); bitmap probes compare decoded pixels rather than markup or source strings and reject inaccessible output. Every assertion must target the tested host or its legitimate rendered boundary and pass a stable before/after/restore check; dynamic paths can add a reviewed `stabilityWindowMs` to detect delayed or stepped changes. A `slotted-style` case must target an element assigned through the tested host's slot, and a `delegated-style` case must declare its child component in `childTag`. Reuse a context for related properties. A case that only reads the assigned custom property back from the host is invalid: assert the intended shadow, slotted, delegated, geometry, or programmatic output instead. For generated icons, every tag receives a source/manifest check, while one live sample covers each identical shared icon-set styling path.

The observable assertion also checks a placebo host-style edit and a second valid value. Known types can infer that second value; for keyword-only values such as `justify-content: center`, provide a distinct literal `controlValue` (for example, `flex-end`). The browser validates both values against the observed syntax and exact published type. A redraw caused merely by `style` mutation or the presence of the tested property cannot pass. Computed-style, text, and bitmap output targets must render visibly; bitmap targets require positive rendered width and height, even if a zero-area canvas, image, or SVG still has changing intrinsic pixels. A hidden value or pixel change needs a different observable context or a reviewed target at the visible public output surface. SVG bitmap capture includes live computed filter, clipping, and transform styling before rasterization.

Run the focused Chromium suite and the static check after adding a case. The static check still fails until all other library properties are covered; read its exact `tag | name | category | source | state | target` diagnostics and the current [audit results](audit-results.md) rather than interpreting one new passing case as a whole-library pass.

## Review exceptions and name changes

Use `scripts/data/style-contract-exceptions.json` only for a browser-owned or third-party-rendered surface that cannot expose the normal route. A record needs the exact tag/property, limitation, user impact, supported alternative, technical reason, reviewer, review date, and reassessment date. The static audit rejects missing or expired review data, stale properties, and ordinary component-owned shadow styles. Final browser-evidence reconciliation is not implemented yet, so an entry cannot currently establish a full-gate pass.

For a corrected public typo, remove the old spelling from source and generated manifests, update docs/examples/theme overrides, and add an old-to-new entry in [migration.md](migration.md). There is no compatibility alias for a misspelling under this feature's policy.

## Diagnostic scenarios

1. **Known typo regression**: A contract that documents `--c2-color-slider--borde-leftr` while its implementation consumes `--c2-color-slider--border-left` must fail with `c2-color-slider`, both spellings, and a name-mismatch or unused-property diagnosis. After correction, the published name is `border-left`; migration guidance maps the old spelling to it without keeping an alias.
2. **Unused but assigned property**: Setting a host variable that never changes the intended border, color, dimension, or rendered output must fail observable verification, even if the host's computed custom-property value echoes the assignment.
3. **State-specific property**: A hover, focus, selected, disabled, open, loading, or error property is tested only in its activated state and reports that state on failure.
4. **Programmatic renderer**: Changing a chart or QR-code styling property through the host must update the drawn output after the documented refresh cycle. A property read without a resulting redraw does not pass.
5. **Composite panel control**: A shorthand radius and four corner radii cannot form one five-name four-value control. The mapping audit must reject it or the panel must present unambiguous separate controls.
6. **Generated family**: Each icon tag's manifest is checked; one representative icon per set verifies its shared CSS styling path. A genuinely distinct styling implementation receives its own sample.
7. **Stale manifest**: Changing source `@cssproperty` metadata without updating `custom-elements.json` must fail before browser verification.
8. **Exception**: A browser-owned or third-party-rendered surface may pass only with every exception field populated and an alternative styling route documented. A normal component shadow element cannot be exempted.

## Related repository gates

```bash
npm run docs:check
npm run test:type-check
npm run ui:build
```

These existing commands continue to check documentation coverage, test infrastructure typing, and the documentation site. CI's current style-contract diagnostics do not establish a passing or blocking full-library result: the static inventory still has unresolved failures, Firefox/WebKit representative selection and panel flows are incomplete, and the full verifier is fail-closed. Once those are resolved, the pull-request, release, and deployment workflows must run the complete verification command as a required gate. See [the plan](plan.md) for CI placement and remediation order.
