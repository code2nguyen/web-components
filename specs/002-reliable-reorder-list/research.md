# Research: Reliable Reorder List

## Decision 1: Separate visual order from authored DOM order

**Decision**: Maintain an explicit ordered array of ordinary direct-child element references. Render that array through stable private assignment identifiers, but never physically reorder consumer-owned direct children.

**Rationale**: The selected product model requires an immediate committed visual result while the application remains responsible for persisting business-data order. Physical DOM mutation conflicts with framework ownership; index-based slot mutation conflates identity, authored order, and visual order. Element identity remains stable even when labels repeat or optional keys are absent.

**Alternatives considered**:

- Physically move light-DOM children: rejected because framework renderers may restore or duplicate application-owned nodes.
- Emit a proposal and wait for the application: rejected because it causes snap-back/flicker and contradicts the selected immediate-commit behavior.
- Keep numeric slot indexes as the state model: rejected because indexes change as a consequence of the operation and are not stable identity.

## Decision 2: Use one explicit reorder-session state machine

**Decision**: Model pointer and keyboard interactions with the same original-order snapshot, active item, source index, candidate index, input method, and terminal commit/cancel paths.

**Rationale**: The current implementation spreads state across booleans, slot attributes, document listeners, cached coordinates, and animation-frame work. An explicit state machine makes every cancellation reason idempotent and ensures cleanup is testable.

**Alternatives considered**:

- Maintain separate pointer and keyboard reorder engines: rejected because destination, fixed-item, event, and reconciliation rules would drift.
- Infer state only from DOM classes/slots: rejected because transient presentation is not a reliable source of behavioral truth.

## Decision 3: Replace mouse events with Pointer Events and capture

**Decision**: Use one primary Pointer Events path for mouse, touch, and pen. Record the candidate source on pointerdown, start only after the threshold, capture after pickup, use `clientX`/`clientY` with viewport rectangles, commit on valid pointerup, and cancel on pointercancel, unexpected lost capture, outside release, Escape, mutation, editability loss, disconnect, or invalid visibility.

**Rationale**: Pointer Events provide hardware-agnostic input and capture. The W3C specification defines automatic release after pointerup/pointercancel and identifies pointer capture as the mechanism for continuing interaction after the pointer leaves the original target. Consistent viewport coordinates eliminate the current page/viewport offset bug. Source: [W3C Pointer Events](https://www.w3.org/TR/pointerevents/).

**Alternatives considered**:

- Keep document mouse listeners and add separate touch listeners: rejected because it duplicates behavior and still excludes pen.
- Use native HTML Drag and Drop: rejected because touch and keyboard behavior remain inconsistent and preview/control is less predictable across browsers.
- Add a third-party drag library: rejected because the component needs a small vertical-only contract and the repository currently carries no such runtime dependency.

## Decision 4: Make touch gesture ownership explicit

**Decision**: Whole-row touch reordering owns the vertical direct-manipulation gesture once armed; automatic scrolling provides movement during an active drag. Interactive descendants never arm a reorder. Document a dedicated handle as a possible future extension, not part of this feature.

**Rationale**: Browser panning behavior is determined before the drag threshold, so whole-row vertical touch dragging cannot simultaneously promise native vertical page scrolling on the same surface. Hiding this tradeoff would make touch behavior appear intermittently broken.

**Alternatives considered**:

- Preserve native vertical scrolling everywhere on the row: rejected because reliable whole-row touch drag cannot then be guaranteed.
- Require a drag handle now: rejected because the feature specification explicitly chooses whole-item interaction and adding item-wrapper markup to consumer content would expand scope.

## Decision 5: Use list/listitem semantics, not listbox/option

**Decision**: Expose a named list and listitem placement wrappers with absolute position metadata. Keep arbitrary consumer descendants semantically intact.

**Rationale**: The component permits headings, buttons, links, inputs, and other rich descendants. The ARIA listbox pattern does not provide an accessible model for semantic interactive content inside options. Generic list semantics communicate order without flattening descendant meaning. Sources: [WAI-ARIA APG Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/), [APG rearrangeable listbox example](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-rearrangeable/).

**Alternatives considered**:

- Use listbox/option: rejected because this is not a selection widget and rich descendants would become problematic.
- Add no collection semantics: rejected because position, size, and list naming would be unavailable to assistive technologies.
- Use deprecated `aria-grabbed`/`aria-dropeffect`: rejected because those drag states are obsolete and do not replace keyboard behavior or announcements.

## Decision 6: Use a Space-based keyboard reorder mode

**Decision**: Exactly one movable placement wrapper is in the tab sequence. Space picks up and drops; Up/Down moves one permitted destination; Home/End moves to the first/last permitted destination; Escape cancels. Reorder keys from interactive descendants are ignored. Focus remains associated with the same element identity.

**Rationale**: The model separates normal focus navigation from an explicit reorder mode, avoids intercepting Enter from nested controls, and follows the APG principles of predictable focus and arrow-key operation inside composites. Source: [WAI-ARIA APG keyboard interface guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/).

**Alternatives considered**:

- Use Enter and Space interchangeably: rejected because Enter must remain available to descendant controls and links.
- Reorder immediately with unmodified arrows while idle: rejected because it makes focus navigation and reordering indistinguishable.
- Put every movable wrapper in the tab sequence: rejected because long lists would add excessive tab stops.

## Decision 7: Announce state through one persistent status region

**Decision**: Keep a visually hidden polite, atomic status region alive for the component lifetime. Announce pickup instructions, new positions, boundaries, commit, cancellation, and duplicate-key configuration errors. Prefer `data-reorder-label`, then an accessible/visible-text fallback; never speak persistence keys by default.

**Rationale**: Updating an existing status region produces predictable announcements without repeatedly inserting live regions. Item labels and absolute position provide useful context, while raw keys are often unsuitable for users.

**Alternatives considered**:

- Rely only on visual placeholder movement: rejected because it is unavailable to nonvisual users.
- Create and remove a live region per update: rejected because announcements may be missed or duplicated.

## Decision 8: Introduce canonical typed `reorder`, retain legacy `change` temporarily

**Decision**: Fire one bubbling, composed, non-cancelable `reorder` event after a real committed change. Its typed detail contains the moved item, optional key, absolute indexes, full resulting order, and concrete input method. During a documented compatibility window, also fire the deprecated `change` event once with its legacy numeric permutation payload and existing flags; remove it only in the next explicitly breaking release.

**Rationale**: Replacing the detail of a published event in place silently breaks consumers. A semantic event name and typed payload establish the durable contract while a bounded alias gives existing listeners a migration path. Initialization, external reconciliation, cancellation, threshold-only gestures, no-op drops, and errors emit neither success event.

**Alternatives considered**:

- Replace `change.detail` in place: rejected because old code would receive an unexpected object instead of `number[]`.
- Remove `change` immediately: rejected because the constitution requires migration guidance for breaking public API changes.
- Keep only the legacy payload: rejected because it cannot express stable identity, input method, or an application-ready resulting order.

## Decision 9: Use element identity plus optional `data-reorder-key`

**Decision**: Element references are authoritative. A non-empty `data-reorder-key` adds stable application identity; missing keys are valid. Before pickup, reject duplicate non-empty keys, retain the order, emit one `reorder-error`, and announce the configuration error.

**Rationale**: Simple HTML needs no required metadata, while state-managed applications can persist an order across rerenders. A namespaced data attribute avoids colliding with a consumer's generic `key`/`value` conventions. Rejecting duplicates prevents ambiguous persistence without throwing during component lifecycle.

**Alternatives considered**:

- Require keys: rejected because ordinary static markup should work without extra configuration.
- Use text or `id` as implicit identity: rejected because text can repeat and `id` has document-wide semantics unrelated to persistence.
- Continue with duplicate keys and omit them from the event: rejected because the application may silently persist the wrong item.

## Decision 10: Keep fixed items at absolute visual indexes

**Decision**: Continue using `data-fixed`, parsed with repository boolean semantics: absent, `"false"`, and `"0"` are movable; empty presence or other values are fixed. Reorder the movable subsequence and refill non-fixed positions, so fixed elements never move but movable elements may cross them.

**Rationale**: This satisfies both fixed absolute placement and cross-fixed movement. Absolute event indexes remain understandable and testable.

**Alternatives considered**:

- Treat fixed items as barriers: rejected because it prevents movable items from changing relative order across a pinned row.
- Remove fixed-item behavior: rejected because it is an existing consumer feature and part of the approved specification.

## Decision 11: Use current viewport geometry and one auto-scroll loop

**Decision**: Find the nearest ancestor whose vertical overflow permits scrolling and whose content overflows. Measure wrappers with viewport rectangles, refresh after scroll/layout changes, and run at most one request-animation-frame loop near an edge. Honor `autoScrollDisabled` and cancel all work on every terminal path.

**Rationale**: The current code compares page coordinates with viewport rectangles and can recurse into non-elements. A single coordinate system and explicit eligible-container test remove both errors.

**Alternatives considered**:

- Cache geometry only at pickup: rejected because scrolling, animation, and responsive content invalidate it.
- Scroll the document unconditionally: rejected because embedded lists must use their nearest intended container.

## Decision 12: Keep motion decorative and reduced-motion safe

**Decision**: Preserve direct pointer tracking and necessary auto-scroll, but disable interpolated item movement, fades, scaling, and transitions when reduced motion is requested. Effective public motion duration becomes zero.

**Rationale**: Direct tracking and scrolling enable the task; interpolation is decorative. This keeps the interaction understandable without requiring motion.

**Alternatives considered**:

- Disable all movement including preview tracking: rejected because pointer feedback and destination discovery would fail.
- Ignore reduced motion because drag is interactive: rejected because post-layout interpolation and fades are avoidable animation.

## Decision 13: Test real boundaries and qualify device claims

**Decision**: Run trusted mouse and keyboard journeys in Chromium, Firefox, and WebKit; add a touch-capable Playwright project where supported; test shared pointer-type behavior for pen without claiming hardware validation; manually smoke-test VoiceOver/Safari and NVDA with Firefox or Chrome.

**Rationale**: Synthetic event dispatch proves handlers but not browser gesture/capture integration. Conversely, standard CI lacks pen hardware, so the documentation must distinguish contract coverage from real-device coverage.

**Alternatives considered**:

- Call synthetic events full touch/pen coverage: rejected because it overstates evidence.
- Require physical pen hardware in CI: rejected as impractical for this repository; a targeted manual check can be added when hardware is available.
