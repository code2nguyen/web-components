---
name: c2n-components
description: Build and theme applications with the `c2-*` web components from `@c2n/*`. Use when adopting c2n, implementing UI with c2n components, mapping `@c2n/theme` tokens, or creating application-owned variants and compositions.
license: MIT
---

# c2n components

Build screens from `@c2n/*` web components with the least code: **theme once, use the tags directly, name what repeats.** Facts about components come from the c2n MCP tools or the component manifests, never from memory. The references in `references/` hold the details; read only the one the current step points to.

This workflow expects a JavaScript project and Node.js 20 or newer. The c2n MCP server is recommended; the skill retains a compact discovery index and can inspect installed package manifests when MCP is unavailable.

## 1. Detect the project

Inspect the project's `package.json` with the available filesystem or shell tools. Identify installed `@c2n/*` packages and the framework before changing dependencies or source files.

Then look for what already exists before adding anything:

- a theme: `--c2-theme--` in the CSS, or an import of `@c2n/theme`;
- a variants directory: `src/components/ui/`, `src/ui/`, files that `extends … from '@c2n/`, or classes setting `--c2-…` variables;
- the CSS entry point and the dark-mode switch (`data-theme`, a class, `prefers-color-scheme`).

Reuse an existing variant or token bridge over creating a new one.

## 2. Get the facts

When c2n MCP tools are available:

1. `list_components` or `search_components` to pick the component for the need.
2. `get_component` for attributes, slots, events, documented CSS parts and CSS variables (grouped by semantic target and state, with the theme token each follows).
3. `get_examples` for real markup. Start with the default example, then retrieve gallery examples matching the requested state, layout or use case. Preserve any accessibility note returned with an example.
4. `get_presets` when a curated visual treatment is useful. A preset is structured CSS-variable and attribute data suitable for generation; a gallery example is broader usage and composition context.
5. `get_theme` **before writing any CSS**, so overrides go on tokens when a token exists.
6. `generate_variant` when a selected preset or gallery look repeats: it validates names and emits the class / HTML / Lit code.
7. `get_workflow_guide` for the workflow, theming, variant or framework guide text.

Without the server, use `references/component-catalog.md` only to identify a likely package. Then read `node_modules/@c2n/<name>/custom-elements.json` for the installed version's attributes, slots, events, CSS parts and CSS properties. If the package is not installed, use https://code2nguyen.github.io/web-components/. Never infer an API from the catalog or invent a variable, attribute, slot or event name.

## 3. Theme once

Read `references/theming.md`.

- Install the theme with the components: `npm install @c2n/theme @c2n/<component>…`.
- Import `@c2n/theme/theme.css` once at the application root (`main.ts`, root layout, global stylesheet). If the app already has design tokens, import `@c2n/theme/base.css` alone and bridge the app's tokens onto the `--c2-theme--*` names on `:root`.
- Override tokens on `:root` (light) and under the app's dark selector. Component variables are never set globally when a token covers the job.
- Register elements with side-effect imports (`import '@c2n/button'`) at the entry or in the module that renders them; icons individually (`import '@c2n/feather-icons/icons/search.js'`).

## 4. Decide: tag, variant, or composed component

Read `references/variant-components.md` when creating one.

| Situation                                                    | Do                                                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Appears once, themed default is right                        | plain `<c2-…>` tag                                                                                                           |
| Same look repeats, markup otherwise plain                    | **CSS class** setting `--c2-<component>__…` variables (in the app's variants stylesheet)                                     |
| Same attributes / slots / accessible name repeat too         | **wrapper component** in the app's framework rendering the c2 element                                                        |
| Must be its own tag (strings, other Lit templates, shipping) | **Lit subclass**: `class X extends Button { static override styles = [Button.styles, css\`:host{…}\`] }`, defined as `app-*` |
| Several c2 components + logic repeat                         | **composed component**: children's variables on `:host`/a class, attributes forwarded, events re-emitted                     |
| No c2 component fits (kbd hint, count pill, …)               | app component styled with `--c2-theme--*` tokens; avoid patching installed `@c2n/*` packages for app-local behavior          |

Naming: the app's prefix (`app-*`, `site-*`, `my-*`), kebab-case with a hyphen, never `c2-*`. One file per variant in one directory, exported from a barrel, with a short header comment (what it wraps, which variables it fixes, where it is used).

## 5. Conventions

- Prefer variables set on the host element, a class or an ancestor. Use `::part()` only when `get_component` documents that native CSS part and variables cannot express the change. Do not repeat inline `style="--c2-…"`.
- Grammar `--c2-<component>__<part>[__<state>]--<property>`; states `hover | active | focus | selected | disabled | open | error | read-only`.
- Boolean attributes are present or absent (`disabled`, `running`, `selected`); slots by name (`prefix-icon`, `suffix-icon`, `header`, `footer`, `description`…).
- Composed components set child variables from the parent (`--c2-text-field--border-top: none` on the wrapper class) and re-emit events (`redispatchEvent` from `@c2n/core/dom-helper.js` in Lit).
- Icons: use the registered Feather or Phosphor icon tag and its published module; prefer individual icon imports and theme through the icon package's shared variables.
- Dark mode only through tokens; SSR or static HTML guards unregistered tags with `c2-x:not(:defined) { visibility: hidden }`.

## 6. Framework notes

Read `references/frameworks.md` for details.

- Plain HTML / Vite: side-effect imports in a `<script type="module">` or the entry module.
- Lit: import what you render; subclass for tag variants; `redispatchEvent` for child events.
- Astro: `@astrojs/lit` islands (`<Button client:load>`, kebab-case attributes only; a `client:only` island must not contain islands) or plain tags plus a client `<script>` for repeated markup; variant styles need `is:global`.
- React 19: props become attributes, custom events via `ref.addEventListener`; older React needs string attributes and refs.
- Vue: `compilerOptions.isCustomElement = (tag) => tag.startsWith('c2-')`; `.prop` for arrays/objects.

## 7. Verify

- Every element used is registered (no empty tags, no `HTMLUnknownElement`); `@c2n/theme` imported exactly once.
- Every variable, attribute, slot and event name exists in `get_component` / the manifest.
- Every `::part()` name exists in `get_component`; no repeated inline variable styles; repeated looks became variants.
- Variant tags contain a hyphen and do not start with `c2-`.
- Light and dark both checked; the project's build, lint and type-check pass.

## 8. Report

List the packages added, where the theme is imported and which tokens are set, each variant created (name → base tag, file), composed components, and the gaps left as plain app components.
