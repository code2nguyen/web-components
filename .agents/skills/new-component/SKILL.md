---
name: new-component
description: Scaffold a new c2-* Lit web component with the repo's plop generator (scripts/generator), then implement it and wire the UI app (apps/ui, the docs site) (manifest, gallery preview, module import, doc page). Use when asked to create, add, scaffold or generate a new component or package.
argument-hint: <Component Name> [npm|open] [category] [one-line description]
---

# New component

Create a new `@c2n/<name>` package with the repo's plop generator, implement the element, and wire everything the generator does not touch. Follow AGENTS.md conventions throughout (theming, JSDoc manifest tags, `override`, `redispatchEvent`, code style).

## 1. Collect inputs

From `$ARGUMENTS` and the conversation, determine:

| Input                       | Notes                                                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                    | Title Case words, e.g. `Dropdown List`. Plop derives `dashCase` (`dropdown-list`, tag `c2-dropdown-list`, package `@c2n/dropdown-list`), `pascalCase` (`DropdownList`), `camelCase` (`dropdownList`). |
| **Package type**            | `npm package` → `packages/components/<name>` (default). `open package` → `open-packages/<name>` (MIT "open" components composed from `packages/components/*`, e.g. `chatbot`).                        |
| **Category**                | One of the enum in `apps/ui/src/schemas/index.ts` (`Inputs`, `Buttons`, `Navigation`, `Layout`, `Data display`, `Feedback`, `Chat`). Drives sidebar grouping, landing gallery and ⌘K search.          |
| **Description + behaviour** | One sentence for the doc frontmatter, plus what the element does: attributes, slots, events, states, which existing components it composes.                                                           |

If only the name is given, default to `npm package`, pick the most fitting category yourself, and ask a single question only if the behaviour is genuinely unclear. Check the name is not already taken: `ls packages/components open-packages`.

## 2. Run the generator (non-interactive)

Plop accepts the prompt answers as positional bypass args, so never run it interactively:

```bash
npm run generate -- "<Name>" "npm package"     # or "open package"
npm install                                     # link the new workspace into node_modules/@c2n
```

`pregenerate` recompiles `scripts/generator/plopfile.ts` → `plopfile.js` first. The generator then:

- copies `scripts/generator/files/wc/**` to the package dir (`package.json`, `vite.config.ts`, tsconfigs, `index.html` harness, `README.md`, `src/<name>.ts`, `src/<name>.scss`, `src/vite-env.d.ts`)
- adds `"./<packages>/<name>:build"` to the root `package.json` `wireit.build.dependencies`
- adds the component's `:build` to `packages/tools/theme/package.json` `wireit.build.dependencies` (the theme generator reads its manifest)
- scaffolds the Playwright suite `<package>/test/` (`scenarios.html`, `scenarios.ts`, `fixture.ts`, `<name>.spec.ts`)
- creates the doc stub `apps/ui/src/content/components/<name>.mdx` (open packages: `apps/ui/src/content/oepn-components/<name>.mdx`, see caveat below)
- **npm packages only:** the `custom-elements.json` import and `normalizedManifests` entry in `apps/ui/src/store/component-manifests.ts`, the `@c2n/<name>` dependency in `apps/ui/package.json`, the side-effect import in `component-modules.ts`, a placeholder entry in `component-previews.ts`, and the gallery stub `apps/ui/src/content/gallery/<name>.mdx`

`npm install` afterwards is not optional: it creates the `node_modules/@c2n/<name>` workspace symlink. Without it
`npm run ui:build` fails with `failed to resolve import "@c2n/<name>/custom-elements.json"`.

Verify with `git status --short` that exactly those files changed (`scripts/generator/plopfile.js` is git-ignored and rebuilt by `pregenerate`, so it never shows up).

## 3. Implement the component

Edit `src/<name>.ts` and `src/<name>.scss` in the new package. Use `packages/components/checkbox/src/checkbox.ts` as the reference shape; `label` is a good minimal example.

- Replace the scaffold body. Keep `@customElement('c2-<name>')`, `static override styles = unsafeCSS(styles)` and the `declare global { interface HTMLElementTagNameMap }` block.
- Declare every public CSS variable in the SCSS `$theme` map (`part--css-property`, `part__state--css-property`) and read it with `css.cssVar(...)`. Mirror **every** entry as a `@cssproperty {type} [--c2-<name>__part--prop=default]` JSDoc line, or it will not appear in the API table / inspector. Document `@slot` and `@event` the same way; use `@internalcomponent` / `@slotcomponent` for composed children.
- Reuse the library's default literals so `@c2n/theme` maps the variables automatically: accent `rgb(2, 101, 220)`, text `#18181b` / `#71717a`, borders `1px solid #bcbcc6` (resting) / `#a1a1aa` (hover) / `#e4e4e7` (hairline), radii 4/6/8/14/999px, font sizes 12/14px, weights 500/600, focus outline `2px solid rgba(2, 101, 220, 0.4)`, disabled opacity `0.38`.
- Re-emit native events with `redispatchEvent` from `@c2n/core/dom-helper.js`. Import sibling components by package name (`@c2n/list-item`), never by relative path, and add them to `dependencies` in the package's `package.json` at the lerna version.
- `override` is mandatory on `render`/`update`/etc.; no `any`; prefix unused params with `_`.
- Replace the scaffold's `<c2-<name>>` in `index.html` with a few hand-written usage examples (states, slots, themed variant).

## 4. Write the test suite

The generator leaves a passing placeholder in `<package>/test/`. Replace it with real coverage before calling the
component done — `tests/README.md` has the conventions, and `packages/components/button/test/` is the reference.

- `scenarios.ts` owns each state, branching on the `scenario` query parameter; the spec drives the element through
  real pointer and keyboard input rather than mutating properties.
- Cover the states and transitions that matter, plus an axe scan of the representative ones.
- Use the shared `tab` fixture for focus order. No arbitrary sleeps, no synthetic clicks.
- `npm test` runs the suites of changed packages; `npm run test:all` runs everything on three engines.

For a component where cost matters more than behaviour — anything virtualized or holding a large dataset — see
`packages/components/table/test/` for the split between a machine-independent `*.perf.spec.ts` and an opt-in
wall-clock `*.bench.spec.ts` with a committed baseline.

## 5. Fill in the UI app wiring the generator stubbed

- `apps/ui/src/data/component-previews.ts` — replace the placeholder with real markup keyed by doc id (use `<div class="preview-row">` for several elements).
- `apps/ui/src/content/gallery/<name>.mdx` — replace the two stub cards with styled variants worth drawing from; delete the file if the component has no meaningful variants and the Gallery tab should not appear.
- `apps/ui/src/content/components/<name>.mdx` — fill frontmatter (`title`, `description`, `category`), one intro sentence, `## Installation` (` ```bash tag=CodeBlock `), and a single `## Usage` card: one ` ```html tag=UsageBlock,package=@c2n/<name> ` fence whose body is an optional `<style>` block plus one `<div data-label="Row name">…</div>` per row of live elements. No `# Title`, no `<ApiTable>` (the API tab renders it), no `PresetGallery`.
  Gallery fences are ` ```html tag=MdxCodeBlock,label=<Card name> ` inside `<GalleryGrid>` (blank lines around each), each a fence-local `<style>` class plus the element — never an inline `style` attribute, which the studio would read as the authored state.
- Optional but encouraged: 2–3 curated presets under `'c2-<name>'` in `apps/ui/src/data/component-presets.ts` (they feed the inspector's Presets tab and the MCP `get_presets` tool).
- Landing gallery, sidebar and search pick the page up automatically from the collection.

**Open-package caveat:** `apps/ui/src/content/oepn-components/` is not an Astro collection, so that stub is not served. To document an open package, move the mdx into `apps/ui/src/content/components/`, set `package: '@c2n/<name>'` in its frontmatter, and add the manifest import + `normalizedManifests` entry to `component-manifests.ts` by hand.

## 6. Verify (match CI)

```bash
npm run build -w packages/components/<name>   # type-check + vite build; regenerates custom-elements.json (commit it)
npm run build -w packages/tools/theme         # regenerate the base theme; read the coverage table / dist/report.json
npm run build:tools                           # regenerate packages/tools/mcp/data/registry.json + the skill cheatsheet (commit both)
npm run lint && npm run format:check          # or: npm run fix
npm run ui:build                              # catches a missing apps/ui dependency, which ui:dev does not
npm test                                      # the new package's Playwright suite
npm run ui:dev                                # open /components/<name>; check example, gallery, API table, inspector
```

`build:tools` fails when a docs page has no built package or a preset names an unknown tag; the MCP registry and cheatsheet must be committed with the component (CI diffs them).

Confirm every `$theme` variable appears in the API table and Design tab. In the theme report, every colour/border/radius/focus variable of the new component with a concrete default should be mapped; add an `overrides.ts` entry (token or `exclude` with a reason) for deliberate exceptions. Use `npm run dev -w packages/components/<name>` for the standalone Vite harness.

## Checklist to report

- `packages/components/<name>/` (or `open-packages/<name>/`) scaffolded, implemented, built, `custom-elements.json` generated
- root `package.json` wireit build list entry + `packages/tools/theme/package.json` build dependency
- `@c2n/theme` regenerated, new variables mapped or listed in `overrides.ts`
- `npm run build:tools` run; `packages/tools/mcp/data/registry.json` and `packages/tools/skill/skills/c2n-components/references/components-cheatsheet.md` committed
- `apps/ui/src/store/component-manifests.ts` import + entry
- `apps/ui/package.json` dependency on `@c2n/<name>`, and `npm install` run so the workspace is linked
- `apps/ui/src/data/component-modules.ts`, `component-previews.ts` (+ `component-presets.ts` if presets)
- `apps/ui/src/content/components/<name>.mdx` and `gallery/<name>.mdx` filled in (or the gallery deliberately deleted)
- `<package>/test/` suite written and passing
- lint + format clean, `npm run ui:build` green
