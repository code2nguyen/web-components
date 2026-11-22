# Docs site

Guidance for `apps/ui`. Claude Code loads this file when it works in this directory; the repo-wide rules are in the root `CLAUDE.md`. Paths are relative to the repository root.

## Overview

`apps/ui/` — the Astro 7 + MDX documentation site (npm package `@c2n/ui`, workspace path `apps/ui`; formerly `demo/`). It is the app shell that future features (backend, database, …) will grow into, so anything app-level belongs under `apps/`, not `packages/`.

### Collections and routes

Five Content Layer collections (`src/content.config.ts`, `glob()` loaders): `guides` (`src/content/guides/*.mdx`, frontmatter `title`/`description`/`order`; long-form docs such as Theming, served at `/guides/<id>` by `pages/guides/[guideId].astro` through `DocComponentLayout` with `section="guides"` and `currentId`, no view tabs; `components/TokenTable.astro` renders the `@c2n/theme` token table), `components` (`src/content/components/*.mdx`, frontmatter `title`/`description`/`category` — the category enum in `src/schemas/index.ts` drives sidebar grouping, the landing gallery and the ⌘K search; optional `package`/`tag` when the page's id is not the npm name / the element tag, and optional `apiTags` naming the elements its API page documents), `gallery` (`src/content/gallery/<component-id>.mdx`, optional `title`/`description`; styled variants of a component, served at `/components/<id>/gallery` by `pages/components/[componentId]/gallery.astro`) and `icons` (`src/content/icons/*.mdx`, frontmatter `title`/`description`/`package`), served at `/components/<id>`, `/components/<id>/gallery` and `/icons/<id>` respectively; all use `layouts/DocComponentLayout.astro` with a `section` prop.

### Component pages: Docs, Gallery and API

Component pages are split into **Docs** (description, `## Import` with the page's `@c2n/components/<entry>` line — `@c2n/components` is installed once, from Getting started, so pages have no install section — and one `## Usage` overview card), **Gallery** (grid of variants to draw inspiration from) and **API** (`pages/components/[componentId]/api.astro` renders `<ApiTable>` from the manifest for every component; the MDX files no longer include it): the layout renders the page header (h1 from frontmatter `title`, lead from `description`, `components/ViewTabs.astro` with a Docs | Gallery | API switcher and gallery card count) so component MDX files must **not** contain a `# Title` line. The Docs usage card is a single ` ```html tag=UsageBlock,package=@c2n/<id> ` fence (`components/UsageBlock.astro`): its body is one `<div data-label="Row name">…</div>` per row of live components, rendered in the example-frame look (dotted canvas, muted row labels, toolbar at the bottom) with a code toggle that reveals the import line and the markup; it has no customize button (the studio belongs to the Gallery).

### Gallery cards

Gallery MDX wraps ` ```html tag=MdxCodeBlock,label=<Card name> ` fences in `<GalleryGrid>` (`components/GalleryGrid.astro`; blank lines around each fence). Author a variant's look as a fence-local `<style>` block on a class (the remark plugin scopes it to the frame), never as an inline `style` attribute: that is what the studio treats as the authored state. Its neutral colours (text, surfaces, borders, greys) go through the theme so the card reads in dark mode and is portable: `var(--c2-theme--color-<role>, <literal>)` for a role's value, `color-mix(in srgb, var(--c2-theme--color-on-surface, #18181b) <n>%, var(--c2-theme--color-surface, #ffffff))` for any other grey; never the site's own `--site-*` variables, which do not exist in an app that copies the card. A variant's own colours get an explicit light and dark value with CSS `light-dark(<light>, <dark>)`, which follows the `color-scheme` that `@c2n/theme` (and the site) set with dark mode: a pale tint used as a surface or border (`light-dark(#f3e8ff, #26153c)`) and the accent text in the same block (`light-dark(#7e22ce, #a76cdc)`). The light half is exactly what was authored; tune the dark half by hand like any other value, and the studio's colour picker shows a pair as two swatches. Mid-tone hues elsewhere stay literal as the card's accents, and so does a block with a strong coloured background or one designed dark (dark background or light text): their colours were chosen against each other. `themeExampleCss` in `packages/tools/mcp/scripts/gallery.ts` writes the pairs (a deeper wash of the tint's hue, and text lightened to 4.5:1 on it) and the neutral token mixes, unit-tested in `gallery.test.ts`; `npm run theme:examples -w packages/tools/mcp` applies it to the MDX without touching a pair that already exists, and `npm run check:example-theme` (a `deploy.yml` gate) fails when an example still has a themeable tint or tint text without a pair (the strong-colour and dark-designed exceptions are not checked). A tint equal to a theme role's light value (`#edf1fe`) stays that role (`var(--c2-theme--color-primary-container, #edf1fe)`) rather than a pair, and a fill part such as `__indicator--color` is not treated as text. A named colour (`white`) is not parsed, so write it as hex or a token. Do not add a "Dark" card: every card already renders in both themes through the site's theme switch, so a card that only restyles a component for a dark surface duplicates that (and its literals fight the light theme). A component without a gallery file simply shows no Gallery tab.

**Choose how many cards share a row for each grid, from the space the component needs.** The content column is about 700px wide, so a bare `<GalleryGrid>` puts three cards of roughly 220px on a row. That suits only a small single control (a button, a badge, a switch, an avatar). Anything that needs room to be read gets fewer cards per row, set with `columns`:

- **3 per row** (bare `<GalleryGrid>`): small controls whose whole state fits in about 200px.
- **2 per row** (`columns="2"`): medium components, such as a field with its menu or popup, a card, a list, a small chart, a date picker or a stepper.
- **1 per row** (`columns="1"`): wide components, such as a table or data grid, an editor, a toolbar, a navigation bar or app shell, a dashboard, a calendar or timeline, a chart with axes and a legend, or a multi-part form.

Prefer `columns` to `min` for new cards (`min={9999}` is an older way of writing `columns="1"`), and put cards of different sizes in separate `<GalleryGrid>` blocks rather than letting a wide card cramp its neighbours. A card is too narrow when its content wraps, truncates, scrolls sideways or squeezes its controls below their natural size. Check that on the screenshot review (`doc-screenshots.mjs`), and drop to fewer cards per row when you see it.

### One package, several pages

One package may be documented on **several pages** — `@c2n/chart` gives each of `c2-line-chart`, `c2-area-chart`, `c2-bar-chart`, `c2-pie-chart` and `c2-sparkline` its own docs page, gallery, preview and presets under the `Chart` category, each declaring `package: '@c2n/chart'`, its own `tag`, and `apiTags` (its element plus `c2-chart-series`) so the API page does not repeat all six tables. `build-registry.ts` mirrors that: one registry entry per docs page, the page documenting the manifest's first element representing the package in `packageIndex` and owning any element several pages share. `c2-map-chart` (with its `c2-map-layer` children) is the one chart whose engine options depend on the data: region colours live in ECharts' `geo.regions`, so it opts out of the data-only fast path. Its outlines ship as `@c2n/chart/maps/{world-110m,world-50m,us-states}.js`, each loaded on first use: `src/maps/*.ts` import the `world-atlas`/`us-atlas` TopoJSON with `?raw`, so Vite inlines one compact string and tsc never reads the JSON, and those two packages stay devDependencies. `d3-geo` (projections) and `topojson-client` are runtime dependencies kept external like `@upsetjs/venn.js`.

### Site chrome and hydration

Site chrome **dogfoods the components** through app-level variants in `src/components/ui/` (`SiteIconButton.astro`, `SiteButton.astro`, `SiteCard.astro`, each a `c2-*` element plus a class block of `--c2-*` variables; `icons.ts` re-exports the Feather icon classes used as islands). Two hydration modes: Astro islands (`<IconButton client:load>`, SSR'd declarative shadow DOM, default for unique chrome such as the header) and plain tags upgraded by `src/data/chrome-modules.ts` (`hydrate="defined"`, for repeated chrome: example toolbars, code-block copy buttons, API table controls, card lists, the ⌘K palette) so a gallery page does not ship one shadow-DOM copy per instance. Pass kebab-case attributes to hand-written islands only: `@astrojs/lit` routes any prop whose name is in the element's prototype to a direct property assignment instead of `setAttribute`, which skips the property's converter and forces `defer-hydration`. MDX fence examples are exempt — `mdx-codeblock-remark.mjs` hands those attributes over capitalized (`Rows`), which misses that prototype check, and `setAttribute` lowercases the name again. `SearchPalette.astro` is composed from `c2-modal` + `c2-text-field` + `c2-list`/`c2-list-item`; the mobile sidebar is a `c2-side-nav` drawer in `layouts/DocComponentLayout.astro` (full height with its own close button because the over-mode scroll lock fixes `<html>`).

### Formatting, design tokens and theme

`.astro`/`.scss` files are outside the prettier glob — format them by hand (`npx prettier --write "apps/ui/src/**/*.{astro,scss}"`). Design tokens live in `src/assets/tokens.scss` as `--site-*` custom properties (light on `:root`, dark under `html[data-theme='dark']`; theme resolved by an inline script in `Main.astro`, persisted in `localStorage` as `c2n-theme`); `src/assets/c2-theme.scss` bridges them onto the `--c2-theme--*` tokens and `Main.astro` imports `@c2n/theme/base.css` first, which is the whole theme of the site's c2 components. Keep the `--site-color-*` names stable — the inspector SCSS reads them.

### Landing previews and code blocks

Landing-page gallery previews are HTML snippets in `src/data/component-previews.ts`, upgraded client-side by the side-effect imports in `src/data/component-modules.ts`; add to both when adding a component. Live examples in MDX use ` ```html tag=MdxCodeBlock ` fences (example frame with code toggle and a "customize" button; no per-card light/dark toggle — the site theme switch is the only one, since an inverted canvas leaves the components in the page theme); plain code uses `tag=CodeBlock`. Shiki uses dual light/dark themes in `CodeBlock.astro`.

### `llms.txt` endpoints

Two prerendered text endpoints serve coding agents: `src/pages/llms.txt.ts` (the documentation map, generated from the five collections, with a "For coding agents" section pointing at `@c2n/mcp`, `@c2n/skill` and the shipped manifests) and `src/pages/llms-full.txt.ts` (the `c2n-components` skill and its references imported with `?raw` from `packages/tools/skill`, headings nested under one h1, `references/*.md` links rewritten to section anchors). Both are linked from the footer and a `<link rel="alternate">` in `Main.astro`, and described in the AI tools guide; do not hand-write either file.

## Playground / inspector

**Playground / inspector** (`apps/ui/src/components/configuration/`, `apps/ui/src/utils/playground.ts`): the "customize" button opens the **studio**: the example's `figure.example` gets `is-configuring` and expands in place to fill the viewport (studio bar with component · example title, Exit, Reset, Save preset; canvas with a dashed ring on the `[data-target-uid]` element; code drawer) while the Figma-style inspector (Design (CSS variables grouped by part/state), Props (attributes), Data (JSON attributes such as a table's `rows`, a tree's `items` or a chart's `data`, only shown when the component has one: any attribute whose Lit converter writes records as JSON, detected by `isDataAttribute` in `utils/dom.ts`), Presets and Code tabs) is fixed on the right, above the site header. No DOM is moved; `utils/studio.ts` mirrors the store to those classes, handles Escape/Exit and the toolbar "Customized" badge + reset (edits persist on the page after exiting). Attribute values are read back through each property's own Lit converter (`getElemenetProperty`), never a generic `join(';')`, which once serialized `rows` as `[object Object];…` and emptied every table opened in the studio. State is the nanostores `$configStore` (`src/store`; `activeTab` routes the inspector tabs); `MdxCodeBlockScript.ts` syncs every configured example element. Curated presets live in `src/data/component-presets.ts` keyed by tag (`html` markup + `presets[]` of CSS variable/attribute values) and feed the inspector's Presets tab ("Inspiration"); the gallery pages of those components were generated from the same data (one fence per preset) and are edited as MDX from now on; user presets are saved to `localStorage` (`c2n-presets:<tag>`) and can be exported/imported as JSON. The Code tab (`GenerateCodeBlock.ts`) emits shadcn-style copy-paste output (HTML + `<style>`, CSS only, a Lit subclass registered under a custom tag, or JSON) from the diff between the example's authored state and the current values.

## MDX example islands

**MDX example islands**: `plugin/mdx-codeblock-remark.mjs` turns every `c2-*` tag in an example fence into a hydrated Astro island (`client:load` unless a directive is given). Descendants of a `client:only` island are deliberately left as plain tags: Astro stringifies an island's children before the island itself, and for a `client:only` parent that string — including Astro's one-time `<astro-island>` bootstrap script — ends up inside a `<template>`, which silently breaks hydration for the whole page. The parent's module must register the child elements (e.g. `@c2n/select` imports `@c2n/list-item`). A `c2-*` child with a `slot` under an island parent stays an island of its own: Astro routes it into the parent's named slot and `@astrojs/lit` stamps the `slot` on the `<astro-island>` wrapper, the host's direct child, so no per-component list is needed for it; only under a plain (nested) parent does it stay plain, because there the `slot` would reach the inner element instead of the wrapper. The plugin also unwraps the markdown paragraphs MDX creates from text on its own line inside an element, so multi-line markup renders as authored with no stray `<p>`.

## Using c2n components in the UI app

**In `apps/ui` (and any app under `apps/`), reach for a `c2-*` component before writing markup of your own.** The
docs site is the shop window for these packages: every hand-rolled button, select or disclosure in its chrome is a
component the library either has (and should be used) or is missing (and should be filed). This is not a style
preference — it is how the components get exercised against real usage.

The rule, in order:

1. **Use the `c2-*` element.** Find it with the `c2n` MCP server (`search_components`, `get_component`), or
   `packages/tools/skill/skills/c2n-components/references/component-catalog.md` for a name, then the package's
   `custom-elements.json` for the exact API. Assume one exists before concluding it does not: there are over two hundred.
2. **Style it through its own CSS variables** (`--c2-<component>__<part>--<property>`), bridged to the site's
   `--site-*` tokens. Never fork a component's internals or reach into its shadow DOM. An app-level variant belongs
   in `src/components/ui/` (`SiteButton.astro`, `SiteCard.astro`, `SiteIconButton.astro` are the pattern: a `c2-*`
   element plus a class block of `--c2-*` values).
3. **Only then write plain HTML**, and say why in a `<!-- dogfood-exempt: reason -->` comment on the line.
4. **If no component fits, that is a finding** — say so rather than quietly hand-rolling one.

`npm run check:dogfood` enforces this (also a CI gate): it fails on a native `<button>`, `<select>`, `<input>`,
`<textarea>`, `<dialog>`, `<details>` or `<progress>` in `apps/ui/src/{components,layouts,pages}` that is neither
exempted nor in the script's `KNOWN` list of pre-existing chrome. That list is a ratchet — shrink it, never grow it.

When you replace a native control with a c2 component, **delete the old rule's box styling**. A leftover
`border` / `padding` / `background` / `height` on the class stays on the _host_, and the component draws its
own box inside it — two nested frames, most visible as a second focus ring inset by the old padding. Keep
only layout (`flex`, `min-width`, `margin`) on the host and move sizing to the component's own variables.

### Report back what you hit

Using a component is also how it gets improved. **Whenever you consume a `c2-*` component from an app and hit
friction — a bug, something documented that does not work, an API that makes the common case hard, or a case
where you had to fall back to plain HTML — append an entry to `COMPONENT-FEEDBACK.md`.** Every
`dogfood-exempt` comment you write should have an entry there saying what was missing. Keep it concrete: what
you were building, what you expected, what happened, and the smallest change that would have avoided it. If
you fix the component in the same change, skip the log — the commit and the test are the record.

Developers outside this repo report the same kind of friction as GitHub issues through the **component feedback**
issue form (`.github/ISSUE_TEMPLATE/component-feedback.yml`, label `component-feedback`). Their coding agents draft
those issues with the `@c2n/mcp` tool `report_issue` (`packages/tools/mcp/src/feedback.ts`): the `@c2n/skill`
instructions have the agent ask the developer, once per problem, whether to report a bug, a missing feature or a
workaround it met, and the developer always reviews and submits. The form's field ids
and dropdown options are what the tool's pre-filled link uses, so change both together. Triage a labelled issue like
an entry here: fix it, or move it into this file.

Repeated chrome renders as plain tags upgraded by `src/data/chrome-modules.ts` (`hydrate="defined"`); unique chrome
renders as an Astro island. Add the package to `chrome-modules.ts` when you introduce a new one.
