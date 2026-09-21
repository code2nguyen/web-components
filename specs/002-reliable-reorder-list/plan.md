# Implementation Plan: Reliable Reorder List

**Branch**: `002-reliable-reorder-list` | **Date**: 2026-09-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-reliable-reorder-list/spec.md`

## Summary

Replace the current mouse-only, coordinate-fragile reorder implementation with an explicit visual-order and reorder-session model. Keep consumer-owned direct children in place, render their committed visual order through stable internal assignments, and reconcile later application-authored child changes without user-change events. Unify mouse, touch, and pen under Pointer Events with capture; add a fully specified keyboard path, list semantics, focus retention, live announcements, fixed-item anchors, deterministic cancellation, scrolling, reduced motion, typed events, complete styling hooks, and cross-browser tests. Publish `reorder` as the canonical post-commit event, retain the legacy numeric `change` event through the next breaking release, and synchronize the package manifest, framework declarations, documentation, examples, and AI-facing catalog.

## Technical Context

**Language/Version**: TypeScript 6.0.3 and JavaScript ES modules on Node.js 24

**Primary Dependencies**: Lit 3.3.3, `@lit-labs/motion` 1.1.0, `@c2n/core`, shared `@c2n/sass` theming, Vite, and `vite-plugin-cem`

**Storage**: In-memory element-reference order and transient session state only; the consuming application persists business-data order

**Testing**: Playwright 1.63 across Chromium, Firefox, and WebKit; shared component fixture and axe helper; TypeScript compiler; package build; documentation, lifecycle, dogfood, UI, and generated-artifact checks

**Target Platform**: Standards-based custom elements in supported evergreen desktop and mobile browsers, with framework-neutral HTML plus generated React and Vue declarations

**Project Type**: Multi-package web-component library with generated API metadata, documentation site, browser suites, framework declarations, and AI tooling

**Performance Goals**: Pointer preview and placeholder updates remain responsive at a 60 Hz interaction cadence for a 100-item list; at most one component render is scheduled per meaningful destination change; idle child reconciliation and a completed reorder are linear in item count; automatic scrolling uses one animation-frame loop

**Constraints**: Vertical single-list reordering only; never physically reorder consumer-owned light DOM; preserve current `editable`, `dragStartThreshold`, and `autoScrollDisabled` properties and their existing observed attribute spellings; keep existing parts and CSS variables backward compatible; fixed items retain absolute positions; numeric slot assignments remain private implementation metadata; no external drag library; no synthetic touch or pen claim presented as hardware coverage

**Scale/Scope**: Empty through 100 direct-child items, including mixed keyed/unkeyed and fixed/movable items; one active reorder session and primary pointer at a time; component package, tests, standalone harness, README, docs/gallery, generated manifest/framework declarations, slot audit if its contract changes, and checked-in AI catalog

## Constitution Check

_Gate result before research: PASS. Re-evaluated after Phase 1 design: PASS._

- **AI-First Component Contracts — PASS**: The design defines every property, attribute, item marker, event payload, slot, part, CSS variable, keyboard command, error, state, and accessibility responsibility in a typed contract that flows into generated metadata.
- **Complete Styling Control — PASS**: Existing presentation remains CSS-owned; the plan documents container, item, placeholder, preview, focus, active, divider, and motion hooks without adding presentation properties.
- **Real-World Examples — PASS**: The standalone harness and UI docs/gallery will demonstrate a realistic editable queue with fixed rows, nested controls, stable keys, persistence handling, keyboard instructions, scrolling, and styling.
- **One Contract, Every Documentation Surface — PASS**: Source annotations remain authoritative; package README, manifest, framework declarations, UI docs, slot audit, and AI catalog are regenerated and checked together. The legacy event has an explicit migration path.
- **Accessible, Portable Web Standards — PASS**: Pointer Events replace mouse-only listeners; list/listitem semantics preserve rich descendant semantics; keyboard, focus, live announcements, reduced motion, and cancellation receive real browser coverage.
- **Quality Gates — PASS**: Public behavior is verified through real mouse and keyboard input across all three engines, a touch-capable browser project, focused pointer-type contract tests, axe, manual screen-reader smoke checks, type/build/docs/lifecycle gates, and generated-artifact review.
- **Governance — PASS**: No constitutional exception is required. The only compatibility transition is documented, bounded to the next breaking release, and backed by migration guidance.

## Project Structure

### Documentation (this feature)

```text
specs/002-reliable-reorder-list/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── reorder-list-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md                     # created later by $speckit-tasks
```

### Source Code (repository root)

```text
packages/components/reorder-list/
├── src/
│   ├── reorder-list.ts          # order/session model, pointer + keyboard behavior, semantics, events
│   └── reorder-list.scss        # theme variables, parts, focus/active states, reduced motion
├── test/
│   ├── reorder-list.spec.ts     # behavior, accessibility, contract, scrolling and lifecycle coverage
│   └── scenarios.html           # focused browser harness
├── README.md                    # installation, public contract, migration and complete usage
├── index.html                   # standalone manual example
├── custom-elements.json         # generated and committed
├── react.d.ts                   # generated and committed
└── vue.d.ts                     # generated and committed

apps/ui/src/content/
├── components/reorder-list.mdx  # usage, accessibility, persistence and migration guidance
└── gallery/reorder-list.mdx     # realistic queue and visual variants

scripts/data/slot-styling-audit.json
                                   # update only if the slot/part decision changes

packages/tools/skill/skills/c2n-components/references/component-catalog.md
                                   # generated and committed AI discovery entry

packages/tools/mcp/data/registry.json
packages/tools/framework-types/dist/
                                   # generated locally, not committed
```

**Structure Decision**: Rewrite behavior inside the existing publishable component package rather than creating a shared drag subsystem. The interaction state is specific to one vertical list and does not yet justify a new core abstraction. Keep downstream documentation and generated artifacts as consumers of the source contract.

## Phase 0: Research Decisions

Research is consolidated in [research.md](research.md). The decisive findings are:

1. Store visual order explicitly as element references; use stable private assignment ids only to project consumer children into wrappers. Direct-child DOM order remains application-owned.
2. Represent every pointer or keyboard interaction as one state-machine session with an original-order snapshot and one idempotent commit/cancel cleanup path.
3. Use Pointer Events and capture for mouse, touch, and pen; use viewport coordinates consistently, cancel on pointer cancellation/lost capture/outside release, and make touch gesture ownership explicit.
4. Use `role="list"` and `role="listitem"`, not listbox/option, because items may contain rich semantic and interactive descendants.
5. Use roving wrapper focus. Space picks up/drops, Up/Down moves among permitted destinations, Home/End jumps, and Escape cancels; reorder keys from interactive descendants are ignored.
6. Keep one persistent polite, atomic status region for pickup, move, boundary, commit, cancel, and invalid-key announcements. Do not use deprecated ARIA drag states.
7. Make `reorder` the typed canonical post-commit event. Keep legacy `change` with its existing numeric permutation detail only through the next breaking release; never replace the old payload in place.
8. Identify items authoritatively by direct-child element reference and optionally by `data-reorder-key`; block an attempted reorder and emit `reorder-error` when a non-empty key is duplicated.
9. Preserve `data-fixed`, but parse it with the repository's boolean semantics. Fixed elements remain at absolute indexes while movable items reorder around them.
10. Recalculate visible geometry from viewport rectangles during scrolling/layout changes, honor `autoScrollDisabled`, and stop every animation frame/listener on all exit paths.
11. Disable nonessential movement in reduced-motion mode while keeping direct tracking, keyboard movement, placeholder state, and necessary auto-scroll functional.
12. Treat generated metadata, framework declarations, docs, examples, the slot audit, and AI catalog as one release contract.

## Phase 1: Design

### State and Contract Model

[data-model.md](data-model.md) defines Item Reference, Visual Order, Reorder Session, Geometry Snapshot, Auto-Scroll State, Announcement State, and event records. [contracts/reorder-list-contract.md](contracts/reorder-list-contract.md) defines the exact public attributes, item markers, slots, parts, keyboard model, event payloads, error behavior, compatibility window, and accessibility contract.

### Delivery Sequence

1. **Typed public foundation**: add item/event types and typed listener overloads; define stable key, fixed marker, canonical and compatibility events, and duplicate-key validation.
2. **Deterministic order model**: separate authored child order from committed visual order; assign stable private projection ids; exclude special feedback children; reconcile idle mutations without notifications.
3. **Unified lifecycle**: introduce armed, pointer-dragging, keyboard-reordering, committed, and canceled transitions with one cleanup path that releases capture, listeners, animation frames, scroll state, preview transforms, and transient assignments.
4. **Pointer behavior**: record the source at pointerdown, exclude interactive descendants/non-primary input, apply the threshold, capture after pickup, use consistent viewport coordinates, compute valid movable destinations, and commit only on a valid pointerup.
5. **Keyboard and accessibility**: add list/listitem metadata, roving focus, Space/arrow/Home/End/Escape behavior, same-item focus retention, hidden instructions, persistent status announcements, and active-item removal fallback.
6. **Fixed and keyed items**: hold fixed absolute indexes, let movable items cross them, expose absolute event indexes, parse fixed values consistently, and fail safely on duplicate keys.
7. **Scrolling and layout**: find the nearest eligible vertical scroll container, maintain fresh rectangles, implement one bounded animation-frame loop, honor opt-out, and handle no-ancestor/offset/unequal-size cases.
8. **Styling and motion**: retain old variables and parts, document all variables in source, add focus/active/preview/placeholder/motion coverage, make default feedback visible, and snap nonessential movement under reduced motion.
9. **Behavioral verification**: replace fragile slot-centric tests with real input/output tests for order, payload, cardinality, reconciliation, nested controls, fixed rows, cancel paths, scrolling, accessibility, focus, axe, reduced motion, and cleanup across engines.
10. **Consumer surfaces**: repair the standalone harness, expand README and UI examples, document the legacy-event migration, regenerate manifest/framework declarations, update the slot audit if needed, rebuild AI metadata, and review generated diffs.

### Interaction Design

- Idle visual order is an array of ordinary direct-child elements. The array is rendered through stable internal assignment ids; consumers never author numeric slots.
- While editing is enabled, movable item surfaces declare the vertical gesture ownership required by Pointer Events before pointerdown; this is necessary because `touch-action` cannot be changed after a gesture begins. Pointerdown records the candidate item and origin but does not yet suppress a click. Crossing the threshold begins the session, captures the pointer, and displays preview/placeholder feedback.
- Keyboard focus belongs to the placement wrapper for one movable item. Space enters reorder mode; movements update the same candidate order used by pointer input; Space commits and Escape restores the snapshot.
- Fixed positions are reserved before placing the reordered movable subsequence. Thus `[A, F, B, C]` moved from first to last becomes `[B, F, C, A]`, and the event reports absolute index `0 -> 3`.
- Pointerup inside the valid list commits the current candidate; outside release, pointercancel, lost capture, Escape, child mutation, editability loss, active-item removal, disconnect, or invalid visibility cancels.
- An application child mutation while idle replaces the component's retained visual order with authored direct-child order. A mutation during a session cancels first and then reconciles. No reconciliation path emits user reorder events.

### Accessibility Design

- The host exposes list semantics and mirrors a consumer `aria-label`/`aria-labelledby` naming route. Each placement wrapper exposes listitem semantics and absolute `aria-posinset`/`aria-setsize` values.
- Listbox/option is rejected because options flatten rich descendant semantics and do not model items containing buttons, links, and inputs.
- Exactly one movable wrapper participates in the tab order. Fixed wrappers do not become reorder controls, but all consumer-owned descendants retain their native tab behavior.
- Focus follows the same element identity through moves, commit, cancel, and reconciliation. Removing the active item moves focus to the nearest surviving movable item or the host when none remains.
- The persistent status region announces the item label and absolute position. Labels prefer `data-reorder-label`, then an accessible/visible-text fallback; persistence keys are never spoken by default.
- Automated assertions cover DOM semantics, focus, instructions, live text, and axe. Manual smoke checks cover VoiceOver/Safari and NVDA with Firefox or Chrome before release.

### Event and Compatibility Design

- `reorder` fires once after a real committed change. It bubbles, crosses the shadow boundary, is not cancelable, and carries the moved item reference/key, absolute from/to indexes, the complete resulting order, and `mouse | touch | pen | keyboard` input method.
- Deprecated `change` fires once alongside `reorder` during the compatibility window and preserves its numeric permutation payload and existing flags. It never fires alone or on initialization/reconciliation/no-op/cancel.
- `reorder-error` fires once for an attempted operation when duplicate non-empty keys make persistence identity ambiguous. The operation does not start, order remains unchanged, and no success event fires.
- Documentation marks `change` for removal in the next explicitly breaking release and shows migration to `reorder`.

### Verification Strategy

- Unit-like browser tests verify order transforms and event payloads through public markup and real input rather than private methods.
- Pointer coverage uses trusted mouse input across Chromium, Firefox, and WebKit plus a dedicated touch-capable Playwright project where supported. Pen shares the Pointer Events path and receives focused pointer-type contract coverage; documentation does not claim real hardware validation.
- Keyboard tests exercise Space, arrows, Home/End, Escape, focus retention, boundary announcements, fixed rows, nested controls, and Tab order after a commit.
- Lifecycle tests cover every cancellation reason and assert no active pointer capture, document listeners, scroll listener, animation frame, placeholder, preview transform, or transient slot remains.
- Reconciliation tests cover insertion, removal, DOM reorder, active-item removal, synchronous app persistence from an event handler, mixed keyed/unkeyed items, duplicate keys, and zero notifications for external changes.
- Geometry tests use offset/scrolled containers and unequal/changing heights; event coordinates and rectangles are all viewport-based.
- Styling tests apply public parts/variables externally, emulate reduced motion, and verify both visible default feedback and zero nonessential animation.
- A focused 100-item interaction check records destination renders and animation-frame work so pointer movement does not schedule more than one render per destination change or more than one auto-scroll frame at a time.
- Contract tests build the package, inspect the generated manifest and framework declarations, and ensure docs/AI artifacts agree.

## Post-Design Constitution Check

_PASS_: The Phase 1 state model and public contract cover all behavioral, styling, accessibility, documentation, testing, and migration obligations identified before research. The design adds no presentation property, private consumer dependency, framework-only behavior, or undocumented exception.

## Complexity Tracking

No constitution violations or exceptional complexity require justification.
