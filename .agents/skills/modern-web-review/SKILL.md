---
name: modern-web-review
description: Check a c2-* component, new or changed, against modern web platform best practices (the modern-web-guidance guides) and the repo's browser support policy, so it uses current platform features with the right fallbacks instead of legacy patterns. Use while designing or implementing a component (with the new-component skill), when updating an existing one, and as the review step before a pull request next to /code-review and /security-review.
argument-hint: '[component ids or paths]  (default: everything changed on the branch)'
---

# Modern web review

Two halves: **before code**, pick the platform feature the job calls for from the guides; **after code**, scan and
review the diff for the old patterns those guides replace. The 2026-11 platform audit of all 234 components is where
the rules below come from; its report is the artifact "c2n Platform Audit".

## Browser support policy

This is the policy in AGENTS.md, "Modern web platform". Every recommendation states the Baseline status the guide
gives:

| Status                   | Use it                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Widely available**     | Freely, no fallback.                                                                                                                                                                       |
| **Newly available**      | Yes, with the fallback the guide prescribes (feature-detect with `@supports` / `in` checks). The component must work, maybe less smoothly, without it.                                     |
| **Limited availability** | Only as progressive enhancement over a path that already works everywhere (e.g. `hidden="until-found"` that behaves as `hidden`, anchor positioning gated over floating-ui). No polyfills. |

## 1. Before writing code: consult the guides

For each behaviour the component needs, search the guides and read the matching one before choosing an approach:

```bash
npx -y modern-web-guidance@latest search "<what the component must do>"
npx -y modern-web-guidance@latest retrieve "<id>[,<id>…]" > /tmp/mwg-<id>.md   # read the file; output can be long
```

Guides that map to recurring component shapes in this repo:

| Component shape                                 | Read                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| any custom element                              | `accessible-web-components`, `custom-elements`, `shadow-dom`, `styling-web-components`, `prerendering-custom-elements`    |
| form control (form-associated)                  | `form-associated-custom-elements`, `forms`, `accessible-error-announcement`, `validate-input-after-interaction`           |
| text input with Enter to submit/commit/add      | `ime-safe-enter-submit`                                                                                                   |
| field that grows with content                   | `form-fields-automatically-fit-contents` (`field-sizing: content`)                                                        |
| popup, dropdown, menu, tooltip, hover card      | `viewport-aware-dropdowns`, `position-aware-tooltips`, `interest-triggered-tooltips`, `menu`, `animate-to-from-top-layer` |
| dialog, sheet, drawer                           | `dialog`, `light-dismiss-a-dialog`, `prevent-page-scroll-under-modal-dialog`, `navigation-drawer`                         |
| toast, banner, anything shown above a modal     | `persistent-toast-notifications`, `persistent-top-layer-ui`                                                               |
| collapsible, tabs, accordion, tree              | `accordion`, `tabs`, `search-hidden-content` (find-in-page), `animate-to-intrinsic-sizes`                                 |
| scroll-linked visual (progress, shadows, stuck) | `scroll-progress-indicator`, `scrollability-affordance-hints`, `state-aware-sticky-headers`                               |
| long list / grid / feed                         | `defer-rendering-heavy-content` (`content-visibility`), `interactions-in-complex-layouts`, `break-up-long-tasks`          |
| drag, swipe, pan                                | `drag-and-drop`, `swipe-to-reveal`, `dynamic-sort`, `move-dom-element-without-losing-state`                               |
| canvas, chart, animation loop                   | `efficient-background-processing`, `accessibility` ("complex images and charts")                                          |
| HTML from strings, markdown, rich text          | `sanitize-untrusted-html`, `trusted-types`                                                                                |
| motion of any kind                              | `motion` (reduced motion), `animate-element-entry-exit`                                                                   |
| colour, focus, dark surfaces                    | `color` (forced colors, contrast), `component-specific-light-dark-theme`                                                  |

Write the decision into the design doc next to the six foundation decisions (new-component step 1): the feature
chosen, its Baseline status, and the fallback.

## 2. After writing code: scan

```bash
node .claude/skills/modern-web-review/scripts/scan.mjs            # lines changed on this branch vs origin/develop, plus uncommitted
node .claude/skills/modern-web-review/scripts/scan.mjs packages/components/<id>   # a whole package (when updating one)
node .claude/skills/modern-web-review/scripts/scan.mjs --all      # the whole library (backlog view)
```

It exits 1 on an `error` finding. `warn` findings need a decision, not necessarily a change. A finding that is
deliberate gets a comment on the line or the line above, with the reason:

```ts
// modern-web-ignore: host-attribute-write removes only the id the fallback path generated
```

The scanner only catches what a regex can see. Step 3 is the review.

## 3. Review the diff against the old → new patterns

Read the diff (`git diff origin/develop...` plus uncommitted) with this table open. Each row is something the audit
found in shipped components:

| Old pattern                                                                                                 | Modern pattern                                                                                                           | Guide                                    |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Enter handler checks `isComposing` only, or nothing                                                         | `isComposingKey(event)` from `@c2n/core/dom-helper.js` (adds Safari's `keyCode === 229`)                                 | `ime-safe-enter-submit`                  |
| `formDisabledCallback` ignores a disabled fieldset when the own attribute exists                            | keep the fieldset check, as `text-field`'s `formDisabledCallback` does                                                   | `form-associated-custom-elements`        |
| form control without `formStateRestoreCallback` / `setValidity` anchor                                      | restore what `setFormValue` stored; anchor validity on the inner focusable control                                       | `form-associated-custom-elements`        |
| focus drawn only by border, background or box-shadow (`focus--outline: none`)                               | `@use '@c2n/sass/focus'` + `@include focus.forced-colors-ring` on the focused element                                    | `color`                                  |
| `:focus` driving a visible style                                                                            | `:focus-visible` (`:focus-within` on a container)                                                                        | `accessibility`                          |
| collapsed/inactive content `display: none` or unrendered                                                    | `<details>` / `::details-content`, or `hidden="until-found"` + `beforematch`                                             | `search-hidden-content`                  |
| JS height animation for expand/collapse                                                                     | `::details-content` + `interpolate-size` (keep JS only as fallback)                                                      | `animate-to-intrinsic-sizes`             |
| fixed + z-index layer that must show over a modal                                                           | top layer: `popover="manual"` on a shadow element                                                                        | `persistent-toast-notifications`         |
| hand-written outside-click / Escape for a popup                                                             | `popover="auto"` (or `hint`), `<dialog closedby>`; keep the handler only as fallback                                     | `light-dismiss-a-dialog`                 |
| `showModal()` reusing a stale `returnValue`                                                                 | reset `dialog.returnValue = ''` before opening                                                                           | `dialog`                                 |
| tooltip with `pointer-events: none`, no hide delay, Escape only on the trigger                              | hoverable bubble, short hide delay, document Escape while open (WCAG 1.4.13)                                             | `interest-triggered-tooltips`            |
| `aria-describedby`/`aria-labelledby` by id across a shadow boundary; `id`/`role` written on author children | `ariaDescribedByElements`/`ariaLabelledByElements`; semantics on a shadow wrapper; host semantics via `ElementInternals` | `accessible-web-components`              |
| inline style or attribute written on the host                                                               | a shadow element, `internals.states` + `:state()`, or a reflecting `@property`                                           | `prerendering-custom-elements`           |
| `innerHTML` / `insertAdjacentHTML` with a string, even a constant                                           | Lit `render(html\`…\`)`/`svg\`…\``, or a cloned `<template>`                                                             | `trusted-types`                          |
| canvas with no name or data alternative                                                                     | `role="img"` + `aria-label` on the plot, a visually hidden data table                                                    | `accessibility`                          |
| JS autosize (`scrollHeight` → `style.height`)                                                               | `field-sizing: content`                                                                                                  | `form-fields-automatically-fit-contents` |
| scroll listener + rAF + `getBoundingClientRect` for a visual                                                | scroll-driven animations / scroll-state queries, JS as `@supports` fallback; IntersectionObserver for visibility         | `scroll-progress-indicator`              |
| every row of a long list laid out                                                                           | virtualize, or `content-visibility: auto` + `contain-intrinsic-size` on div rows                                         | `defer-rendering-heavy-content`          |
| rect reads inside pointermove / interleaved reads and writes                                                | cache rects at drag start, batch reads before writes                                                                     | `interactions-in-complex-layouts`        |
| live redraw while off-screen or in a hidden tab                                                             | coalesce to one frame; pause when off-screen (IO / `contentvisibilityautostatechange`)                                   | `efficient-background-processing`        |
| drag tracked with document `pointermove`                                                                    | `setPointerCapture` + `touch-action`                                                                                     | `drag`                                   |
| `localeCompare(…, options)` per comparison                                                                  | one cached `Intl.Collator`                                                                                               | `sortable-table`                         |
| `::slotted(a + b)` or any complex selector                                                                  | compound selectors only; spacing with `gap` / `:not(:first-child)`                                                       | `shadow-dom`                             |
| `allow-discrete` inside the `transition` shorthand                                                          | separate `transition-behavior: allow-discrete`                                                                           | `animate-to-from-top-layer`              |
| animation/transform without a reduced-motion path; infinite animation running off-screen                    | `@media (prefers-reduced-motion: reduce)`; pause off-screen                                                              | `motion`                                 |

Things the guides deliberately say **not** to adopt yet here: Temporal (Limited, polyfill cost; `zoned-time.ts` with
`Intl` is correct), customizable `<select>` for `c2-select` (Limited, multi-select), the CSS anchor positioning
polyfill (its limits break `position-try-fallbacks`), and replacing `<mark>` search hits with the Custom Highlight API
where `part="match"` is public API.

## 4. Report

In the pull request description (AGENTS.md, "Before opening a pull request"), list what the modern web review found
and what was done: each scanner `error` fixed or justified with a `modern-web-ignore` comment, each `warn` decided, and
each review finding with its guide id. A finding that needs a larger change or a public API change is left for a
follow-up and said so.

When a guide shaped the code, end the summary with a `### Modern Web Guidance` section: one bullet per guide id, the
non-obvious choice or fallback it required, and a short verbatim quote of the rule (re-retrieve the guide rather than
quoting from memory).
