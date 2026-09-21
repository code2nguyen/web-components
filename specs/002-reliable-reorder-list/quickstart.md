# Quickstart: Validate Reliable Reorder List

## Prerequisites

- Node.js 24
- Repository dependencies installed with `npm ci`
- Chromium installed for focused validation; all Playwright engines installed for final cross-browser validation
- Feature implementation complete against [the public contract](contracts/reorder-list-contract.md)

## 1. Type-check and build the package

```sh
npm run type-check -w packages/components/reorder-list
npm run build -w packages/components/reorder-list
```

Expected outcome:

- The component and exported event-detail/event-map types compile.
- `custom-elements.json` contains the documented properties, real observed attribute names, events, slots, parts, CSS properties, defaults, and accessibility descriptions.
- Generated React and Vue declarations reference the real `ReorderListEventMap` and expose canonical events.

## 2. Run the focused Chromium behavior suite

```sh
npx playwright test packages/components/reorder-list/test --project=chromium
```

Expected outcome:

- A real mouse drag commits the displayed destination and fires one canonical `reorder` event.
- Threshold-only, no-op, readonly, canceled, external-reconciliation, and invalid-key paths fire no success event.
- Fixed items retain absolute positions while movable items cross them.
- Nested controls keep ordinary click, text-entry, and keyboard behavior.
- Canonical and legacy payloads match the contract exactly.
- All terminal paths leave no preview, placeholder, capture, scroll loop, or temporary assignment active.

## 3. Validate keyboard and accessibility behavior

Run the focused keyboard/accessibility tests:

```sh
npx playwright test packages/components/reorder-list/test --project=chromium --grep "keyboard|accessibility|focus|announcement"
```

Expected outcome:

- Space picks up/drops; arrows and Home/End move; Escape cancels.
- Focus remains associated with the same item, including after commit and cancellation.
- Removing an active item applies the documented focus fallback.
- The host's accessible-name route names the component-owned list boundary, and every ordinary item exposes one listitem representation with correct absolute position/size.
- The persistent status region reports pickup instructions, position, boundaries, commit, cancellation, and duplicate-key error.
- Reorder keys from nested interactive descendants are not intercepted.
- Axe reports no WCAG A/AA violations in representative idle and active states.

Before release, manually smoke-test the keyboard flow with VoiceOver/Safari and NVDA with Firefox or Chrome. Confirm that instructions and status messages are understandable and not duplicated.

## 4. Validate scrolling, geometry, pointer cancellation, and reduced motion

```sh
npx playwright test packages/components/reorder-list/test --project=chromium --grep "scroll|pointer|cancel|motion"
```

Expected outcome:

- Offset/scrolled containers and unequal or changing item heights produce the correct destination.
- The nearest eligible vertical container scrolls at its edges and stops at boundaries.
- `autoscrolldisabled` prevents component-driven scrolling.
- Pointercancel, lost capture, outside release, Escape, mutation, editability loss, removal, and disconnect all restore a clean idle state.
- Reduced-motion emulation disables nonessential interpolation while pointer/keyboard ordering and necessary auto-scroll remain usable.

## 5. Run the complete cross-browser package suite

```sh
npm run test:all -- packages/components/reorder-list/test
```

Expected outcome: the complete reorder-list suite passes on Chromium, Firefox, and WebKit. Touch-capable project coverage and focused pen pointer-type coverage pass where configured; reports distinguish those automated checks from physical-device validation.

## 6. Verify the standalone harness and consumer documentation

```sh
npm run dev -w packages/components/reorder-list
```

The repaired harness should load without a misspelled import or remote utility-CSS dependency and demonstrate:

1. a realistic editable queue;
2. one fixed item and one nested interactive control;
3. stable keys and labels;
4. custom placeholder/preview feedback;
5. canonical persistence handling; and
6. keyboard instructions and visible focus.

Then build the documentation application:

```sh
npm run ui:build
npm run docs:check
npm run check:dogfood
```

Expected outcome:

- Docs and gallery examples use only the documented public contract.
- Usage explains application persistence, fixed items, keys, keyboard operation, touch tradeoff, event migration, and styling boundaries.
- API tables agree with the regenerated manifest.

## 7. Verify generated and AI-facing artifacts

```sh
npm run build:tools
npm run mcp:smoke
git diff --check
```

Review the generated diffs for:

- `packages/components/reorder-list/custom-elements.json`
- `packages/components/reorder-list/react.d.ts`
- `packages/components/reorder-list/vue.d.ts`
- `packages/tools/skill/skills/c2n-components/references/component-catalog.md`

`packages/tools/mcp/data/registry.json` and framework-types `dist/` output are generated locally but are not committed. Update `scripts/data/slot-styling-audit.json` only if the declared slot/part relationship changes.

Expected outcome: human docs, manifests, framework types, slot audit, and AI metadata describe the same contract with no uncommitted generator surprise.

## 8. Run repository release gates

```sh
npm run build
npm run test:type-check
npm test
npm run lint:check
npm run format:check
npm run docs:check
npm run check:lifecycle
npm run check:dogfood
npm run ui:build
```

For final release confidence, repeat the reorder-list package suite with `npm run test:all -- packages/components/reorder-list/test` after the clean build.

## Event migration check

Validate one successful move with listeners for both event names:

- `reorder` fires once with item element/key, absolute indexes, resulting order, and input method.
- Deprecated `change` fires once with the legacy numeric permutation.
- Every non-change path fires neither event.
- Duplicate-key pickup fires one `reorder-error` and no success event.

The README and UI docs must tell consumers to migrate persistence code to `reorder` before the next explicitly breaking release.

## Validation record — 2026-09-21

Automated validation completed:

- package type-check and build passed;
- 108 reorder-list browser cases passed across Chromium, Firefox, WebKit, and the touch-capable Chromium project;
- the 100-attempt event-cardinality run produced one canonical and one compatibility event for every real commit and none for cancel/no-op paths;
- the 20-item keyboard journey completed within the 10-second budget;
- representative axe WCAG A/AA checks passed;
- generated custom-elements metadata, Vue declarations, slot audit, AI catalog, MCP smoke test, documentation checks, lifecycle checks, dogfood checks, and the Astro UI build passed;
- repository build, TypeScript test infrastructure, formatting, lint (with 21 pre-existing warnings and zero errors), and the 669-pass/8-skip Chromium component suite passed; and
- the constitution review remains PASS: the implementation exposes a complete machine-readable contract, CSS-owned presentation, realistic public examples, synchronized generated surfaces, standards-based input, keyboard/focus/status behavior, and no undocumented exception.

Hardware and assistive-technology qualification:

- automated touch-device emulation and synthetic pen pointer-type contract coverage passed; these results are not physical touch or pen hardware validation;
- VoiceOver/Safari and NVDA/Firefox-or-Chrome manual smoke tests remain required before release. NVDA is not available on this macOS implementation host, so this evidence must be recorded by a reviewer with the required platforms.
