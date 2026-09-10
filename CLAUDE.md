# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`@c2n/web-components` is an npm-workspaces monorepo of Lit 3 web components. Each component is its own publishable package (`@c2n/<name>`, all versioned together by Lerna at the root `lerna.json` version). Components are registered as custom elements with the `c2-` tag prefix. There are no tests in this repo — verification is done via each package's Vite dev harness and the Astro UI app in `apps/ui`.

## Commands

```bash
npm install                       # root install wires all workspaces

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

npm run build -w packages/tools/theme     # regenerate @c2n/theme (tokens.css, base.css, tokens.json, report.json) from the component manifests
npm run build:tools               # after the root build: @c2n/mcp registry (packages/tools/mcp/data/registry.json) + @c2n/skill cheatsheet/version sync
npm run mcp:smoke                 # spawn the MCP server over stdio and exercise every tool
npm run mcp:inspect               # MCP Inspector against packages/tools/mcp/src/cli.ts
npm run generate                  # scaffold a new component (plop)
npm run clean                     # nuke node_modules, dist, types, custom-elements.json, package-lock
```

Release: the `Release to npm` workflow (`.github/workflows/release.yml`, manual dispatch — pick the bump and dist-tag, or tick `dry_run`). It runs the CI gates, then `lerna publish <bump> --no-private --exact --yes --force-publish`, then `gh release create` on the tag lerna pushed. `NPM_TOKEN` (an npm **automation** token) is an environment secret on the `release` environment, which the job declares. Locally the equivalent is `npm run build && npm run build:tools` then that same `lerna publish`.

`lerna version` writes the new version into `lerna.json` and every non-private `package.json`, runs the `version` lifecycle scripts, then stages and commits. Two committed generated files embed the version — the MCP registry's `c2nVersion` and the cheatsheet header — so the **root** `version` script re-stamps them (`packages/tools/mcp/scripts/stamp-version.ts`, then `build-skill.ts`) and `git add`s them into the release commit. It has to live at the root: a package-level `version` script does not run for a private package, and both tools packages are private. Without it the committed generated files stay one release behind and the workflow's `git diff --exit-code` freshness gate fails on the _next_ run — which is exactly what happened after `v0.0.5`. `--force-publish` is there because fixed-mode `lerna version` otherwise exits with "No changed packages to version" when a dispatch's only changes are in private packages.

CI (`.github/workflows/deploy.yml`, Node 24) runs `npm ci`, `npm run lint`, `npm run format:check`, `npm run ui:build`, `npm run build:tools`, `npm run mcp:smoke`, a `git diff --exit-code` freshness check on the generated registry / cheatsheet / plugin files, and deploys `apps/ui/dist/` to GitHub Pages. Match those checks before pushing. A husky `pre-commit` hook runs lint-staged (prettier + eslint --fix).

## Repository layout

- `packages/components/*` — published components. Each has `src/<name>.ts`, `src/<name>.scss`, `index.html` (standalone dev harness with hand-written usage examples), and a Vite lib build. `design-board` and `json-form` live here too but are WIP and excluded from the root build graph.
- `packages/icons/*` — icon-set packages, one per upstream icon library (currently `feather-icons` → `@c2n/feather-icons`). Same depth and config shape as `packages/components/*`. Each ships **one Lit element per icon** (`c2-feather-<icon-name>`), all extending a hand-written base class (`src/feather-icon.ts` + `.scss`) that owns the `<svg>` wrapper and the shared `--c2-feather-icon--{size,color,stroke-width}` theme. The per-icon files in `src/icons/`, the `src/index.ts` barrel and `src/icon-names.ts` are **generated and committed**: `npm run generate -w packages/icons/feather-icons` runs `scripts/icon-generator/index.ts` (plain `node` on Node 24 type stripping — erasable TS syntax only), which reads `dist/icons/*.svg` from the `feather-icons` devDependency and formats output with prettier. Re-run it and rebuild after bumping `feather-icons`; never edit generated files by hand. The Vite config builds one entry per icon (`@c2n/feather-icons/icons/<name>.js`) plus the barrel, and a single `custom-elements.json` covers all icons. The doc page is `apps/ui/src/content/components/feather-icons.mdx` with `apps/ui/src/components/FeatherIconGallery.astro`.
- `open-packages/*` — same structure, but MIT-licensed / "open" components (currently `chatbot`). Composed of `packages/components/*` components. Note these sit one directory _shallower_ than the component packages, so every repo-relative path in them (wireit deps, the cem plugin import) differs by one `../` level.
- `packages/tools/config` — private (`type: module`); holds the shared `tsconfig.lib.json`, `tsconfig.node.json`, `eslint.config.js`, and pins the toolchain (typescript, vite, eslint, typescript-eslint, lit-analyzer). Every package lists it as a devDependency. ESLint uses flat config: the root `eslint.config.js` just re-exports `@c2n/config/eslint.config.js` (resolved by package name, so the move did not touch it), and `eslint .` lints the whole monorepo (ignores live in the config, not in CLI flags). Node globals are enabled for `**/*.config.*`, `scripts/**` and any package-local `**/scripts/**` (e.g. the icon generators).
- `packages/tools/sass` — shared SCSS: `css-variable.scss` (the theming engine), `variables.scss`, `animation.scss`.
- `packages/tools/mcp` — `@c2n/mcp`, a stdio MCP server (`bin: c2n-mcp`, `npx -y @c2n/mcp`) — currently `private: true`, i.e. built and dogfooded through the root `.mcp.json` but **not published**; drop the flag to start releasing it. It exposes the components to AI agents: 8 read-only tools (`list_components`, `search_components`, `get_component`, `get_examples`, `get_presets`, `get_theme`, `generate_variant`, `get_workflow_guide`) and `c2n://` resources over a bundled `data/registry.json` (**generated and committed**, prettier-ignored, no timestamp) built by `scripts/build-registry.ts` from every built package's `custom-elements.json`, the docs MDX (UsageBlock rows, gallery fences), `component-presets.ts`/`component-previews.ts`, the theme's `tokens.json` and the skill's reference guides. `src/lib/generate-code.ts` is the `generateCode` port (base class/module from the registry, which fixes `c2-tab` and icon tags). Runs unbuilt on Node 24 (`node src/cli.ts`, `erasableSyntaxOnly`); `dist/` is the published build. The root `.mcp.json` points Claude Code sessions in this repo at the source entry.
- `packages/tools/skill` — `@c2n/skill` (currently `private: true`, **not published** alongside the components — drop the flag to start releasing it), a **Claude Code plugin** (`.claude-plugin/plugin.json`, plugin-root `.mcp.json` running `npx -y @c2n/mcp@<version>`, `skills/c2n-components/SKILL.md` + `references/{workflow,theming,variant-components,frameworks}.md` hand-written, `references/components-cheatsheet.md` **generated** from the MCP registry by `scripts/build-skill.ts`, which also syncs the plugin version). The repo-root `.claude-plugin/marketplace.json` lists it (`/plugin marketplace add code2nguyen/web-components`, `/plugin install c2n@c2n`); `.claude/skills/c2n-components` is a symlink to the plugin's skill so this repo dogfoods it (the MCP server comes from the root `.mcp.json`, not from installing the plugin here). Neither tools package is in the root `wireit.build` list (the MCP registry depends on the root build group, so that would be a cycle): they build through `npm run build:tools`.
- `packages/tools/theme` — published `@c2n/theme`: the `--c2-theme--*` design tokens (`src/tokens.ts`, single source of truth) and a **generated** base theme. `scripts/theme-generator/` (Node 24 erasable TS) reads every `@c2n/*/custom-elements.json` from `node_modules/@c2n`, classifies each documented CSS variable (`classify.ts` rule table, hand-curated exceptions in `overrides.ts`) and writes `dist/tokens.css`, `dist/base.css` (`--c2-<component>…: var(--c2-theme--…, <original default>)` per mapped variable), `dist/theme.css`, `dist/tokens.json` (tokens + variable→token mapping) and `dist/report.json` (coverage, unmapped list). Output is build-only (not committed). Its wireit `build` depends on every component build so manifests are fresh; the plop generator appends new components to that list. Components are never modified by the theme.
- `packages/tools/playground` — Vite sandbox app exercising `json-form`; no custom element, no build script.
- `packages/core` — **is itself a package** (`@c2n/core`), not a directory of packages: shared TS helpers (`dom-helper`, `css-helper`, `lit-helper`, controllers). Plain `tsc` build, subpath exports only (`@c2n/core/dom-helper.js`) — no barrel index. It is listed in `workspaces` as the bare path `packages/core`, unlike the `components/*` and `tools/*` globs.
- `apps/ui/` — the Astro 7 + MDX documentation site (npm package `@c2n/ui`, workspace path `apps/ui`; formerly `demo/`). It is the app shell that future features (backend, database, …) will grow into, so anything app-level belongs under `apps/`, not `packages/`. Four Content Layer collections (`src/content.config.ts`, `glob()` loaders): `guides` (`src/content/guides/*.mdx`, frontmatter `title`/`description`/`order`; long-form docs such as Theming, served at `/guides/<id>` by `pages/guides/[guideId].astro` through `DocComponentLayout` with `section="guides"` and `currentId`, no view tabs; `components/TokenTable.astro` renders the `@c2n/theme` token table), `components` (`src/content/components/*.mdx`, frontmatter `title`/`description`/`category` — the category enum in `src/schemas/index.ts` drives sidebar grouping, the landing gallery and the ⌘K search), `gallery` (`src/content/gallery/<component-id>.mdx`, optional `title`/`description`; styled variants of a component, served at `/components/<id>/gallery` by `pages/components/[componentId]/gallery.astro`) and `icons` (`src/content/icons/*.mdx`, frontmatter `title`/`description`/`package`), served at `/components/<id>`, `/components/<id>/gallery` and `/icons/<id>` respectively; all use `layouts/DocComponentLayout.astro` with a `section` prop. Component pages are split into **Docs** (description, `## Installation`, one `## Usage` overview card), **Gallery** (grid of variants to draw inspiration from) and **API** (`pages/components/[componentId]/api.astro` renders `<ApiTable>` from the manifest for every component; the MDX files no longer include it): the layout renders the page header (h1 from frontmatter `title`, lead from `description`, `components/ViewTabs.astro` with a Docs | Gallery | API switcher and gallery card count) so component MDX files must **not** contain a `# Title` line. The Docs usage card is a single ` ```html tag=UsageBlock,package=@c2n/<id> ` fence (`components/UsageBlock.astro`): its body is one `<div data-label="Row name">…</div>` per row of live components, rendered in the example-frame look (dotted canvas, muted row labels, toolbar at the bottom) with an invert-background and a code toggle that reveals the import line and the markup; it has no customize button (the studio belongs to the Gallery). Gallery MDX wraps ` ```html tag=MdxCodeBlock,label=<Card name> ` fences in `<GalleryGrid>` (`components/GalleryGrid.astro`; blank lines around each fence). Author a variant's look as a fence-local `<style>` block on a class (the remark plugin scopes it to the frame), never as an inline `style` attribute: that is what the studio treats as the authored state. A component without a gallery file simply shows no Gallery tab. Site chrome **dogfoods the components** through app-level variants in `src/components/ui/` (`SiteIconButton.astro`, `SiteButton.astro`, `SiteCard.astro`, each a `c2-*` element plus a class block of `--c2-*` variables; `icons.ts` re-exports the Feather icon classes used as islands). Two hydration modes: Astro islands (`<IconButton client:load>`, SSR'd declarative shadow DOM, default for unique chrome such as the header) and plain tags upgraded by `src/data/chrome-modules.ts` (`hydrate="defined"`, for repeated chrome: example toolbars, code-block copy buttons, API table controls, card lists, the ⌘K palette) so a gallery page does not ship one shadow-DOM copy per instance. Pass kebab-case attributes to islands only (a prop matching an element property forces `defer-hydration`). `SearchPalette.astro` is composed from `c2-modal` + `c2-text-field` + `c2-list`/`c2-list-item`; the mobile sidebar is a `c2-side-nav` drawer in `layouts/DocComponentLayout.astro` (full height with its own close button because the over-mode scroll lock fixes `<html>`). `.astro`/`.scss` files are outside the prettier glob — format them by hand (`npx prettier --write "apps/ui/src/**/*.{astro,scss}"`). Design tokens live in `src/assets/tokens.scss` as `--site-*` custom properties (light on `:root`, dark under `html[data-theme='dark']`; theme resolved by an inline script in `Main.astro`, persisted in `localStorage` as `c2n-theme`); `src/assets/c2-theme.scss` bridges them onto the `--c2-theme--*` tokens and `Main.astro` imports `@c2n/theme/base.css` first, which is the whole theme of the site's c2 components. Keep the `--site-color-*` names stable — the inspector SCSS reads them. Landing-page gallery previews are HTML snippets in `src/data/component-previews.ts`, upgraded client-side by the side-effect imports in `src/data/component-modules.ts`; add to both when adding a component. Live examples in MDX use ` ```html tag=MdxCodeBlock ` fences (example frame with code toggle, canvas invert and a "customize" button); plain code uses `tag=CodeBlock`. Shiki uses dual light/dark themes in `CodeBlock.astro`.
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

## Linux native binaries in the lockfile

The root `package.json` declares nine Linux `optionalDependencies` that nothing imports directly:
`@rolldown/binding-linux-x64-gnu`, `@esbuild/linux-x64`, `lightningcss-linux-x64-gnu`,
`@astrojs/compiler-binding-linux-x64-gnu`, `@parcel/watcher-linux-x64-glibc`, `@img/sharp-linux-x64`,
`@img/sharp-libvips-linux-x64`, `@xn-sakina/rml-linux-x64-gnu` and `@bruits/satteri-linux-x64-gnu`.

They exist so CI can use `npm ci`. Each of those toolchain packages ships its native binary as a platform-gated
optional dependency, and npm resolves optional dependencies for the **host** platform only — a lockfile written on
macOS records `@rolldown/binding-darwin-arm64` and no Linux entry at all ([npm/cli#4828](https://github.com/npm/cli/issues/4828)).
`npm ci` then installs strictly from that lockfile, the install _succeeds_, and the build dies later with
`Cannot find native binding` / `Cannot find module '@rolldown/binding-linux-x64-gnu'`.

Regenerating the lockfile does not help (a fresh resolve still writes darwin only), and neither does
`npm install --os=linux --cpu=x64 --package-lock-only`. Declaring the Linux packages at the root is what puts them
in the lockfile; they carry `os: ["linux"]` so npm skips downloading them on macOS and Windows.

**Their versions must match their parent package.** After upgrading Vite, Astro, esbuild or sharp, re-read the
parent's `optionalDependencies` in `package-lock.json` and update these pins, or CI installs a binary that does not
match its loader.

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

**Design tokens (`@c2n/theme`).** On top of the component variables, `packages/tools/theme` defines ~35 shared tokens named `--c2-theme--<name>` (same grammar, pseudo-component prefix `c2-theme`, no part segment: `--c2-theme--color-primary`, `--c2-theme--radius-md`, `--c2-theme--border`, `--c2-theme--focus-ring`, …). The generated `base.css` sets every mapped component variable to `var(--c2-theme--<token>, <component default>)` at `:root`/`:host`, so an app themes everything by setting the tokens while any component variable set explicitly still wins. Component SCSS stays untouched. The generator maps by property name + default literal (colour ramp, border shorthands, radii 4/6/8/14/999px, font sizes 12/14px, weights 500/600, focus outlines, disabled opacity, durations, shadows); use the existing literals/scales in new components so they get mapped, and add an entry to `overrides.ts` for deliberate exceptions. Dark mode: `tokens.css` puts light values on `:root`, dark under `[data-theme='dark']` / `.c2-dark` and the `prefers-color-scheme` fallback.

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

Do not use Chrome, browser debugging, browser automation, screenshots,
DOM inspection, DevTools, or browser MCP tools unless explicitly requested
by the user.

Prefer source-code inspection, terminal commands, tests, and application logs.
