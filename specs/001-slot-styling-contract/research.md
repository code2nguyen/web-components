# Research: Complete Slot Styling Contract

## Decision 1: Do not create one CSS part per slot

**Decision**: Audit every public slot, but expose parts only for meaningful component-owned wrappers, placement regions, slot boundaries, or visible fallback elements.

**Rationale**: The `part` attribute may be placed on a shadow-tree element, including `<slot>`, but a slot is normally `display: contents` and often has no useful box. A part on the slot exposes only that slot element; it does not expose assigned light-DOM nodes or cross into the shadow root of an assigned custom element. Consumers already own assigned nodes and can apply local classes to them. Sources: [CSS Shadow Parts](https://drafts.csswg.org/css-shadow-1/#part), [slots in a shadow tree](https://drafts.csswg.org/css-shadow-1/#slots-in-shadow-tree).

**Alternatives considered**:

- Add `part` directly to all 244 literal source slots: rejected because it creates a large weak API, often without a box to style, and falsely suggests access to assigned content.
- Add no new parts and rely only on assigned-node styles: rejected because consumers cannot reach component-owned layout, wrappers, or fallback surfaces.

## Decision 2: Keep assigned-node and component-owned styling separate

**Decision**: Document two explicit routes: a consumer styles its assigned light-DOM node directly; the host's public part styles the component-owned region around or behind it. A nested custom element uses its own public styling contract.

**Rationale**: `::slotted()` is component-internal, matches assigned elements rather than text or descendants, and is not an external consumer hook. CSS Modules compile local class names to ordinary CSS, so they can style assigned light-DOM nodes and host `::part()` selectors. Framework-scoped behavior varies: Angular Emulated encapsulation does not support `::part`, so guidance must identify the global/unscoped placement alternative. Sources: [slotted pseudo-element](https://drafts.csswg.org/css-shadow-1/#slotted-pseudo), [CSS Modules local scope](https://github.com/css-modules/css-modules/blob/master/docs/local-scope.md), [Angular component styling](https://angular.dev/guide/components/styling).

**Alternatives considered**:

- Promise that a parent part styles inside the slotted custom element: rejected because it violates shadow boundaries.
- Recommend only global selectors: rejected because it discards the framework-local styling use case.

## Decision 3: Store explicit audit decisions outside generated manifests

**Decision**: Add `scripts/data/slot-styling-audit.json`, keyed by published tag and manifest slot name, with exactly one decision: `part`, `variables`, `assigned-content`, or `delegated`.

**Rationale**: The relationship is not name-equivalent. A default slot may map to `body`; several state slots may share `state`; dynamic slot families may map to stable regions; some slots need no part. The current manifest schema records slots and parts independently, so a repository-level audit registry is the lowest-risk way to prove 100% coverage.

**Alternatives considered**:

- Require a same-name part for every slot: rejected because it conflicts with existing semantic names and many-to-one mappings.
- Extend CEM with a custom slot-to-part field: deferred because it would require coordinated schema, normalizer, API, MCP, and tooling changes before the audit can begin.
- Keep an unvalidated prose checklist: rejected because it becomes stale and cannot enforce SC-001.

## Decision 4: Expose real wrappers and fallback elements

**Decision**: Prefer parts on existing semantic wrappers (`header`, `body`, `footer`, `actions`, `state`) or actual fallback elements. Put a part on `<slot>` only when styling the slot/inheritance boundary itself is intentional and documented.

**Rationale**: The codebase already follows this convention. No literal `<slot>` currently has a `part` attribute. Mature examples include Header, Sheet, Virtual List, Chat Message, Progress, and Dash Card. Card and Status Panel are representative gaps with existing semantic wrappers/fallback regions but no parts.

**Alternatives considered**:

- Wrap every slot in a new element: rejected because it can change layout, selectors, accessibility, and intrinsic behavior unnecessarily.
- Expose dynamic part names matching dynamic slot names: rejected because stable semantic regions are easier to document and consume.

## Decision 5: Require explicit source descriptions

**Decision**: Every new or reused slot-region part must have explicit `@csspart` prose naming the related slot, controlled region, fallback/assigned behavior, and conditional states.

**Rationale**: `scripts/cem-plugin-customize/index.js` correctly discovers literal and conditional part attributes, but its fallback description is intentionally generic. FR-005 requires meaning that cannot be inferred from a name alone. Explicit source prose remains authoritative and flows into package manifests and API pages.

**Alternatives considered**:

- Depend on generated generic descriptions: rejected because they cannot distinguish wrapper, placement, fallback, or state semantics.
- Hand-edit generated manifests: rejected because builds overwrite them and violate the one-contract principle.

## Decision 6: Validate behavior through external selectors

**Decision**: Browser tests inject host `::part()` CSS, assert a computed visual/structural result, and then assert slot assignment, fallback behavior, interaction, focus, semantics, and accessibility remain intact.

**Rationale**: Checking for a `part` attribute proves only markup presence. The public contract is the external selector and observable region. The repository already uses Playwright across supported engines and package-local tests.

**Alternatives considered**:

- Snapshot only the generated manifest: rejected because metadata can claim a hook that does not work.
- Assert only internal `[part]` presence: rejected because it bypasses the consumer boundary.

## Decision 7: Demonstrate the boundary in the Vue scoped-style example

**Decision**: Add a realistic example to `apps/examples/support-inbox-vue` showing a local/scoped class on assigned content and an externally placed `::part()` rule for its component-owned region, with a note about framework selector-placement differences.

**Rationale**: The Vue example already represents a framework consumer and is better suited than the current React example, which uses global CSS rather than CSS Modules. The example proves both sides of the styling boundary without creating a framework adapter dependency.

**Alternatives considered**:

- Build a new framework example: rejected as unnecessary scope.
- Add only an API-table note: rejected because the constitution requires realistic, runnable examples.

## Decision 8: Treat slot presence as an SSR hydration contract

**Decision**: Represent conditional slot-region presence as `unknown | present | empty`. Render `unknown` conservatively so authored server content remains available, reconcile after hydration from assigned content, then use `slotchange` for later mutations with the same meaningful-content predicate.

**Rationale**: Lit server rendering cannot inspect a custom element's real light-DOM children through the current `hasSlottedContent()` helper, so the helper returns `false`. Astro then hydrates declarative shadow DOM whose conditional wrappers were emitted as hidden. A server-rendered slot does not necessarily produce a later `slotchange`, so waiting for that event leaves authored content permanently collapsed. Writing a reactive flag before hydration completes is also insufficient: hydration may adopt the server markup and record the client value as committed without applying it. A tri-state model preserves content on the server, then performs one warning-safe reconciliation after hydration. The confirmed direct helper consumers are Card, Dash Card, Details, Modal, Radio, Separator, Sheet, Spinner, and Switch; at least 17 more components rely only on `slotchange` for presence state.

**Alternatives considered**:

- Write a boolean during `connectedCallback()`/`willUpdate()` before hydration: rejected as the universal fix because adopted server markup can retain its old hidden state while Lit records the new value as already committed.
- Recalculate directly in `firstUpdated()`: rejected because it writes reactive state during Lit's active update and emits `change-in-update`; scheduling reconciliation after `updateComplete` is the warning-safe alternative.
- Trust `slotchange` after hydration: rejected because pre-existing declarative-shadow assignments may not emit another event.
- Treat server `unknown` as permanently visible: rejected because empty wrappers can contribute padding, borders, layout, and ARIA relationships after hydration; visibility is conservative only until reconciliation.
- Rewrite every component with slot-presence state: rejected; 31 files form the audit set, but only components that fail the same SSR/hydration invariant should change.

## Decision 9: Separate chart cache invalidation from update notification

**Decision**: Let `ChartThemeController` silently discard a theme value that was resolved from fallback data before probes existed. Preserve the notifying invalidation path for actual runtime theme changes.

**Rationale**: `ChartBase.firstUpdated()` currently calls `themeController.invalidate()`. That clears the cache, invokes `handleThemeChange()`, and calls `requestUpdate()` while Lit is completing the same update, producing `change-in-update`. The already-running `ChartBase.updated()` immediately calls the engine synchronization path and can resolve the committed probes, so the second update is redundant. A controller `hostUpdated()` hook can clear only the fallback cache before `ChartBase.updated()` runs, keeping the policy encapsulated. This affects all nine concrete charts: Line, Area, Bar, Sparkline, Pie, Gauge, Radar, Scatter, and Candlestick.

**Alternatives considered**:

- Suppress Lit's warning: rejected because it hides a real redundant update.
- Keep `invalidate()` and tolerate the second cycle: rejected because it wastes work on every initial chart render and obscures future lifecycle regressions.
- Expose a public silent option on every invalidation call: acceptable but less encapsulated than tracking whether the controller cached fallback because probes were unavailable.
- Stop reacting to runtime theme changes: rejected because document theme attributes, media-query changes, and `c2n-theme-change` must still rebuild engine options and legend presentation.

## Decision 10: Test the real integration boundary and warning budget

**Decision**: Add one Astro SSR/hydration browser regression for conditional slot regions and a shared no-`change-in-update` assertion covering every concrete chart element. Retain component-level dynamic-slot tests and add runtime theme-change coverage.

**Rationale**: Client-only component fixtures cannot reproduce declarative shadow DOM hydration, while an Astro gallery does. Conversely, the chart warning belongs to the shared base and is most efficiently guarded by a parameterized chart scenario. Existing chart tests partially verify computed CSS-token use but do not capture console warnings, omit an Area Chart scenario, and do not prove that runtime theme invalidation remains notifying.

**Alternatives considered**:

- Test only the Pie Chart gallery: rejected because the warning is inherited by all `ChartBase` subclasses.
- Test only Card in the client-only component fixture: rejected because that fixture inserts markup after load and does not reproduce SSR hydration.
- Assert only final screenshots: rejected because hidden slot regions and redundant updates need structural and console evidence.

## Decision 11: Enforce lifecycle hygiene beyond ChartBase

**Decision**: Use one console-warning harness and a static audit guard for reactive writes or `requestUpdate()` calls in `firstUpdated()`. Refactor every confirmed warning path; review `updated()` second passes individually and retain only behavior that genuinely depends on committed DOM.

**Rationale**: The same Lit warning pattern exists outside charts. Confirmed first-update paths include Breadcrumb separator state, Menu trigger presence, nested Step children, Radio Group label/description state, Code Viewer slot state, and Reorder List slot mapping. Several `updated()` methods conditionally normalize values or measure DOM; some can move earlier, while measurement may legitimately require a later task. Treating all second passes as identical would risk changing public behavior.

**Alternatives considered**:

- Fix only the warning reported on Pie Chart: rejected because shared lifecycle defects would remain in other documented examples.
- Ban every update scheduled after render: rejected because DOM-dependent measurement and genuinely asynchronous effects may require a later update.
- Depend on manual console review: rejected because warnings are easy to miss and the repository already has successful warning assertions in component tests.

## Baseline Findings

- Documentation validator baseline: 89 documented elements, 292 public slots, 254 CSS parts.
- 78 elements expose slots; 35 slot-bearing elements currently expose no parts.
- Source baseline: 77 TypeScript modules with slots across 61 component directories; approximately 108 slots include fallback markup.
- Twenty-eight slot-bearing packages have no explicit `@csspart` declarations, making them priority audit targets.
- Clear first targets: Card (`media`, `header`, default/body, `footer`) and Status Panel (`media`, `title`, `description`, `content`, `actions`).
- Nine component source files directly use `hasSlottedContent`; at least 17 more rely on slotchange-only presence state; 31 files maintain reactive slot-presence state and require classification as SSR-safe, SSR-unsafe, or client-only.
- All nine concrete `ChartBase` elements share the same initial notifying theme invalidation. Existing tests have no family-wide warning assertion and no Area Chart scenario.
- Six additional non-chart components have confirmed reactive writes/requested updates in `firstUpdated()`; conditional `updated()` paths require case-by-case classification rather than a blanket rewrite.

## Implementation Validation (2026-09-20)

- The support-inbox Vue example builds with a normal class on assigned message content and a global host `::part(content)` selector for the chat-message-owned region.
- Vue's template type checking accepts stable class selectors on custom elements but rejects undeclared `data-*` attributes in the generated custom-element types. The example therefore uses `thread__message`, `thread__message-copy`, and `thread__nested-avatar` as its verification selectors.
- The framework caveat remains unchanged: scoped attributes style assigned light DOM, while public part selectors must be emitted globally and stop at the nested avatar's shadow root.
