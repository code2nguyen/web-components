# Data Model: Complete Slot Styling Contract

This feature has no runtime application data. Its entities describe a checked-in public-contract audit and the generated artifacts it validates.

## Slot Audit Registry

- **version**: Positive integer schema version; starts at `1`.
- **entries**: Ordered collection of Slot Audit Entry records.

Validation:

- Exactly one registry exists at `scripts/data/slot-styling-audit.json`.
- Every published manifest slot has exactly one entry.
- Entries that no longer resolve to a published tag and slot are stale and fail validation.

## Slot Audit Entry

- **tag**: Published custom-element tag, exact match to a manifest declaration.
- **slot**: Manifest slot name; the default slot is the empty string.
- **decision**: Exactly one of `part`, `variables`, `assigned-content`, or `delegated`.
- **parts**: Non-empty unique list of public part names when `decision` is `part`; absent otherwise.
- **variables**: Non-empty unique list of public CSS custom-property names when `decision` is `variables`; absent otherwise.
- **delegateTag**: Published custom-element tag whose own styling contract controls the relevant nested region when `decision` is `delegated`; absent otherwise.
- **reason**: Non-empty explanation of why the decision fully covers this slot. An `assigned-content` reason for a slot that accepts bare text identifies inherited host styling, another public hook, or an author-owned wrapper because text nodes cannot be targeted directly.
- **states**: Optional unique list of states in which the slot region or fallback is rendered.

Identity and relationships:

- Composite identity is `(tag, slot)`.
- `tag` and `slot` reference one Public Slot declaration.
- `parts` reference one or more CSS Part Contracts on the same tag.
- `variables` reference CSS custom properties on the same tag or a documented composed internal component.
- `delegateTag` references the assigned/nested custom element's own contract.

## Public Slot

- **tag**: Owning custom element.
- **name**: Named slot or empty string for the default slot.
- **description**: Public purpose and accepted content.
- **fallbackKind**: `none`, `text`, `native-element`, `icon`, `control`, `state`, or `component`.
- **conditionalStates**: States controlling whether the slot region exists.
- **dynamicFamily**: Optional family description for indexed or keyed slots.

Source of truth: generated `custom-elements.json` from authoritative source annotations.

## CSS Part Contract

- **tag**: Owning custom element.
- **name**: Stable semantic part name.
- **description**: Must identify related slot(s), exact controlled region, assigned/fallback scope, and conditional availability.
- **targetKind**: `wrapper`, `placement`, `slot-boundary`, `fallback`, `control`, or `shared-state`.
- **relatedSlots**: One or more public slot names, which may be empty for a broader component region.
- **states**: States in which the target exists or receives additive part names.

Source of truth: source `@csspart` annotation plus the real template `part` attribute; generated manifests must agree.

## Validation Report

- **missingEntries**: Published slots with no audit decision.
- **staleEntries**: Audit entries with no published slot.
- **duplicateEntries**: Repeated `(tag, slot)` identities.
- **invalidReferences**: Part, variable, or delegate references absent from the relevant manifests.
- **weakDescriptions**: Referenced parts whose descriptions omit slot/region/state meaning or use only the CEM generic fallback.
- **generatedDrift**: Generated manifests changed after a clean build.

The report is valid only when every collection is empty.

## Component Batch

- **name**: Delivery group such as `representative-mvp`, `forms`, or `collections-navigation`.
- **packages**: Independently publishable component packages.
- **coverageKinds**: Required representative cases: named, default, fallback, conditional, dynamic, shared-state, and nested-boundary.
- **verification**: Package builds, manifest regeneration, browser suites, docs, examples, and downstream registry checks.

State progression:

1. `unaudited`: no registry entry exists.
2. `audited`: every slot has a decision with valid references.
3. `implemented`: required parts/docs/examples exist and manifests are regenerated.
4. `verified`: unit, browser, docs, build, and drift gates pass.

## Slot Presence State

Represents whether a conditional component-owned region contains meaningful authored content.

- **host**: Custom element whose light DOM owns the assignment.
- **slot**: Named slot or empty string for the default slot.
- **presence**: `unknown`, `present`, or `empty`; `present` means an assigned element or non-whitespace text node exists.
- **derivedAt**: `server-default`, `client-pre-render`, `post-hydration`, or `slotchange`.
- **consumers**: Visual wrapper visibility, semantic/ARIA references, conditional classes, or fallback selection driven by the same value.

Validation and transitions:

1. Server rendering begins at `unknown` when real light DOM is unavailable; `unknown` MUST NOT be rendered as confirmed-empty hidden content.
2. A client-created component may resolve before its first render. An adopted server render MUST reconcile after initial hydration, because a pre-hydration reactive write may be recorded without updating adopted markup.
3. `slotchange` transitions the same state after insertion, removal, or reassignment.
4. A present slot MUST NOT remain inside a hidden conditional wrapper after upgrade.
5. Visual visibility and ARIA references MUST agree; separate presence calculations for those consumers are invalid.

## Theme Cache State

Models the chart controller's cached, engine-ready theme.

- **value**: Resolved `ChartTheme`.
- **source**: `fallback` when probes were unavailable, otherwise `computed`.
- **notificationMode**: `silent` for the one-time post-commit fallback reset or `notify-host` for an external runtime theme change.

State transitions:

1. A pre-commit read may create `fallback`.
2. The controller's first post-commit lifecycle clears `fallback` silently.
3. `ChartBase.updated()` resolves `computed` during the already-running engine synchronization.
4. Document theme mutation, media-query change, or `c2n-theme-change` clears any value with `notify-host`, schedules one host update, and rebuilds engine options.
5. A silent reset MUST NOT schedule another Lit update.

## Lifecycle Validation Result

- **hydratedRegions**: Conditional slot regions inspected after SSR upgrade.
- **hiddenAuthoredRegions**: Present slots whose owning wrappers remain hidden; must be empty.
- **changeInUpdateWarnings**: Lit warnings captured for the tested custom elements; must be empty.
- **initialThemeMismatches**: First engine options that do not reflect authored CSS variables; must be empty.
- **runtimeThemeMismatches**: Theme changes that do not reach the engine and legend; must be empty.
