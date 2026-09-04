# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`@c2n/web-components` is an npm-workspaces monorepo of Lit 3 web components. Each component is its own publishable package (`@c2n/<name>`, all versioned together by Lerna at the root `lerna.json` version). Components are registered as custom elements with the `c2-` tag prefix. There are no tests in this repo — verification is done via each package's Vite dev harness and the Astro demo site.

## Commands

```bash
npm install                       # root install wires all workspaces

npm run build                     # wireit: type-check + vite build for every component package
npm run build -w packages/components/checkbox  # build one package
npm run dev -w packages/components/checkbox    # vite dev server against that package's index.html harness
npm run type-check -w packages/components/checkbox

npm run demo                      # build all components, then astro dev
npm run demo:dev                  # astro dev only (uses previously built dist/)
npm run demo:build                # build components + astro build

npm run lint                      # eslint (wireit-cached)
npm run lint:fix
npm run format:check              # prettier
npm run format:fix
npm run fix                       # lint:fix + format:fix

npm run generate                  # scaffold a new component (plop)
npm run clean                     # nuke node_modules, dist, types, custom-elements.json, package-lock
```

Release: `npm run build` then `npx lerna publish patch --no-private --exact --yes`.

CI (`.github/workflows/deploy.yml`, Node 24) runs `npm ci`, `npm run lint`, `npm run format:check`, `npm run demo:build` and deploys `demo/dist/` to GitHub Pages. Match those checks before pushing. A husky `pre-commit` hook runs lint-staged (prettier + eslint --fix).

## Repository layout

- `packages/components/*` — published components. Each has `src/<name>.ts`, `src/<name>.scss`, `index.html` (standalone dev harness with hand-written usage examples), and a Vite lib build. `design-board` and `json-form` live here too but are WIP and excluded from the root build graph.
- `open-packages/*` — same structure, but MIT-licensed / "open" components (currently `chatbot`). Composed of `packages/components/*` components. Note these sit one directory _shallower_ than the component packages, so every repo-relative path in them (wireit deps, the cem plugin import) differs by one `../` level.
- `packages/tools/config` — private (`type: module`); holds the shared `tsconfig.lib.json`, `tsconfig.node.json`, `eslint.config.js`, and pins the toolchain (typescript, vite, eslint, typescript-eslint, lit-analyzer). Every package lists it as a devDependency. ESLint uses flat config: the root `eslint.config.js` just re-exports `@c2n/config/eslint.config.js` (resolved by package name, so the move did not touch it), and `eslint .` lints the whole monorepo (ignores live in the config, not in CLI flags).
- `packages/tools/sass` — shared SCSS: `css-variable.scss` (the theming engine), `variables.scss`, `animation.scss`.
- `packages/tools/playground` — Vite sandbox app exercising `json-form`; no custom element, no build script.
- `packages/core` — **is itself a package** (`@c2n/core`), not a directory of packages: shared TS helpers (`dom-helper`, `css-helper`, `lit-helper`, controllers). Plain `tsc` build, subpath exports only (`@c2n/core/dom-helper.js`) — no barrel index. It is listed in `workspaces` as the bare path `packages/core`, unlike the `components/*` and `tools/*` globs.
- `demo/` — Astro 7 + MDX documentation site, one `.mdx` per component. Collections use the Content Layer API (`src/content.config.ts` with a `glob()` loader); entries are keyed by `entry.id` and rendered with `render(entry)` from `astro:content`.
- `scripts/generator` — plop generator; `scripts/cem-plugin-customize` — custom-elements-manifest analyzer plugin.
- Package **directories** are grouped (`components/`, `tools/`) but npm **names** are flat — `packages/components/avatar` is `@c2n/avatar`, `packages/tools/sass` is `@c2n/sass`. Every cross-package reference (`@c2n/core/dom-helper.js`, `@use '@c2n/sass/...'`, `extends: "@c2n/config/tsconfig.lib.json"`) resolves by package name, not by location.
- `design-board`, `json-form` and `playground` are work-in-progress and deliberately excluded from the root `build` graph (json-form's build script is disabled as `"--build"`).

## Build orchestration

Wireit drives everything. The root `package.json` `wireit.build.dependencies` is the **explicit list** of every buildable package — a new package is not built until it is added there (the plop generator appends it for you). Per-package, `build` depends on `type-check`, which depends on `../../core:build` (so `@c2n/core` types are always fresh first); from `open-packages/*` that same dep is `../../packages/core:build`. Component `vite.config.ts` files import the CEM plugin as `../../../scripts/cem-plugin-customize/index`; open packages use `../../scripts/...`.

Vite lib config per package: single ES output, `minify: false`, and `external: /^lit|@c2n/` — Lit and sibling `@c2n/*` packages are never bundled into a component. Keep cross-package dependencies minimal; import through the published subpath (`@c2n/core/dom-helper.js`), not relative paths across packages.

## Pinned transitive dependency

The root `package.json` has `overrides: { "@lit-labs/ssr": "3.2.2" }`. `@astrojs/lit` (unmaintained since mid-2024) hand-builds the `renderInfo` object in its `server.js` with only `customElementInstanceStack`/`customElementHostStack`, but `@lit-labs/ssr` 3.3+ also reads `eventTargetStack`/`slotStack`. Its own `^3.2.2` range floats into those versions, and the demo build then dies with `Cannot read properties of undefined (reading 'length')` inside `getLast`. Do not remove the override without first checking that `@astrojs/lit` has been updated.

## The manifest pipeline (JSDoc → docs UI)

This is the least obvious part of the architecture. `vite-plugin-cem` (plus `scripts/cem-plugin-customize`) analyzes each component during `vite build` and emits `<package>/custom-elements.json`. The demo imports those manifests via `@c2n/<name>/custom-elements.json` in `demo/src/store/component-manifests.ts`, normalizes them in `demo/src/utils/manifest-utils.ts`, and renders both `<ApiTable>` and the live theming panel (`demo/src/components/configuration/`) from them.

Consequences:

- Component JSDoc tags are the API documentation source of truth: `@tag`, `@slot`, `@event`, and `@cssproperty {type} [--name=default]`. Every CSS custom property a consumer may set must have a `@cssproperty` line, or it will not appear in the demo's API table or config panel.
- The custom plugin adds two non-standard tags: `@internalcomponent` and `@slotcomponent`, used by the demo to document composed/slotted children.
- After changing a component's public surface, rebuild that package so its `custom-elements.json` is regenerated; committed manifests are checked in.
- A new published component must be added by hand (or by plop) to `demo/src/store/component-manifests.ts` in both the import list and the `normalizedManifests` array.

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

`npm run generate` prompts for a name and package type (`npm package` → `packages/components/`, `open package` → `open-packages/`) and then: scaffolds the package from `scripts/generator/files/wc`, adds a doc stub under `demo/src/content/components/` (or `oepn-components/` — note the existing typo in that directory name), appends the build target to the root `package.json`, and for npm packages wires the manifest into `demo/src/store/component-manifests.ts`. Because the two package types sit at different depths, `plopfile.ts` injects `coreBuildDep` and `cemPluginPath` into the template data rather than hardcoding `../` counts in the templates — update those if the layout changes again.

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
