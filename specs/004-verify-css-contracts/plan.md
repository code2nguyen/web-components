# Implementation Plan: Verifiable CSS Configuration Contracts

**Branch**: `[004-verify-css-contracts]` | **Date**: 2026-09-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-verify-css-contracts/spec.md`

## Summary

Build an enforceable contract between each published CSS custom property, the component's actual styling or programmatic rendering, and the docs configuration panel. A static audit will compare source declarations, generated manifests, Sass themes, compiled CSS, programmatic consumers, and panel mappings. A deterministic browser suite will prove observable effects for every in-scope property in Chromium, with representative Firefox and WebKit coverage. The initial audit will repair existing defects, document breaking name corrections, and finish with zero unexplained failures before CI becomes blocking.

## Technical Context

**Language/Version**: Node.js 24; TypeScript 6.0.3; modern JavaScript modules; Sass/SCSS.

**Primary Dependencies**: Lit 3 component runtime, Sass 1.104.0, Vite 8, custom-elements-manifest/vite-plugin-cem, Astro 7 documentation UI, Playwright 1.63.0. Reuse repository dependencies and existing manifest/fixture infrastructure; no new service is required.

**Storage**: Checked-in component source, `custom-elements.json` files, a reviewed verification-case/exception registry, and generated CI reports. No database or persistent application data.

**Testing**: Node unit and mutation cases for inventory/default/grouping diagnostics; full Chromium observable matrix; representative Firefox/WebKit matrix; representative docs-panel interaction tests; existing build, docs, type-check, and component suites.

**Target Platform**: Publishable web components in Chromium, Firefox, and WebKit; Node 24 quality gates in local development and GitHub Actions.

**Project Type**: npm-workspaces component library with an Astro documentation application and repository-level verification tooling.

**Performance Goals**: Keep the static audit suitable for every pull request (target under 30 seconds after build); batch the full Chromium matrix within a practical CI job (target under 15 minutes). These are implementation benchmarks, not permission to skip properties.

**Constraints**: Every public property has an exact owner and one status; no screenshot baseline as proof; deterministic target-level assertions; generated families may share runtime evidence only for an identical styling path; corrected misspellings have no alias and require migration guidance; ordinary shadow-DOM properties cannot use exceptions.

**Scale/Scope**: All publishable component, open-package, and icon tags, including hundreds of generated icons and more than two thousand documented CSS properties. The audit expands automatically with new packages and properties.

## Constitution Check

_GATE: Evaluated before research and re-evaluated after Phase 1 design._

| Constitution obligation                                                  | Before research | After design | Design evidence                                                                                                                      |
| ------------------------------------------------------------------------ | --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| I. AI-first public contracts are complete and machine-readable           | Pass            | Pass         | Per-tag inventory and report schema preserve exact names, types, defaults, descriptions, state, target, and evidence.                |
| II. Every visible presentation choice has a working public styling route | Pass            | Pass         | Target-level observable cases cover every property and applicable state; limited exceptions follow the constitution.                 |
| III. Real-world examples are runnable and customizable                   | Pass            | Pass         | Cases use settled component fixtures and representative docs examples; existing documentation coverage remains a gate.               |
| IV. Source, manifests, docs, examples, and tools agree                   | Pass            | Pass         | Source-to-generated-manifest comparison, panel mapping audit, CI drift check, and migration table prevent parallel contracts.        |
| V. Standards portability and accessibility remain intact                 | Pass            | Pass         | Full Chromium checks, representative Firefox/WebKit checks, public-host writes, state activation, and existing accessibility suites. |
| Development workflow and governance                                      | Pass            | Pass         | Build, type, docs, static, browser, and UI checks are specified; no constitution exception or undocumented behavior is introduced.   |

No constitution violation is required. A platform exception is valid only under the ratified browser-owned/third-party rule and must carry the required review data.

## Design

### Contract inventory and static audit

1. Discover publishable packages from workspace/package metadata, including `packages/icons/*`; read every custom-element declaration and source `@cssproperty` entry. Reject missing manifests, duplicate `(tag, name)` identities, stale generated output, and inconsistent names, types, or defaults.
2. Compile each component's Sass entry with the current toolchain. Collect public `var(...)` references, fallback order, rendered declarations, selectors, and theme defaults from compiled output. Classify explicit TypeScript, inline-style, and delegated child uses separately. Unclassified or unused public properties fail; private variables are excluded only when they are not published or settable through the public contract.
3. Normalize only semantically equivalent CSS values when comparing defaults. Preserve authored source and compiled value in mismatch diagnostics. Resolve references to other public properties and detect unresolved or cyclic fallback chains.
4. Reconcile every discovered tag with the docs site's `componentManifests` registry, then match each property to one inspector control descriptor and exact write target. Reject absent tags, duplicate mappings, missing controls, invalid type handling, and composite controls with ambiguous shorthand/longhand precedence or more than four side/corner values.
5. Produce a sorted per-property ledger and actionable failure categories. The contract and registry formats are defined in [contracts/styling-verification.md](contracts/styling-verification.md).

### Observable suite

1. Derive straightforward target/style assertions from compiled CSS and shared fixture patterns. Maintain explicit verification contexts for required state, content, pseudo-element, slotted child, delegated component, geometry, animation, canvas, or other programmatic output. Each case specifies a valid contrasting value and intended observable target; a host variable echo does not pass.
2. Render each context through the existing Vite/Playwright component fixture, wait for definition and stable updates, capture the baseline, set one host property, activate or preserve the required state, then assert the intended observable change. Validate test value syntax before interpreting a no-change result. Reset between cases to avoid masking and cascade interactions.
3. Give each ordinary tag/property/state path a Chromium result. For generated icons, statically check every tag and live-test one representative icon per icon set for its shared CSS styling path; SVG shape/weight variants do not multiply size/color styling cases. A genuinely distinct styling implementation requires its own sample. Extend test discovery and Vite source resolution to include icon samples.
4. Run a curated Firefox/WebKit set that includes each distinct rendering path and state mechanism. Keep the exhaustive Chromium matrix separate from the representative cross-browser matrix in CI.
5. For programmatic themes, assert downstream output after the same host edit the panel makes. Repair stale theme caches or missing redraw triggers discovered by this suite, including chart-like surfaces, without accepting a read-only proof as visual evidence.

### Configuration panel and remediation

1. Extract the panel's row/control selection into a pure descriptor builder, then validate its mapping for the full inventory. Preserve existing manifest-driven rendering and make shorthand and longhand rows unambiguous.
2. Interactively verify each distinct control family and the common change, reset, save, copy, and export flows on representative components. Compare resulting host property, visible target, and reproduced configuration.
3. Correct existing source/manifest/Sass/consumer defects found by the audit. For every misspelled published name, replace it immediately across examples, presets, documentation, and manifests and publish an old-to-new migration entry. Fix valid-property behavior without changing its public result.
4. Add a static readiness command and a full verification command that reconciles static results, the Chromium matrix, representative Firefox/WebKit cases, and panel tests into one final ledger. Wire the full command into pull-request CI, retain existing changed-component behavior tests, and ensure new packages are included automatically. The blocking gate starts only after the full initial audit reaches zero unexplained failures and zero unclassified properties.

## Project Structure

### Documentation (this feature)

```text
specs/004-verify-css-contracts/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── styling-verification.md
└── tasks.md                 # Created by $speckit-tasks, not this phase
```

### Source Code (repository root)

```text
scripts/
├── check-css-contracts.mjs  # Existing consumer-reference check; keep its public purpose
├── check-style-contracts.mjs # Planned static component-side audit
├── verify-style-contracts.mjs # Planned full gate and final report
├── lib/                     # Package discovery, compiled-CSS inventory, cases, diagnostics
└── data/                    # Reviewed verification contexts and platform exceptions
packages/components/*/
├── src/                     # Authoritative JSDoc, Sass, and programmatic consumers
├── custom-elements.json     # Generated, checked-in public contract
└── test/                    # Existing behavior and targeted styling tests
packages/icons/*/
├── src/                     # Shared base styling plus generated icons
└── custom-elements.json     # Per-tag generated contracts
tests/
├── component-fixture.ts     # Existing settled-element browser fixture
└── style-contracts/         # Planned generated/explicit observable matrix and icon samples
apps/ui/
├── src/components/configuration/ # Inspector controls and pure descriptor mapping
├── src/utils/              # Manifest normalization, host sync, preset/reset/export helpers
└── test/                   # Representative inspector interaction coverage
.github/workflows/
├── component-tests.yml      # Full and representative contract gates on pull requests
└── deploy.yml               # Build and manifest/documentation coherence
```

**Structure Decision**: Extend repository-level scripts and existing component tests; keep package source as the authoritative API. Place shared verification contexts beside repository test infrastructure and retain package-local behavior tests. Do not add a new publishable package for the auditor.
