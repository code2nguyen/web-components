# @c2n/components

Every c2n web component, in the one package c2n publishes for them.

```bash
npm install @c2n/components
```

The components are built in this repository as separate workspace packages, but only this package is published: it bundles all of them. Each entry is a separate module and what entries share sits in common chunks, so an application that imports three components ships those three and what they use. Its dependencies are what the bundle still imports: Lit, `@c2n/core`, `@c2n/theme`, the icon sets two components draw with, and the third-party libraries of a few components (Shiki, ProseMirror, d3-geo, …).

Up to 0.0.24 every component was also published as its own `@c2n/<name>` package. Those packages are deprecated: replace `@c2n/<name>` with `@c2n/components/<name>` in your imports.

## Entries

| Import                      | What it gives you                                                           |
| --------------------------- | --------------------------------------------------------------------------- |
| `@c2n/components/<name>`    | One component: its classes and types, and it registers each of its elements |
| `@c2n/components`           | Every component, registered at once                                         |
| `@c2n/components/react`     | JSX types for every `c2-*` tag                                              |
| `@c2n/components/vue`       | Volar template types for every `c2-*` tag                                   |
| `@c2n/components/theme.css` | The base theme (`base.css` and `tokens.css` separately, as in `@c2n/theme`) |

```ts
import '@c2n/components/theme.css'
import '@c2n/components/table'
import '@c2n/components/select'
import type { TableRow } from '@c2n/components/table'
```

`<name>` is the component's name: `@c2n/components/text-field` for `c2-text-field`, `@c2n/components/chart` for every chart element.

**Prefer the per-component entries in an application you ship.** Registering a custom element is a side effect, so no bundler can drop one that is never used: `import '@c2n/components'` puts every component in the bundle. The barrel suits prototypes, internal tools and a `<script type="module">` from a CDN.

## React and Vue

```ts
// src/c2-elements.d.ts
import '@c2n/components/react' // or '@c2n/components/vue'
```

These declare every tag, with props and events typed from the element classes. The rules each framework needs followed (register the elements before the first render, kebab-case attribute names in server-rendered React, the `isCustomElement` option in Vue) are in the [Frameworks guide](https://code2nguyen.github.io/web-components/guides/frameworks).

## Not included

- **Icon sets.** `@c2n/feather-icons`, `@c2n/phosphor-icons` and `@c2n/symbols` are one element per icon (Phosphor alone is 1,512), so they stay their own install.
- **Optional engines.** `c2-*-chart` renders with `uplot` or `echarts` and `c2-code-editor` with CodeMirror. They are optional peer dependencies: install the ones you use.

## Maintaining this package

The component packages (`packages/components/*`, `open-packages/*`) are private workspaces. Everything here except this README, `scripts/` and the hand-written fields of `package.json` (name, description, scripts, …) is generated:

- `npm run build -w packages/tools/framework-types` writes the bundle inputs under `src/` (one entry per component package, the barrel, the React and Vue declarations), the three stylesheets, and the `exports`, `files`, `customElements`, `dependencies`, `peerDependencies` and `devDependencies` of `package.json`. A new component package joins the next time it runs; CI fails when the committed output is stale.
- `npm run build -w packages/umbrella` (`scripts/bundle.ts`) builds `dist/` from `src/` with Vite, inlining the workspace packages, copies their declarations under `dist/types/` with `@c2n/<name>` specifiers rewritten to relative paths, and merges their manifests into `custom-elements.json`. It fails when the bundle imports a package `package.json` does not list. `prepack` runs it, so `npm pack` and `lerna publish` always ship a fresh build.

`npm run type-check -w packages/umbrella` compiles the bundled declarations with `skipLibCheck` off, which is what reports two packages exporting the same name from the barrel, and type-checks the React and Vue fixtures in `test/`. `test/umbrella.spec.ts` imports the barrel in a browser and checks that every tag in the merged manifest is registered.
