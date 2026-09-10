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
- creates the doc stub `apps/ui/src/content/components/<name>.mdx` (open packages: `apps/ui/src/content/oepn-components/<name>.mdx`, see caveat below)
- **npm packages only:** appends the `custom-elements.json` import and the `normalizedManifests` entry in `apps/ui/src/store/component-manifests.ts`

Verify with `git status --short` that exactly those files changed. If `scripts/generator/plopfile.js` shows a diff after the recompile, keep it (it is committed).

## 3. Implement the component

Edit `src/<name>.ts` and `src/<name>.scss` in the new package. Use `packages/components/checkbox/src/checkbox.ts` as the reference shape; `label` is a good minimal example.

- Replace the scaffold body. Keep `@customElement('c2-<name>')`, `static override styles = unsafeCSS(styles)` and the `declare global { interface HTMLElementTagNameMap }` block.
- Declare every public CSS variable in the SCSS `$theme` map (`part--css-property`, `part__state--css-property`) and read it with `css.cssVar(...)`. Mirror **every** entry as a `@cssproperty {type} [--c2-<name>__part--prop=default]` JSDoc line, or it will not appear in the API table / inspector. Document `@slot` and `@event` the same way; use `@internalcomponent` / `@slotcomponent` for composed children.
- Re-emit native events with `redispatchEvent` from `@c2n/core/dom-helper.js`. Import sibling components by package name (`@c2n/list-item`), never by relative path, and add them to `dependencies` in the package's `package.json` at the lerna version.
- `override` is mandatory on `render`/`update`/etc.; no `any`; prefix unused params with `_`.
- Replace the scaffold's `<c2-<name>>` in `index.html` with a few hand-written usage examples (states, slots, themed variant).

## 4. Wire the UI app (the generator does not do this)

- `apps/ui/src/data/component-modules.ts` — add `import '@c2n/<name>'` (alphabetical).
- `apps/ui/src/data/component-previews.ts` — add a `'<name>': \`...\``gallery snippet keyed by doc id (use`<div class="preview-row">` for several elements).
- `apps/ui/src/content/components/<name>.mdx` — fill frontmatter (`title`, `description`, `category`), intro sentence, and `## Examples` fences (` ```html tag=MdxCodeBlock ` — add `,compact=true` for small inline elements). Keep `<ApiTable componentTag="c2-<name>">`.
- Optional but encouraged: add 2–3 curated presets under `'c2-<name>'` in `apps/ui/src/data/component-presets.ts`, then add a `## Presets` section with `<PresetGallery componentTag="c2-<name>" />` (import `PresetGallery from '../../components/PresetGallery.astro'`) above `## API`.
- Landing gallery, sidebar and search pick the page up automatically from the collection.

**Open-package caveat:** `apps/ui/src/content/oepn-components/` is not an Astro collection, so that stub is not served. To document an open package, move the mdx into `apps/ui/src/content/components/`, set `package: '@c2n/<name>'` in its frontmatter, and add the manifest import + `normalizedManifests` entry to `component-manifests.ts` by hand.

## 5. Verify (match CI)

```bash
npm run build -w packages/components/<name>   # type-check + vite build; regenerates custom-elements.json (commit it)
npm run lint && npm run format:check          # or: npm run fix
npm run ui:dev                              # open /components/<name>; check example, API table, "customize" inspector
```

Confirm every `$theme` variable appears in the API table and Design tab. Use `npm run dev -w packages/components/<name>` for the standalone Vite harness.

## Checklist to report

- `packages/components/<name>/` (or `open-packages/<name>/`) scaffolded, implemented, built, `custom-elements.json` generated
- root `package.json` wireit build list entry
- `apps/ui/src/store/component-manifests.ts` import + entry
- `apps/ui/src/data/component-modules.ts`, `component-previews.ts` (+ `component-presets.ts` if presets)
- `apps/ui/src/content/components/<name>.mdx` filled in
- lint + format clean
