# Masonry implementation validation guide

Use this after the component and its tests are implemented. The expected public API and snapshot shape are in [contracts/masonry-elements.md](contracts/masonry-elements.md); validation rules and edit transitions are in [data-model.md](data-model.md).

## Prerequisites

- Work from the repository root with the project's Node version and dependencies installed (`npm install`). After generating the new package, run `npm install` again so `@c2n/masonry` has its workspace link.
- Install the needed Playwright engines once with `npx playwright install chromium firefox webkit` before running browser suites.
- Use the standard package harness in `packages/components/masonry/index.html` and shared scenario page in `packages/components/masonry/test/scenarios.html`.

## Package and contract checks

```bash
npm run build -w packages/components/masonry
npm run build:tools
npm run test:type-check
npm run docs:check
npm run lint
npm run format:check
```

Expect the package build to produce and check in `packages/components/masonry/custom-elements.json` with both public tags, attributes/properties, events, slots, parts, and CSS custom properties. `build:tools` refreshes React/Vue declarations and editor metadata from that manifest. The generated metadata must agree with the source JSDoc, package README, and docs page. The root build graph and theme build must include the new package. No generated manifest or framework declaration may change on a second clean build.

## Component behavior

```bash
npx playwright test packages/components/masonry/test --project=chromium
npx playwright test packages/components/masonry/test --project=firefox
npx playwright test packages/components/masonry/test --project=webkit
```

The package suite should prove these observable outcomes through actual component boundaries and real user input:

1. A 12-tile set with at least three span shapes packs deterministically without overlap or out-of-bounds placement. Adding, removing, and changing a tile repacks within the spec's one-second target. Empty layout occupies no phantom rows.
2. A narrow, medium, and wide **container** changes column count and effective spans even when the viewport stays fixed. One global order remains, while a resize at one range leaves other ranges' spans unchanged.
3. Tall content scrolls inside its tile at a fixed span and is reachable with keyboard and pointer. Slotted buttons, links, inputs, and charts work normally outside edit handles.
4. Pointer, touch, and keyboard move and resize gestures show a candidate destination, commit one complete `layout-change` snapshot on a real change, and emit none for a no-op, cancel, or programmatic `layout` assignment.
5. Duplicate/missing IDs and invalid spans/snapshots leave content visible, block unsafe editing, and report the documented diagnostic. Removal, disconnect, lost pointer capture, viewport/container resize, and scroll during a gesture leave no active listeners or pending scroll frames.
6. Accessible names, focus retention, status announcements, reduced motion, and at least one representative axe scan pass in relevant edit and normal states. A variable or part edit visibly changes its documented target; a host value echo alone does not count.

The standard Playwright config discovers this suite in all three engines. If touch behavior has a dedicated project, include it in `playwright.config.ts`; otherwise run an explicit touch-device project/configuration in the package suite.

## Documentation integration

```bash
npm run build -w apps/ui
npm run ui:build
```

Expect `/components/masonry` to present installation, a copyable responsive dashboard usage example, an editable example that logs a committed snapshot, styling customization, and the generated API for both tags. The landing preview and gallery should show mixed tile sizes, narrow layout, overflowing content, and edit controls without relying on private APIs. `c2-dashboard` documentation must continue to describe fixed, author-positioned tracks as the distinct alternative.

## Styling diagnostic caveat

Run focused new-tag styling checks and attach the observed target effects to the change. `npm run check:style-contracts` and `npm run verify:style-contracts` currently report pre-existing incomplete full-library coverage documented in `specs/004-verify-css-contracts/audit-results.md`. Record the new tag's findings separately; do not claim a full-library style-contract pass until feature 004 closes that gate.
