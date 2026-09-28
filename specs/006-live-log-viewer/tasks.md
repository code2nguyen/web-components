# Tasks — revised virtual log content scope

The previous completed tasks described the superseded UI. This list replaces them following the user's 2026-09-26 correction.

- [x] T001 Revise spec, architecture and contract for content-only virtualization.
- [x] T002 Replace saved-filter model with arbitrary text attributes and imperative attribute/search criteria.
- [x] T003 Implement measured text line layout and cumulative variable-height index.
- [x] T004 Implement tabular grid, bounded sticky short attributes and viewport virtualization.
- [x] T005 Implement continuous text mode with visible line slicing inside large entries.
- [x] T006 Preserve reading anchors on reflow and tail-follow on append; implement clear and scrollToEnd.
- [x] T007 Replace obsolete scenarios/tests with variable-height, stickiness, API, accessibility and performance coverage.
- [x] T008 Remove slots/controls/statistics from README, harness, docs, gallery, preview, theme and slot audit.
- [x] T009 Validate all focused tests in three engines and resolve failures.
- [x] T010 Regenerate package manifest, framework declarations, component catalog and theme output.
- [x] T011 Run type, lint, format, docs and app build gates; record outcomes.

- [x] T012 Polish default terminal colors, spacing, metadata and severity styling without required consumer CSS.
- [x] T013 Replace docs/gallery/landing data with realistic server and commerce examples; highlight virtual scrolling and sticky attributes.
- [x] T014 Verify default appearance, theme compatibility, accessibility, scroll geometry and docs build.

- [x] T015 Implement filter/highlight modes, matching count and highlight styling for both virtual display layouts.
- [x] T016 Add commerce filter/highlight controls and update API documentation/contracts.
- [x] T017 Verify both match modes, future appends, clear, virtual scrolling, CSS customization and accessibility.

- [x] T018 Automatically measure the maximum width per attribute and allocate remaining width to message only.
- [x] T019 Verify width alignment through wrap/filter/append changes, update docs and regenerate API metadata.

- [x] T020 Add hover/focus copy action with full original-message clipboard writes and accessible feedback.
- [x] T021 Verify copying, filtering, large virtualized text, failures, keyboard/accessibility and regenerate docs/metadata.

- [x] T022 Add top spacing and transparent copy styling; hide pointer copy actions on scroll until deliberate pointer movement, preserving keyboard/touch access.

- [x] T023 Add safe, lightweight visible-text log token colors in both layouts; document styling and verify text, wrapping, filters and virtualization.

## Phase 1: Convergence

- [x] T024 CRITICAL Synchronize `packages/components/log-viewer/README.md` with the implemented contract: document automatic token colors, the `token` part, `--c2-log-viewer__token--color`, `--c2-log-viewer__copy--padding-top`, scroll-aware copy visibility, framework-neutral installation and use/avoid guidance; use unambiguous full CSS variable names and verify against source/manifest per Constitution I/IV and T008/T010 (partial, F1).
- [x] T025 CRITICAL Expose and document copy/check icon size and stroke customization through CSS variables or stable SVG parts in `packages/components/log-viewer/src/log-viewer.ts` and `log-viewer.scss`; verify both icons and regenerate affected metadata/docs per Constitution II and T020/T021 (partial, F2).
- [x] T026 Preserve logical token classifications across artificial wrapping and virtual line slice boundaries in `packages/components/log-viewer/src/log-tokens.ts` and `log-viewer.ts`; add regression coverage for split severity words, quoted values, URLs and IDs in both layouts, including scrolling inside a tall entry, while retaining bounded rendering, safe text and unchanged copy/geometry per spec: Message readability, plan: visible-text token colors and T023 (partial, F3).

- [x] T027 Fix CI keyboard boundary navigation in the focused virtual viewport and verify Home/End, modifier variants and tail-follow behavior in both layouts.
