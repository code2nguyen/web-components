# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Overview

`@c2n/web-components` is an npm-workspaces monorepo of Lit 3 web components. Each component is its own publishable package (`@c2n/<name>`, all versioned together by Lerna at the root `lerna.json` version). Components are registered as custom elements with the `c2-` tag prefix. Component browser tests use Playwright with one shared Vite server; suites live in each package's `test/` directory. See `tests/README.md`. Manual verification also uses each package's Vite dev harness and the Astro UI app in `apps/ui`.

## Commands

```bash
npm install                       # root install wires all workspaces

npm run test:button               # button browser tests in Chromium
npm test                         # changed component browser tests in Chromium
npm run test:all                  # all components in Chromium, Firefox and WebKit
npm run test:type-check           # type-check test infrastructure and scenarios

npm run build                     # wireit: type-check + vite build for every component package
npm run build -w packages/components/checkbox  # build one package
npm run dev -w packages/components/checkbox    # vite dev server against that package's index.html harness
npm run type-check -w packages/components/checkbox

npm run ui                        # build all components, then astro dev (apps/ui)
npm run ui:dev                    # astro dev only (uses previously built dist/)
npm run ui:build                  # build components + astro build

npm run lint                      # eslint (wireit-cached)
npm run lint:fix
npm run format:check              # prettier
npm run format:fix
npm run fix                       # lint:fix + format:fix

npm run generate                  # scaffold a new component (plop)
npm run clean                     # nuke node_modules, dist, types, custom-elements.json, package-lock
```

Release: `npm run build` then `npx lerna publish patch --no-private --exact --yes`.

CI (`.github/workflows/deploy.yml`, Node 24) runs `npm ci`, `npm run lint`, `npm run format:check`, `npm run ui:build` and deploys `apps/ui/dist/` to GitHub Pages. Match those checks before pushing. A husky `pre-commit` hook runs lint-staged (prettier + eslint --fix).

## Repository layout

- `packages/components/*` — published components. Each has `src/<name>.ts`, `src/<name>.scss`, `index.html` (standalone dev harness with hand-written usage examples), and a Vite lib build. `design-board` and `json-form` live here too but are WIP and excluded from the root build graph.
- `packages/icons/*` — icon-set packages, one per upstream icon library (currently `feather-icons` → `@c2n/feather-icons`). Same depth and config shape as `packages/components/*`. Each ships **one Lit element per icon** (`c2-feather-<icon-name>`), all extending a hand-written base class (`src/feather-icon.ts` + `.scss`) that owns the `<svg>` wrapper and the shared `--c2-feather-icon--{size,color,stroke-width}` theme. The per-icon files in `src/icons/`, the `src/index.ts` barrel and `src/icon-names.ts` are **generated and committed**: `npm run generate -w packages/icons/feather-icons` runs `scripts/icon-generator/index.ts` (plain `node` on Node 24 type stripping — erasable TS syntax only), which reads `dist/icons/*.svg` from the `feather-icons` devDependency and formats output with prettier. Re-run it and rebuild after bumping `feather-icons`; never edit generated files by hand. The Vite config builds one entry per icon (`@c2n/feather-icons/icons/<name>.js`) plus the barrel, and a single `custom-elements.json` covers all icons. The doc page is `apps/ui/src/content/components/feather-icons.mdx` with `apps/ui/src/components/FeatherIconGallery.astro`.
- `open-packages/*` — same structure, but MIT-licensed / "open" components (currently `chatbot`). Composed of `packages/components/*` components. Note these sit one directory _shallower_ than the component packages, so every repo-relative path in them (wireit deps, the cem plugin import) differs by one `../` level.
- `packages/tools/config` — private (`type: module`); holds the shared `tsconfig.lib.json`, `tsconfig.node.json`, `eslint.config.js`, and pins the toolchain (typescript, vite, eslint, typescript-eslint, lit-analyzer). Every package lists it as a devDependency. ESLint uses flat config: the root `eslint.config.js` just re-exports `@c2n/config/eslint.config.js` (resolved by package name, so the move did not touch it), and `eslint .` lints the whole monorepo (ignores live in the config, not in CLI flags). Node globals are enabled for `**/*.config.*`, `scripts/**` and any package-local `**/scripts/**` (e.g. the icon generators).
- `packages/tools/sass` — shared SCSS: `css-variable.scss` (the theming engine), `variables.scss`, `animation.scss`.
- `packages/tools/playground` — Vite sandbox app exercising `json-form`; no custom element, no build script.
- `packages/core` — **is itself a package** (`@c2n/core`), not a directory of packages: shared TS helpers (`dom-helper`, `css-helper`, `lit-helper`, controllers). Plain `tsc` build, subpath exports only (`@c2n/core/dom-helper.js`) — no barrel index. It is listed in `workspaces` as the bare path `packages/core`, unlike the `components/*` and `tools/*` globs.
- `apps/ui/` — the Astro 7 + MDX documentation site (npm package `@c2n/ui`, workspace path `apps/ui`; formerly `demo/`). It is the app shell that future features (backend, database, …) will grow into, so anything app-level belongs under `apps/`, not `packages/`. Three Content Layer collections (`src/content.config.ts`, `glob()` loaders): `components` (`src/content/components/*.mdx`, frontmatter `title`/`description`/`category` — the category enum in `src/schemas/index.ts` drives sidebar grouping, the landing gallery and the ⌘K search), `gallery` (`src/content/gallery/<component-id>.mdx`, optional `title`/`description`; styled variants of a component, served at `/components/<id>/gallery` by `pages/components/[componentId]/gallery.astro`) and `icons` (`src/content/icons/*.mdx`, frontmatter `title`/`description`/`package`), served at `/components/<id>`, `/components/<id>/gallery` and `/icons/<id>` respectively; all use `layouts/DocComponentLayout.astro` with a `section` prop. Component pages are split into **Docs** (description, `## Installation`, one `## Usage` overview card), **Gallery** (grid of variants to draw inspiration from) and **API** (`pages/components/[componentId]/api.astro` renders `<ApiTable>` from the manifest for every component; the MDX files no longer include it): the layout renders the page header (h1 from frontmatter `title`, lead from `description`, `components/ViewTabs.astro` with a Docs | Gallery | API switcher and gallery card count) so component MDX files must **not** contain a `# Title` line. The Docs usage card is a single ` ```html tag=UsageBlock,package=@c2n/<id> ` fence (`components/UsageBlock.astro`): its body is one `<div data-label="Row name">…</div>` per row of live components, rendered in the example-frame look (dotted canvas, muted row labels, toolbar at the bottom) with an invert-background and a code toggle that reveals the import line and the markup; it has no customize button (the studio belongs to the Gallery). Gallery MDX wraps ` ```html tag=MdxCodeBlock,label=<Card name> ` fences in `<GalleryGrid>` (`components/GalleryGrid.astro`; blank lines around each fence). Author a variant's look as a fence-local `<style>` block on a class (the remark plugin scopes it to the frame), never as an inline `style` attribute: that is what the studio treats as the authored state. A component without a gallery file simply shows no Gallery tab. Site chrome is plain Astro/CSS (`layouts/Main.astro`, `components/SiteSidebar.astro`, `Toc.astro`, `SearchPalette.astro`); design tokens live in `src/assets/tokens.scss` as `--site-*` custom properties (light on `:root`, dark under `html[data-theme='dark']`; theme resolved by an inline script in `Main.astro`, persisted in `localStorage` as `c2n-theme`). Keep the `--site-color-*` names stable — the inspector SCSS reads them. Landing-page gallery previews are HTML snippets in `src/data/component-previews.ts`, upgraded client-side by the side-effect imports in `src/data/component-modules.ts`; add to both when adding a component. Live examples in MDX use ` ```html tag=MdxCodeBlock ` fences (example frame with code toggle, canvas invert and a "customize" button); plain code uses `tag=CodeBlock`. Shiki uses dual light/dark themes in `CodeBlock.astro`.
- **Playground / inspector** (`apps/ui/src/components/configuration/`, `apps/ui/src/utils/playground.ts`): the "customize" button opens the **studio**: the example's `figure.example` gets `is-configuring` and expands in place to fill the viewport (studio bar with component · example title, Exit, Reset, Save preset; canvas with a dashed ring on the `[data-target-uid]` element; code drawer) while the Figma-style inspector (Design (CSS variables grouped by part/state), Props (attributes), Presets and Code tabs) is fixed on the right, above the site header. No DOM is moved; `utils/studio.ts` mirrors the store to those classes, handles Escape/Exit and the toolbar "Customized" badge + reset (edits persist on the page after exiting). State is the nanostores `$configStore` (`src/store`; `activeTab` routes the inspector tabs); `MdxCodeBlockScript.ts` syncs every configured example element. Curated presets live in `src/data/component-presets.ts` keyed by tag (`html` markup + `presets[]` of CSS variable/attribute values) and feed the inspector's Presets tab ("Inspiration"); the gallery pages of those components were generated from the same data (one fence per preset) and are edited as MDX from now on; user presets are saved to `localStorage` (`c2n-presets:<tag>`) and can be exported/imported as JSON. The Code tab (`GenerateCodeBlock.ts`) emits shadcn-style copy-paste output (HTML + `<style>`, CSS only, a Lit subclass registered under a custom tag, or JSON) from the diff between the example's authored state and the current values.
- **MDX example islands**: `plugin/mdx-codeblock-remark.mjs` turns every `c2-*` tag in an example fence into a hydrated Astro island (`client:load` unless a directive is given). Descendants of a `client:only` island are deliberately left as plain tags: Astro stringifies an island's children before the island itself, and for a `client:only` parent that string — including Astro's one-time `<astro-island>` bootstrap script — ends up inside a `<template>`, which silently breaks hydration for the whole page. The parent's module must register the child elements (e.g. `@c2n/select` imports `@c2n/list-item`). The plugin also unwraps the markdown paragraphs MDX creates from text on its own line inside an element, so multi-line markup renders as authored with no stray `<p>`.
- `scripts/generator` — plop generator; `scripts/cem-plugin-customize` — custom-elements-manifest analyzer plugin.
- Package **directories** are grouped (`components/`, `tools/`) but npm **names** are flat — `packages/components/avatar` is `@c2n/avatar`, `packages/tools/sass` is `@c2n/sass`. Every cross-package reference (`@c2n/core/dom-helper.js`, `@use '@c2n/sass/...'`, `extends: "@c2n/config/tsconfig.lib.json"`) resolves by package name, not by location.
- `design-board`, `json-form` and `playground` are work-in-progress and deliberately excluded from the root `build` graph (json-form's build script is disabled as `"--build"`).

## Build orchestration

Wireit drives everything. The root `package.json` `wireit.build.dependencies` is the **explicit list** of every buildable package — a new package is not built until it is added there (the plop generator appends it for you). Per-package, `build` depends on `type-check`, which depends on `../../core:build` (so `@c2n/core` types are always fresh first); from `open-packages/*` that same dep is `../../packages/core:build`. Component `vite.config.ts` files import the CEM plugin as `../../../scripts/cem-plugin-customize/index`; open packages use `../../scripts/...`.

Vite lib config per package: single ES output, `minify: false`, and `external: /^lit|@c2n/` — Lit and sibling `@c2n/*` packages are never bundled into a component. Keep cross-package dependencies minimal; import through the published subpath (`@c2n/core/dom-helper.js`), not relative paths across packages.

## Pinned transitive dependency

The root `package.json` has `overrides: { "@lit-labs/ssr": "3.2.2" }`. `@astrojs/lit` (unmaintained since mid-2024) hand-builds the `renderInfo` object in its `server.js` with only `customElementInstanceStack`/`customElementHostStack`, but `@lit-labs/ssr` 3.3+ also reads `eventTargetStack`/`slotStack`. Its own `^3.2.2` range floats into those versions, and the UI app build then dies with `Cannot read properties of undefined (reading 'length')` inside `getLast`. Do not remove the override without first checking that `@astrojs/lit` has been updated.

## The manifest pipeline (JSDoc → docs UI)

This is the least obvious part of the architecture. `vite-plugin-cem` (plus `scripts/cem-plugin-customize`) analyzes each component during `vite build` and emits `<package>/custom-elements.json`. The UI app imports those manifests via `@c2n/<name>/custom-elements.json` in `apps/ui/src/store/component-manifests.ts`, normalizes them in `apps/ui/src/utils/manifest-utils.ts`, and renders both `<ApiTable>` and the live theming panel (`apps/ui/src/components/configuration/`) from them.

Consequences:

- Component JSDoc tags are the API documentation source of truth: `@tag`, `@slot`, `@event`, and `@cssproperty {type} [--name=default]`. Every CSS custom property a consumer may set must have a `@cssproperty` line, or it will not appear in the demo's API table or config panel.
- The custom plugin adds two non-standard tags: `@internalcomponent` and `@slotcomponent`, used by the demo to document composed/slotted children.
- After changing a component's public surface, rebuild that package so its `custom-elements.json` is regenerated; committed manifests are checked in.
- A new published component must be added by hand (or by plop) to `apps/ui/src/store/component-manifests.ts` in both the import list and the `normalizedManifests` array.

## Theming convention

Every component is themed exclusively through CSS custom properties generated by `packages/sass/css-variable.scss`. A component's SCSS opens with:

```scss
@use '@c2n/sass/css-variable' as css with (
  $prefix: c2-checkbox,
  $theme: (
    container--width: 18px,
    checkmark--color: #ffffff,
    ...,
  )
);
```

then reads values as `css.cssVar(container--width)`, which expands to `var(--c2-checkbox__container--width, 18px)`. The name shape is meaningful and parsed by the demo (`manifest-utils.ts` splits on `--` then `__`):

`--<prefix>__<block>[__<state>]--<css-property>`

`__` separates the component prefix / element part / state (`__selected`, `__hover`); `--` separates the final CSS property name. Nested-state names like `container__selected--background-color` group into the demo's configuration panel automatically. Defaults live in the `$theme` map (not in the rule bodies) and must be mirrored in the `@cssproperty` JSDoc default.

## Adding a component

For a new icon-set package, copy `packages/icons/feather-icons` (the plop generator does not know about icon packages), swap the generator's upstream resolution and tag prefix, add `./packages/icons/<name>:build` to the root wireit list, and wire the demo manifest and doc page by hand.

`npm run generate` prompts for a name and package type (`npm package` → `packages/components/`, `open package` → `open-packages/`) and then: scaffolds the package from `scripts/generator/files/wc`, adds a doc stub under `apps/ui/src/content/components/` (or `oepn-components/` — note the existing typo in that directory name), appends the build target to the root `package.json`, and for npm packages wires the manifest into `apps/ui/src/store/component-manifests.ts`. Because the two package types sit at different depths, `plopfile.ts` injects `coreBuildDep` and `cemPluginPath` into the template data rather than hardcoding `../` counts in the templates — update those if the layout changes again.

## Component conventions

Follow the shape in `packages/checkbox/src/checkbox.ts`:

- `@customElement('c2-<name>')`, styles via `import styles from './<name>.scss?inline'` + `static override styles = unsafeCSS(styles)`.
- `noImplicitOverride` is on — `override` is required on `render`, `update`, `styles`, `focus`, inherited ARIA props, etc.
- Always declare the tag in `declare global { interface HTMLElementTagNameMap }`.
- Re-emit native events from inner form controls with `redispatchEvent` from `@c2n/core/dom-helper.js` rather than constructing new events.
- Expose customization points as named `<slot>`s with inline SVG defaults (see the checkmark/mixedmark/uncheckmark slots).
- `@typescript-eslint/no-explicit-any` is an error; `noUnusedLocals`/`noUnusedParameters` are on (prefix intentionally unused args with `_`).

## Code style

Prettier: single quotes, no semicolons, print width 160, 2-space tabs. Astro files use `prettier-plugin-astro`.

## Browser usage

Do not use browser debugging, browser automation, screenshots, DOM inspection,
or DevTools unless explicitly requested by the user.

Prefer source-code inspection, terminal commands, unit/integration tests,
and application logs.
