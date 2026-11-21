# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It holds what every session needs; the rest lives next to the code it describes (see "Where the rest lives").

## Overview

`@c2n/web-components` is an npm-workspaces monorepo of Lit 3 web components. Each component is its own **private** workspace package (`@c2n/<name>`, `"private": true`, sibling `@c2n` dependencies as `"*"`); the one published component package is `@c2n/components` (`packages/umbrella`), which bundles them all. The public packages (`@c2n/components`, `@c2n/core`, `@c2n/theme`, the icon sets, the tools and `@c2n/angular`) are versioned together by Lerna at the root `lerna.json` version. Work-in-progress packages are marked `"c2n": { "status": "wip" }` — `private` no longer means WIP, and the discovery scripts read that field. Components are registered as custom elements with the `c2-` tag prefix. Component browser tests use Playwright with one shared Vite server; suites live in each package's `test/` directory. See `tests/README.md`.

## Commands

```bash
npm install                       # root install wires all workspaces

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

npm run build -w packages/tools/theme     # regenerate @c2n/theme (tokens.css, base.css, tokens.json, report.json) from the component manifests
npm run build:tools               # after the root build: @c2n/mcp registry (packages/tools/mcp/data/registry.json) + @c2n/skill catalog/version sync
npm run mcp:smoke                 # spawn the MCP server over stdio and exercise every tool
npm run mcp:readiness             # AI readiness: components changed since the last run vs their last score (-- --full for all) → packages/tools/mcp/readiness/ (committed); skill: ai-readiness
npm run mcp:inspect               # MCP Inspector against packages/tools/mcp/src/cli.ts
npm run generate                  # scaffold a new component (plop)
npm run changelog                 # regenerate CHANGELOG.md + apps/ui/src/data/changelog.json from git history (--next <version> files unreleased commits under it)
npm run clean                     # nuke node_modules, dist, types, custom-elements.json, package-lock
```

Release, `lerna version` and the changelog generator: `docs/agents/release-and-changelog.md`. Write commit subjects as Conventional Commits with the package as scope (`feat(table): …`) — that subject is the changelog line.

Claude Code on the web: `.claude/hooks/session-start.sh` (registered in `.claude/settings.json`, remote sessions only) runs `npm install` and `build:registry` for `@c2n/mcp`, so the `c2n` server in `.mcp.json` can start in a fresh clone (it needs `node_modules` and the ignored `data/registry.json`), and exports `CHROMIUM_PATH` for the container's preinstalled Chromium, which `playwright.config.ts` launches when set.

After every file Claude Code writes, `.claude/hooks/post-edit.sh` (a `PostToolUse` hook, local and remote) formats it with prettier and checks its c2 markup with `c2n-mcp validate --hook`, handing the findings back to the agent: every finding under `apps/examples/` and `lab/apps/`, errors only under `apps/ui/src/` (its chrome and guides carry accepted warnings).

CI (`.github/workflows/deploy.yml`, Node 24) runs `npm ci`, `npm run lint`, `npm run format:check`, `npm run ui:build`, `npm run build:tools`, `npm run mcp:smoke`, a `git diff --exit-code` freshness check on the generated skill catalog / plugin files, and deploys `apps/ui/dist/` to GitHub Pages. `npm run check:agent-docs` (paths named in the guidance files exist, every `AGENTS.md` links its `CLAUDE.md`, one copy of each skill) `npm run check:reachability` (every component reachable through MCP and `/llms.txt`) and `npm run check:app-markup` (no `validate` errors in `apps/ui/src`, `apps/examples` and `lab/apps`) run there and on pull requests. Match those checks before pushing. A husky `pre-commit` hook runs lint-staged (prettier + eslint --fix). On pull requests, `component-tests.yml` also runs `node lab/scripts/readiness.mjs --check` (the lab reports' generated AI readiness sections: a component change that breaks a lab build's markup, or a validator change, makes them stale; regenerate with `--all`).

## Where the rest lives

A `CLAUDE.md` in a subdirectory loads automatically once a session reads or edits a file under it. A file under `docs/agents/` never loads on its own: open it when the task matches. When a task changes an area from outside it (the root `package.json`, `scripts/`), read that area's file first. Every `AGENTS.md` is a symlink to the `CLAUDE.md` beside it, and every skill exists once (`.agents/skills/*` and `.claude/skills/*` link to the same folders), so Codex and Claude read the same text. Codex loads the `AGENTS.md` files from the repository root down to its working directory only, not when it opens a file elsewhere: from the root, open the files the table names.

| File                                       | Read it for                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/components/CLAUDE.md`            | Any component work: the six foundation rules in full, reachability through MCP and `llms.txt`, theming grammar and design tokens, component conventions (host attributes, `customElement`/`property` imports, events, field protocol, messages), modern web platform rules, the manifest pipeline (JSDoc → docs UI), adding a component |
| `open-packages/CLAUDE.md`                  | The MIT "open" packages (one directory shallower; same component rules)                                                                                                                                                                                                                                                                 |
| `packages/icons/CLAUDE.md`                 | Icon sets: generated Feather/Phosphor packages, the hand-drawn `symbols` and `task-icons`, adding an icon set                                                                                                                                                                                                                           |
| `packages/umbrella/CLAUDE.md`              | `@c2n/components`, the only published component package: bundle, generated inputs, size budget                                                                                                                                                                                                                                          |
| `packages/tools/framework-types/CLAUDE.md` | Generated React/Vue/Angular glue, IDE data, framework bindings                                                                                                                                                                                                                                                                          |
| `packages/tools/mcp/CLAUDE.md`             | `@c2n/mcp`: registry, gallery screenshots and audit, `validate_markup`, search and readiness scoring                                                                                                                                                                                                                                    |
| `packages/tools/skill/CLAUDE.md`           | `@c2n/skill` and its installer                                                                                                                                                                                                                                                                                                          |
| `packages/tools/theme/CLAUDE.md`           | `@c2n/theme` generator                                                                                                                                                                                                                                                                                                                  |
| `packages/adapters/CLAUDE.md`              | `@c2n/angular` (ngc build, value accessors)                                                                                                                                                                                                                                                                                             |
| `apps/ui/CLAUDE.md`                        | The docs site: collections, Docs/Gallery/API pages, gallery card authoring, studio/inspector, MDX islands, dogfooding `c2-*` in the site, `COMPONENT-FEEDBACK.md`                                                                                                                                                                       |
| `apps/examples/CLAUDE.md`                  | Example apps and the per-framework interop traps (React, Angular, Vue, SvelteKit, Next.js, Astro)                                                                                                                                                                                                                                       |
| `lab/CLAUDE.md`                            | The component lab                                                                                                                                                                                                                                                                                                                       |
| `docs/agents/release-and-changelog.md`     | Release workflow, `lerna version`, changelog generation                                                                                                                                                                                                                                                                                 |
| `docs/planning/`                           | Roadmaps, candidate research and action plans: intent and history, not current rules. Open only for planning (what to build next, a missing component); `docs/planning/README.md` says which are maintained                                                                                                                             |

## Repository layout

- `packages/components/*` — the component packages (private workspaces, `@c2n/<name>`); `open-packages/*` — MIT-licensed components, one directory shallower.
- `packages/icons/*` — icon-set packages (`@c2n/feather-icons`, `@c2n/phosphor-icons`, `@c2n/symbols`, `@c2n/task-icons`).
- `packages/umbrella` — published `@c2n/components`, which bundles every component. User-facing docs and the docs site import `@c2n/components/<name>`, never a workspace package.
- `packages/tools/mcp` (`@c2n/mcp`), `packages/tools/skill` (`@c2n/skill`), `packages/tools/theme` (`@c2n/theme`), `packages/tools/framework-types` (`@c2n/framework-types`) — published tooling, built by `npm run build:tools`, not the root `build`.
- `packages/adapters/*` — framework adapters (`@c2n/angular`).
- `packages/tools/config` — private (`type: module`); holds the shared `tsconfig.lib.json`, `tsconfig.node.json`, `eslint.config.js`, and pins the toolchain (typescript, vite, eslint, typescript-eslint, lit-analyzer). Every package lists it as a devDependency. ESLint uses flat config: the root `eslint.config.js` just re-exports `@c2n/config/eslint.config.js` (resolved by package name, so the move did not touch it), and `eslint .` lints the whole monorepo (ignores live in the config, not in CLI flags). Node globals are enabled for `**/*.config.*`, `scripts/**` and any package-local `**/scripts/**` (e.g. the icon generators).
- `packages/tools/sass` — shared SCSS: `css-variable.scss` (the theming engine), `variables.scss`, `animation.scss`.
- `packages/tools/playground` — Vite sandbox app with an older, unrelated `json-form` experiment (a `json-form` element, not `c2-json-form`); no build script.
- `packages/core` — **is itself a package** (`@c2n/core`), not a directory of packages: shared TS helpers (`dom-helper`, `css-helper`, `lit-helper`, controllers). Plain `tsc` build, subpath exports only (`@c2n/core/dom-helper.js`) — no barrel index. It is listed in `workspaces` as the bare path `packages/core`, unlike the `components/*` and `tools/*` globs.
- `apps/ui/` — the Astro docs site (`@c2n/ui`); anything app-level belongs under `apps/`, not `packages/`.
- `apps/examples/*` — complete example apps per framework, embedded in the docs site under `/demo/<id>/`.
- `lab/` — the component lab (not a workspace package).
- `scripts/generator` — plop generator; `scripts/cem-plugin-customize` — custom-elements-manifest analyzer plugin.
- Package **directories** are grouped (`components/`, `tools/`) but npm **names** are flat — `packages/components/avatar` is `@c2n/avatar`, `packages/tools/sass` is `@c2n/sass`. Every cross-package reference (`@c2n/core/dom-helper.js`, `@use '@c2n/sass/...'`, `extends: "@c2n/config/tsconfig.lib.json"`) resolves by package name, not by location.
- `design-board` and `playground` are work-in-progress and deliberately excluded from the root `build` graph.

## Build orchestration

Wireit drives everything. The root `wireit.examples:build` group is the equivalent explicit list for `apps/examples/*`, and `ui:build` depends on both it and `build`, so `npm run ui:build` (what CI runs) still builds the whole site. The root `package.json` `wireit.build.dependencies` is the **explicit list** of every buildable package — a new package is not built until it is added there (the plop generator appends it for you). Per-package, `build` depends on `type-check`, which depends on `../../core:build` (so `@c2n/core` types are always fresh first); from `open-packages/*` that same dep is `../../packages/core:build`. A package that imports a sibling component must list that sibling's `:build` there too (`../list:build`), or a clean build type-checks it before the sibling's declarations exist. Component `vite.config.ts` files import the CEM plugin as `../../../scripts/cem-plugin-customize/index`; open packages use `../../scripts/...`.

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

## Component foundation

The six rules every component follows. The full text, with scope and references, is in `packages/components/CLAUDE.md`; read it before designing or changing a component.

| Concern      | Mechanism                                                                 | Not                                                    |
| ------------ | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Presentation | `--c2-*` CSS variables                                                    | a `size`/`color`/`variant` attribute for a look        |
| Extension    | named slots (wrapper exported as a `part`), then `render<Part>` functions | a flag or enum per content variation, a forked copy    |
| Data         | declarative markup **and** an in-memory property, plus a `dataSource`     | a property-only API, or a fetch built into the element |
| Actions      | an action zone: a named slot the app fills, plus methods and events       | a built-in button, flag and event per command          |
| Text         | message tokens in `src/messages.ts`, translated by the app                | a string literal in the template                       |
| Proof        | a live card in the component's gallery (`apps/ui/src/content/gallery/`)   | a feature that exists only in the API table            |

Three rules that bite outside a component's own files too: never write an attribute on a component's host or on author light-DOM children (use `ElementInternals` and manual slot assignment); import `customElement` from `@c2n/core/element-helper.js` and `property` from `@c2n/core/lit-helper.js`, not `lit/decorators.js`; every public CSS variable has an `@cssproperty` JSDoc line, or it is missing from the docs.

## Code style

Prettier: single quotes, no semicolons, print width 160, 2-space tabs. Astro files use `prettier-plugin-astro`.

Because the repo now has `.tsx` sources, the root `format:check`/`format:fix` globs and the eslint rule block (`packages/tools/config/eslint.config.js`) include `tsx`/`jsx` — without that, React files silently got a different rule set (`no-unused-vars` as an error with no `_` escape, no `no-explicit-any`). The prettier globs (and lint-staged) also include `vue`; eslint does **not** lint `.vue` (that would need `eslint-plugin-vue` + `vue-eslint-parser`), so the SFCs are covered by prettier and `vue-tsc` only.

## Before opening a pull request

Pull requests target `develop`. Before opening one, review the branch's changes and act on what the reviews find:

1. Run `/code-review` on the branch. Fix the confirmed bugs. For a finding left unfixed, say why (not a real bug, out of scope, or left for a follow-up).
   **Then review again: one round is not enough.** Fixes are new, unreviewed code, and a second pass routinely finds bugs the fixes introduced (on the AI readiness lab work, pass 2 found three `important` bugs in pass 1's fixes). Repeat review → fix until a pass reports no `important` finding. Do not wait for an empty list: the reviewer always returns a few nits, so past that point fix the cheap nits and name the rest, with the reason, in the pull request. Each fix stays on the branch as a fix-up of the commit it corrects (squash before merging), so review rounds do not become changelog lines.
2. Run `/security-review` on the branch and handle its findings the same way.
3. When the branch changes a component, run the `modern-web-review` skill: `node .claude/skills/modern-web-review/scripts/scan.mjs` must pass (fix each error or justify it with a `modern-web-ignore` comment), then review the diff against its old → new pattern table and the guides for what the component does. Handle its findings the same way.
4. When the branch changes a component (new or updated) or its docs, review it in the docs app by screenshot: `npm run ui:build`, then `node .claude/skills/new-component/scripts/doc-screenshots.mjs <id> [--press "<button name>"]…`, and look at every image (both themes, every gallery card, interactive states, `aria.txt`) as step 8 of the `new-component` skill describes. Fix what it shows.
5. Re-run the checks the fixes touched, then open the pull request. Its description lists what each review found (code, security, modern web), what the screenshot review caught, and what was done about it.

Do not open a pull request while any review still has an unanswered finding.

## Browser usage

Do not use Chrome, browser debugging, browser automation, screenshots,
DOM inspection, DevTools, or browser MCP tools unless explicitly requested
by the user. The one standing exception is the docs-app screenshot review in
"Before opening a pull request" (the `doc-screenshots.mjs` script of the
`new-component` skill), which the maintainer asked for on every component change.

Prefer source-code inspection, terminal commands, tests, and application logs.
