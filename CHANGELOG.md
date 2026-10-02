# Changelog

All `@c2n/*` packages are versioned together. This file is generated from the commit history by
`npm run changelog` — do not edit it by hand.

## [0.0.19](https://github.com/code2nguyen/web-components/releases/tag/v0.0.19) — 2026-09-29

### Features

- **mcp, skill:** Know about @c2n/components ([8bc883e](https://github.com/code2nguyen/web-components/commit/8bc883e))
- **mcp:** Gallery looks for agents: index, search, themed CSS, screenshots ([660a575](https://github.com/code2nguyen/web-components/commit/660a575))
- **components:** Add @c2n/components, every component in one install ([8eaeeb6](https://github.com/code2nguyen/web-components/commit/8eaeeb6))
- **skill:** GitHub Copilot support, proxy-safe MCP startup, dashboard composition ([db7e699](https://github.com/code2nguyen/web-components/commit/db7e699))
- **table:** String row keys, getRowKey and row-based selection helpers ([ed68c34](https://github.com/code2nguyen/web-components/commit/ed68c34))
- **table:** Sticky summary row keyed by column id ([9b608ea](https://github.com/code2nguyen/web-components/commit/9b608ea))

### Fixes

- **gallery, chart:** Readable gallery cards in dark mode, category x ticks ([b95a708](https://github.com/code2nguyen/web-components/commit/b95a708))
- **core:** Keep reflected defaults off the host ([284e7bd](https://github.com/code2nguyen/web-components/commit/284e7bd))
- **framework-types:** Make every generated vue.d.ts compile ([b664fb4](https://github.com/code2nguyen/web-components/commit/b664fb4))
- **table:** Apply the selected row colour to its cells ([c84b829](https://github.com/code2nguyen/web-components/commit/c84b829))
- **table:** Clicking the selected row again clears the selection ([c1cbe45](https://github.com/code2nguyen/web-components/commit/c1cbe45))
- **masonry:** Stop writing tabindex on connect, which broke SSR hydration ([1f99f81](https://github.com/code2nguyen/web-components/commit/1f99f81))

### Docs site & examples

- **ui:** Gallery audit, automatic checks on every card in both themes ([b700c08](https://github.com/code2nguyen/web-components/commit/b700c08))
- **ui:** Keep the release version badge visible on mobile ([996e419](https://github.com/code2nguyen/web-components/commit/996e419))

## [0.0.18](https://github.com/code2nguyen/web-components/releases/tag/v0.0.18) — 2026-09-29

### Features

- **chat-message-list:** Theme the log's scrollbar ([6fb2e4b](https://github.com/code2nguyen/web-components/commit/6fb2e4b))
- **carousel:** Mouse drag, click-to-peek and edge-zone hover controls ([0ace2b8](https://github.com/code2nguyen/web-components/commit/0ace2b8))
- **split-panel:** Hide the divider until hovered, recolour it on focus ([b833880](https://github.com/code2nguyen/web-components/commit/b833880))
- **banner:** Add position (sticky top / fixed bottom) and polish defaults ([7b7815b](https://github.com/code2nguyen/web-components/commit/7b7815b))
- **time-input:** Replace native picker with a compact themeable picker ([2737319](https://github.com/code2nguyen/web-components/commit/2737319))
- **carousel:** Add c2-carousel component ([1aebf68](https://github.com/code2nguyen/web-components/commit/1aebf68))
- **timeline:** Add c2-timeline and c2-timeline-item ([28a99fa](https://github.com/code2nguyen/web-components/commit/28a99fa))
- **split-panel:** Add c2-split-panel component ([3af43c5](https://github.com/code2nguyen/web-components/commit/3af43c5))
- **banner:** Add c2-banner component ([26fdea3](https://github.com/code2nguyen/web-components/commit/26fdea3))
- **tag-input:** Add c2-tag-input for entering lists such as email recipients ([ced1869](https://github.com/code2nguyen/web-components/commit/ced1869))
- **time-input:** Add c2-time-input component ([84d3a66](https://github.com/code2nguyen/web-components/commit/84d3a66))
- **shortcut:** Add c2-shortcut and the core shortcut helper ([feffb80](https://github.com/code2nguyen/web-components/commit/feffb80))
- **date-selector:** Disable month navigation past min/max, add relative range examples ([f3863bb](https://github.com/code2nguyen/web-components/commit/f3863bb))
- **chat-message-list:** Add c2-chat-message-list conversation log ([a67bc1f](https://github.com/code2nguyen/web-components/commit/a67bc1f))
- **symbols:** Expand the set to 157 illustrations ([9caa65a](https://github.com/code2nguyen/web-components/commit/9caa65a))
- **symbols:** Add @c2n/symbols spot illustrations ([593fac7](https://github.com/code2nguyen/web-components/commit/593fac7))

### Fixes

- **shortcut:** Accept composed keys only and click inner controls ([0f9ad88](https://github.com/code2nguyen/web-components/commit/0f9ad88))
- **carousel:** Ignore a stale scrollend while a programmatic scroll is in flight ([d9bac17](https://github.com/code2nguyen/web-components/commit/d9bac17))
- **timeline:** Show slotted content after hydration, add release notes gallery card ([2dbd7f8](https://github.com/code2nguyen/web-components/commit/2dbd7f8))
- **icon-button:** Center the button in its host when the host is stretched or sized ([b6e9645](https://github.com/code2nguyen/web-components/commit/b6e9645))
- **side-nav:** No focus ring on the first drawer link after a tap ([1977453](https://github.com/code2nguyen/web-components/commit/1977453))
- **date-input:** Calendar icon focuses the input and tolerates showPicker() throwing ([c9a3f5c](https://github.com/code2nguyen/web-components/commit/c9a3f5c))
- **date-selector:** No range strip behind a lone start date ([3b65fc3](https://github.com/code2nguyen/web-components/commit/3b65fc3))
- **table:** Keep selected row background under the pointer, show row hover, resize columns by default ([a42568c](https://github.com/code2nguyen/web-components/commit/a42568c))
- **log-viewer:** Reveal copy button per tapped entry on touch devices ([1d54b2d](https://github.com/code2nguyen/web-components/commit/1d54b2d))

### Improvements

- Tidy autocomplete example header/footer on narrow screens ([d0e8dff](https://github.com/code2nguyen/web-components/commit/d0e8dff))

### Docs site & examples

- **ui:** Keep Astro's island bootstrap out of named slots ([1fbe4fd](https://github.com/code2nguyen/web-components/commit/1fbe4fd))
- **ui:** Keep long usage-row labels from overlapping examples on mobile ([18f709e](https://github.com/code2nguyen/web-components/commit/18f709e))

## [0.0.17](https://github.com/code2nguyen/web-components/releases/tag/v0.0.17) — 2026-09-28

### Features

- Add virtual log viewer with sticky columns and log highlighting ([647f60b](https://github.com/code2nguyen/web-components/commit/647f60b))
- Add persistent masonry component ([3989120](https://github.com/code2nguyen/web-components/commit/3989120))

### Fixes

- Stabilize virtual log keyboard scrolling in CI ([9854ce5](https://github.com/code2nguyen/web-components/commit/9854ce5))
- Complete log viewer styling and wrapped token contracts ([468f0ac](https://github.com/code2nguyen/web-components/commit/468f0ac))
- Fix tabs accessibility and chart font sizing ([fe083e5](https://github.com/code2nguyen/web-components/commit/fe083e5))

### Improvements

- Make switch thumb follow track height ([faea792](https://github.com/code2nguyen/web-components/commit/faea792))
- Allow table scroll to chain to the page ([b3c5cd7](https://github.com/code2nguyen/web-components/commit/b3c5cd7))

## [0.0.16](https://github.com/code2nguyen/web-components/releases/tag/v0.0.16) — 2026-09-24

### Features

- Add diagnostic CSS styling contract audit ([e674886](https://github.com/code2nguyen/web-components/commit/e674886))

### Docs site & examples

- **nextjs:** Track JSX custom element declarations ([3605230](https://github.com/code2nguyen/web-components/commit/3605230))

## [0.0.15](https://github.com/code2nguyen/web-components/releases/tag/v0.0.15) — 2026-09-23

### Features

- Add Next.js observability example and c2n improvements ([6077abb](https://github.com/code2nguyen/web-components/commit/6077abb))

### Fixes

- **button:** Rerender after form-disabled state changes ([fd97e6d](https://github.com/code2nguyen/web-components/commit/fd97e6d))

### Docs site & examples

- **ui:** Restore mobile site navigation ([05a6ebf](https://github.com/code2nguyen/web-components/commit/05a6ebf))

## [0.0.14](https://github.com/code2nguyen/web-components/releases/tag/v0.0.14) — 2026-09-21

### Features

- **reorder-list:** Make reordering reliable and accessible ([4be70ff](https://github.com/code2nguyen/web-components/commit/4be70ff))
- Complete slot styling contracts ([678a94c](https://github.com/code2nguyen/web-components/commit/678a94c))

### Fixes

- **core:** Read a "false" boolean attribute as false, and parse JSON assigned to a property ([9cdf0cb](https://github.com/code2nguyen/web-components/commit/9cdf0cb))

### Docs site & examples

- **ui:** Render API descriptions as safe markdown ([1301984](https://github.com/code2nguyen/web-components/commit/1301984))

## [0.0.13](https://github.com/code2nguyen/web-components/releases/tag/v0.0.13) — 2026-09-18

### Fixes

- Ship custom-elements.json in every published package ([822f232](https://github.com/code2nguyen/web-components/commit/822f232))

### Docs site & examples

- **ui:** llms-full.txt from the skill, richer llms.txt, footer links ([c81f3fa](https://github.com/code2nguyen/web-components/commit/c81f3fa))

## [0.0.12](https://github.com/code2nguyen/web-components/releases/tag/v0.0.12) — 2026-09-18

### Features

- **dashboard:** Responsive layouts, enter/leave motion, and SSR-safe attributes ([e729283](https://github.com/code2nguyen/web-components/commit/e729283))

## [0.0.11](https://github.com/code2nguyen/web-components/releases/tag/v0.0.11) — 2026-09-18

### Features

- **dashboard:** Add @c2n/dashboard, a grid of resizable panes ([498233e](https://github.com/code2nguyen/web-components/commit/498233e))

### Fixes

- **dashboard:** Sync the new package with v0.0.10 ([e5d01a4](https://github.com/code2nguyen/web-components/commit/e5d01a4))
- **theme-select:** Keep the menu open while the pointer crosses into it ([94e8ba4](https://github.com/code2nguyen/web-components/commit/94e8ba4))

## [0.0.10](https://github.com/code2nguyen/web-components/releases/tag/v0.0.10) — 2026-09-18

### Features

- **steps:** Add @c2n/steps, plus border-beam, code-editor, theme-select and avatar-group ([7a897e3](https://github.com/code2nguyen/web-components/commit/7a897e3))

### Fixes

- Sync the new packages with v0.0.9, and declare composed children ([182c364](https://github.com/code2nguyen/web-components/commit/182c364))

## [0.0.9](https://github.com/code2nguyen/web-components/releases/tag/v0.0.9) — 2026-09-17

### Features

- **tree:** Add @c2n/tree and rebuild the docs sidebar on it ([a093add](https://github.com/code2nguyen/web-components/commit/a093add))
- Expand component library and examples ([38fc60e](https://github.com/code2nguyen/web-components/commit/38fc60e))
- Improve chart examples and add radar charts ([06e2b60](https://github.com/code2nguyen/web-components/commit/06e2b60))

### Fixes

- Make questionnaire options directly interactive ([4750d9c](https://github.com/code2nguyen/web-components/commit/4750d9c))
- Keep chart hover active during entry animation ([ba1bb76](https://github.com/code2nguyen/web-components/commit/ba1bb76))
- Resolve chart theme before first paint ([2ad952a](https://github.com/code2nguyen/web-components/commit/2ad952a))

## [0.0.8](https://github.com/code2nguyen/web-components/releases/tag/v0.0.8) — 2026-09-15

### Features

- Add date and number inputs ([36e70a2](https://github.com/code2nguyen/web-components/commit/36e70a2))
- Add date selector component ([cb5aca9](https://github.com/code2nguyen/web-components/commit/cb5aca9))

### Fixes

- Preserve number input width in WebKit ([de560e4](https://github.com/code2nguyen/web-components/commit/de560e4))
- Correct date selector test semantics ([f17a244](https://github.com/code2nguyen/web-components/commit/f17a244))

## [0.0.7](https://github.com/code2nguyen/web-components/releases/tag/v0.0.7) — 2026-09-15

### Breaking changes

- Framework integration for React, Vue and Angular ([3502f6d](https://github.com/code2nguyen/web-components/commit/3502f6d))

### Features

- Refine docs shell interactions ([790bfa0](https://github.com/code2nguyen/web-components/commit/790bfa0))
- Expand chart and realtime table demos ([453ef10](https://github.com/code2nguyen/web-components/commit/453ef10))
- Improve chat components ([a0a3bfb](https://github.com/code2nguyen/web-components/commit/a0a3bfb))
- Add autocomplete component ([a72d74c](https://github.com/code2nguyen/web-components/commit/a72d74c))
- Improve data platform navigation ([31d76bc](https://github.com/code2nguyen/web-components/commit/31d76bc))
- Expand components and native form support ([a6b4ed3](https://github.com/code2nguyen/web-components/commit/a6b4ed3))
- Improve component docs and agent tooling ([f50b2ac](https://github.com/code2nguyen/web-components/commit/f50b2ac))
- Add attachment components and improve galleries ([1d4843a](https://github.com/code2nguyen/web-components/commit/1d4843a))
- **virtual-list:** Add the virtualized list with built-in search ([977a0b3](https://github.com/code2nguyen/web-components/commit/977a0b3))
- **pagination:** Add the pagination component and wire it into the table ([336cfe2](https://github.com/code2nguyen/web-components/commit/336cfe2))
- **sheet:** Add the edge-anchored sheet component ([a67a13a](https://github.com/code2nguyen/web-components/commit/a67a13a))
- **skeleton:** Add the skeleton placeholder component ([7123837](https://github.com/code2nguyen/web-components/commit/7123837))
- **progress:** Add the linear progress component ([0120a74](https://github.com/code2nguyen/web-components/commit/0120a74))
- **kbd:** Add the kbd component ([a8c11d9](https://github.com/code2nguyen/web-components/commit/a8c11d9))
- Add virtualized table component ([fa0df0b](https://github.com/code2nguyen/web-components/commit/fa0df0b))

### Fixes

- Publish regenerated framework metadata ([f1b9394](https://github.com/code2nguyen/web-components/commit/f1b9394))
- Resume releases from historical tags ([01a7970](https://github.com/code2nguyen/web-components/commit/01a7970))
- Resolve release before version lifecycle ([6059c47](https://github.com/code2nguyen/web-components/commit/6059c47))
- Make npm releases resumable ([c95b86f](https://github.com/code2nguyen/web-components/commit/c95b86f))
- Keep framework types on workspace version ([9a10c49](https://github.com/code2nguyen/web-components/commit/9a10c49))
- **tabs:** Move c2-tab's slot attribute out of the constructor ([c0711ce](https://github.com/code2nguyen/web-components/commit/c0711ce))
- **list-item:** Stop squashing non-icon content in the icon slots ([b8e5d71](https://github.com/code2nguyen/web-components/commit/b8e5d71))

### Docs site & examples

- **ui:** Split the chart docs, rebuild the sidebar, and dogfood c2n in the docs site ([e3636e2](https://github.com/code2nguyen/web-components/commit/e3636e2))
- **examples:** Add data-platform-html example app and component polish ([f670d12](https://github.com/code2nguyen/web-components/commit/f670d12))
- **examples:** Add example apps section with a Vue 3 inbox ([a5dc4d6](https://github.com/code2nguyen/web-components/commit/a5dc4d6))

## [0.0.6](https://github.com/code2nguyen/web-components/releases/tag/v0.0.6) — 2026-09-10

### Docs site & examples

- **ui:** Keep the sidebar scroll offset across navigations ([124f2e0](https://github.com/code2nguyen/web-components/commit/124f2e0))

## [0.0.5](https://github.com/code2nguyen/web-components/releases/tag/v0.0.5) — 2026-09-10

### Features

- **copy-button:** New @c2n/copy-button component ([9aa425f](https://github.com/code2nguyen/web-components/commit/9aa425f))
- Docs app restructure, design tokens, MCP server, skill plugin and studio inspector redesign ([1ce7584](https://github.com/code2nguyen/web-components/commit/1ce7584))

### Fixes

- **copy-button:** Stop the abandoned button flipping back to the copy icon ([2081bdb](https://github.com/code2nguyen/web-components/commit/2081bdb))

## [0.0.4](https://github.com/code2nguyen/web-components/releases/tag/v0.0.4) — 2022-11-04

_Maintenance release._

## [0.0.3](https://github.com/code2nguyen/web-components/releases/tag/v0.0.3) — 2022-11-03

_Maintenance release._

## [0.0.2](https://github.com/code2nguyen/web-components/releases/tag/v0.0.2) — 2022-09-22

### Fixes

- **checkbox:** Checked state does not reactive on vuejs binding ([a8cfa44](https://github.com/code2nguyen/web-components/commit/a8cfa44))

## [0.0.1](https://github.com/code2nguyen/web-components/releases/tag/v0.0.1) — 2022-09-22

_Maintenance release._
