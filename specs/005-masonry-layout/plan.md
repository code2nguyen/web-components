# Implementation Plan: Responsive Masonry Tile Layout

**Branch**: `develop` (current checkout; feature context `005-masonry-layout`) | **Date**: 2026-09-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-masonry-layout/spec.md`

## Summary

Create `@c2n/masonry` with `c2-masonry` and `c2-masonry-item` as a separate automatic tile-packing primitive. Tiles declare row and responsive column spans; a pure first-fit packer derives coordinates from one global order. The container responds to its own width, allows explicit edit mode with reversible pointer and keyboard move/resize sessions, and emits one complete restorable snapshot per committed user change. Tile content remains application-owned and scrolls within a fixed declared height. The package, manifest, docs, gallery, preview, and browser scenarios follow existing workspace conventions.

## Technical Context

**Language/Version**: TypeScript 6.0.3, Lit 3.3.3, SCSS; Node 24 for repository scripts and CI.

**Primary Dependencies**: `lit`, `@c2n/core` helpers, `@c2n/sass` theme mixin, Vite 8 and the existing custom-elements-manifest plugin. Browser ResizeObserver and Pointer Events. No new runtime dependency is planned.

**Storage**: The component saves committed snapshots to localStorage by default, with opt-out and an optional stable key. Applications can still manage snapshots through `layout` and `layout-change`.

**Testing**: Pure packing and validation tests; Playwright component scenarios in Chromium, Firefox, and WebKit using the shared Vite fixture; representative touch, keyboard, axe, lifecycle, styling-effect, documentation, type, lint, and formatting checks.

**Target Platform**: Standards-based browser custom elements in the repository's supported desktop and mobile browser engines; framework-neutral package plus Astro documentation examples.

**Project Type**: Independently publishable npm workspace component package with a companion element and UI documentation integration.

**Performance Goals**: A mixed 12-tile dashboard repacks within one second after add, remove, resize, or container width change; the packer is deterministic and coalesces repeated gesture work to an animation frame. A 100-tile stress case checks growth and responsiveness without adding a new public limit.

**Constraints**: Keep one order across widths; keep each responsive column span independent; never persist coordinates; do not mutate application-owned child order; keep the tile's declared height and scroll overflow; no `c2-dashboard` runtime dependency; visual styling uses documented CSS custom properties and parts, while structural spans use properties/attributes.

**Scale/Scope**: One container with a dynamic set of direct `c2-masonry-item` children, four documented container-width ranges, mixed spans, one active edit session, and optional localStorage persistence. Cross-container dragging, arbitrary breakpoint configuration, and nested tile persistence are outside version 1.

## Constitution Check

_Gate evaluated before Phase 0 and re-evaluated after Phase 1 design._

| Principle / gate                  | Before research | After design | Evidence and planned verification                                                                                                                                                                                                                                                         |
| --------------------------------- | --------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. AI-first contracts             | Pass            | Pass         | [Public contract](contracts/masonry-elements.md) defines both tags, typed inputs, snapshot, events, slots, parts, defaults, identity rules, and accessibility. Source JSDoc and checked-in manifest must match.                                                                           |
| II. Complete styling control      | Pass            | Pass         | Container and item style inventory covers geometry presentation, surfaces, preview, controls, focus/hover/drag, and motion. CSS variables have Sass defaults; parts expose meaningful regions. Focused target-effect tests verify each public hook.                                       |
| III. Real-world examples          | Pass            | Pass         | UI docs, gallery, and landing preview will show a dashboard of differently sized cards/charts, responsive ranges, editing, overflow, and substantial theme customization with copyable markup.                                                                                            |
| IV. One contract across surfaces  | Pass            | Pass         | Package README, source JSDoc, manifest, generated API table, docs examples, and framework-facing declarations use the same names and event shape. Build and docs checks detect drift.                                                                                                     |
| V. Accessible, portable standards | Pass            | Pass         | Separate move/resize handles, keyboard sessions, live announcements, focus retention, scroll access, reduced motion, and mouse/touch/pen input are verified in browser tests. Root import registers both elements without framework dependency.                                           |
| Development quality gates         | Pass            | Pass         | Package build, test type-check, docs check, UI build, lint, format, browser behavior and focused styling evidence are required. The existing full-library style-contract verifier remains a known fail-closed feature-004 diagnostic; it is not reported as a passing gate for this work. |

No constitution exception is required for the proposed design. Any later inability to expose a visible styling choice or accessible interaction must be resolved or recorded through the constitution's exception process before implementation is considered complete.

## Project Structure

### Documentation (this feature)

```text
specs/005-masonry-layout/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/masonry-elements.md
└── tasks.md                  # Phase 2, created by $speckit-tasks
```

### Source Code (repository root)

```text
packages/components/masonry/
├── package.json              # root + companion entry exports
├── vite.config.ts            # two library and manifest source entries
├── custom-elements.json     # generated and committed
├── README.md
├── index.html                # local harness
├── src/
│   ├── masonry.ts            # container, edit coordinator, event boundary
│   ├── masonry-item.ts       # content scroll region and edit controls
│   ├── masonry-pack.ts       # pure first-fit placement
│   ├── masonry-model.ts      # ranges, snapshot validation, reconciliation
│   ├── masonry.scss
│   └── masonry-item.scss
└── test/
    ├── scenarios.html
    ├── scenarios.ts
    ├── masonry.spec.ts
    ├── masonry.a11y.spec.ts
    └── masonry-pack.spec.ts

apps/ui/
├── package.json
└── src/
    ├── content/components/masonry.mdx
    ├── content/gallery/masonry.mdx
    ├── data/component-modules.ts
    ├── data/component-previews.ts
    └── store/component-manifests.ts

package.json                   # explicit root build target
package-lock.json              # new workspace link after install
packages/tools/theme/package.json
packages/tools/framework-types/ # generated React/Vue/editor metadata after root build
tests/vite.config.ts           # only if companion subpath needs an explicit source mapping
```

**Structure Decision**: Use the standard `packages/components/*` package created by Plop, then extend it to two publishable elements like `tabs` and `dashboard`. Keep the packing and snapshot rules as pure local modules and use the existing shared browser-test server. Plop's placeholder docs, preview, and tests must be replaced with real examples and assertions.

## Phase 0: Research decisions

[research.md](research.md) resolves the packing algorithm, container responsive behavior, state ownership, gesture lifecycle, accessibility, styling, package wiring, and current validation limitation. No technical `NEEDS CLARIFICATION` item remains.

## Phase 1: Design artifacts

- [data-model.md](data-model.md) defines authored tiles, responsive ranges, snapshots, derived placements, editing transitions, and invalid-input handling.
- [contracts/masonry-elements.md](contracts/masonry-elements.md) defines the package exports and public element contract, including event and styling inventories.
- [quickstart.md](quickstart.md) describes executable validation scenarios, documentation integration, and the existing global style-audit caveat.

**Post-design constitution result**: All five principles and the relevant quality gates remain satisfied by the planned design. Implementation must demonstrate the listed evidence before completion; this planning result is not a claim that the component is already built or tested.
