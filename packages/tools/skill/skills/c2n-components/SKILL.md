---
name: c2n-components
description: Build and theme UI with c2n web components, the `c2-*` Lit elements published as `@c2n/*` packages (c2-button, c2-icon-button, c2-link-button, c2-text-field, c2-textarea, c2-checkbox, c2-radio, c2-switch, c2-select, c2-list / c2-list-item, c2-tabs, c2-accordion, c2-details, c2-card, c2-modal, c2-toast, c2-tooltip, c2-side-nav, c2-breadcrumb, c2-avatar, c2-badge, c2-feather-* icons…). Use when a project depends on or wants to adopt @c2n/* packages; when asked to add, replace or style a button, dialog, input, dropdown, list, tabs, card, tooltip, navigation, avatar or icon "with c2n" / "c2-"; to set up or map the @c2n/theme design tokens (light/dark); or to create a variant or composed component wrapping c2 elements. Prefers the c2n MCP tools when connected.
argument-hint: [what to build, e.g. "themed primary button", 'set up the theme', 'variant app-danger-button', 'settings dialog from c2-modal']
---

# c2n components

Build screens from `@c2n/*` web components with the least code: **theme once, use the tags directly, name what repeats.** Facts about components come from the c2n MCP tools or the component manifests, never from memory. The four references in `references/` hold the details; read the one the step points to.

## 1. Detect the project

```
!`node -e "try{const p=require('./package.json');const d={...p.dependencies,...p.devDependencies};console.log('c2n:',Object.keys(d).filter(k=>k.startsWith('@c2n/')).join(' ')||'none');console.log('framework:',['react','vue','svelte','astro','lit','next','nuxt','@angular/core'].filter(k=>d[k]).join(' ')||'vanilla')}catch{console.log('no package.json in cwd')}"`
```

Then look for what already exists before adding anything:

- a theme: `--c2-theme--` in the CSS, or an import of `@c2n/theme`;
- a variants directory: `src/components/ui/`, `src/ui/`, files that `extends … from '@c2n/`, or classes setting `--c2-…` variables;
- the CSS entry point and the dark-mode switch (`data-theme`, a class, `prefers-color-scheme`).

Reuse an existing variant or token bridge over creating a new one.

## 2. Get the facts

With the MCP server connected (`/mcp` lists `c2n`):

1. `list_components` or `search_components` to pick the component for the need.
2. `get_component` for attributes, slots, events and CSS variables (grouped by part and state, with the theme token each follows).
3. `get_examples` for real markup: usage rows and gallery variants with the CSS behind each look.
4. `get_theme` **before writing any CSS**, so overrides go on tokens when a token exists.
5. `generate_variant` when a look repeats: it validates names and emits the class / HTML / Lit code.
6. `get_workflow_guide` for the workflow, theming, variant or framework guide text.

Without the server, in this order: `references/components-cheatsheet.md` (generated summary of every component), then `node_modules/@c2n/<name>/custom-elements.json` (`cssProperties`, `attributes`, `slots`, `events` of the installed version), then https://code2nguyen.github.io/web-components/. Never invent a variable, attribute, slot or event name.

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
| No c2 component fits (kbd hint, count pill, …)               | app component styled with `--c2-theme--*` tokens; never fork or patch a `@c2n/*` package                                     |

Naming: the app's prefix (`app-*`, `site-*`, `my-*`), kebab-case with a hyphen, never `c2-*`. One file per variant in one directory, exported from a barrel, with a short header comment (what it wraps, which variables it fixes, where it is used).

## 5. Conventions

- Variables are set on the host element, a class or an ancestor; **never `::part()`** (the components do not expose parts) and no repeated inline `style="--c2-…"`.
- Grammar `--c2-<component>__<part>[__<state>]--<property>`; states `hover | active | focus | selected | disabled | open | error | read-only`.
- Boolean attributes are present or absent (`disabled`, `running`, `selected`); slots by name (`prefix-icon`, `suffix-icon`, `header`, `footer`, `description`…).
- Composed components set child variables from the parent (`--c2-text-field--border-top: none` on the wrapper class) and re-emit events (`redispatchEvent` from `@c2n/core/dom-helper.js` in Lit).
- Icons: `c2-feather-<name>`, themed with `--c2-feather-icon--size|color|stroke-width`, inherit `currentColor`.
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
- No `::part`, no repeated inline variable styles; repeated looks became variants.
- Variant tags contain a hyphen and do not start with `c2-`.
- Light and dark both checked; the project's build, lint and type-check pass.

## 8. Report

List the packages added, where the theme is imported and which tokens are set, each variant created (name → base tag, file), composed components, and the gaps left as plain app components.
