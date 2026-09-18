# Using c2n components per framework

All components are standard custom elements (Lit 3). Register with a side-effect import; then they are plain HTML.

## Events (every framework)

Each component that fires events exports an event map (`TableEventMap`, `SelectEventMap`, …) from the same module as its class, and declares typed `addEventListener` overloads, so the detail narrows with no cast:

```ts
table.addEventListener('selection-change', (event) => event.detail.rows) // TableRow[]
```

`EventMapOf<T>` from `@c2n/core/event-helper.js` recovers a component's map for code that is generic over elements. Use the map type instead of hand-writing `CustomEvent<{ value: string[] }>`.

`selection-change` **does not bubble** — `c2-list`, `c2-select`, `c2-table`, `c2-tabs` and `c2-virtual-list` all fire it, so a listener goes on the element itself, never on an ancestor. `c2-tabs` fires `selection-change`, not `change`.

Every form-associated component fires plain `input` and `change` alongside its semantic event, which is what generic two-way bindings listen for.

A duplicate `customElements.define` warns and keeps the first definition instead of throwing.

## Plain HTML / Vite / any bundler

```html
<script type="module">
  import '@c2n/theme/theme.css'
  import '@c2n/button'
</script>
<c2-button>Save</c2-button>
```

With a bundler, put the imports in the entry module (`main.ts`). CSS imports work through the bundler's CSS handling.

## Lit

Import what you render at the top of the component module (`import '@c2n/text-field'`). Extend a component for a tag variant (`class AppField extends TextField`). Re-emit child events with `redispatchEvent` from `@c2n/core/dom-helper.js`. Set child variables in your `static styles` on `:host` or on a class.

## Astro

- Islands (`@astrojs/lit`): `import { Button } from '@c2n/button'` in the frontmatter, `<Button client:load>` in the template. SSR'd with declarative shadow DOM, hydrated on load. Pass **kebab-case attributes** only (a prop whose name matches an element property is set as a property and forces `defer-hydration`). A `client:only` island must not contain islands: its children end up in a `<template>` and nothing hydrates; the parent module registers the children instead.
- Plain tags + client script: `<c2-button>` in the template and `import '@c2n/button'` inside a `<script>`. Cheaper for repeated markup (no shadow-DOM copy per instance); guard the flash with `c2-button:not(:defined) { visibility: hidden }`.
- Scoped `<style>` does not reach elements rendered by child components; use `is:global` (or `:global()`) for variant classes.

## React 19

Custom elements work as JSX tags. React 19 passes primitive props as attributes and functions as event listeners for `on*` names; for custom events attach listeners with a `ref` (`ref.current.addEventListener('selection-change', …)`).

Types: `import '@c2n/<name>/react'` — one line per package, in any `.d.ts` — declares the tags in `JSX.IntrinsicElements` with props derived from the element class, plus each kebab-case attribute name (`row-key` next to `rowKey`). Do not hand-write the mapping. React 18 and older: pass attributes as strings and use refs for events and properties.

**Server-rendered React (Next.js, React Router SSR):** write a camelCase property by its kebab-case attribute name — `min-width`, `expand-full`, `storage-key`, not `minWidth`. The server writes a custom element's props into the HTML verbatim, the parser lowercases them (`minwidth`) and hydration does not set properties, so the camelCase spelling reaches the element as an attribute it does not declare. The component forwards that lookalike to the real attribute and logs a warning, so the value is not lost, but the kebab-case name is what the types list and what needs no forwarding. Object and array props (`rows`) stringify on the server: set them in an effect through a ref.

## Vue 3

Tell the compiler about the tags: `compilerOptions.isCustomElement = (tag) => tag.startsWith('c2-')` (in `@vitejs/plugin-vue`'s `template.compilerOptions`); without it every `c2-*` tag is treated as a Vue component and renders nothing. Register the elements at module scope before `mount()`: Vue chooses between a property and an attribute with `key in el`, so a binding on an element that has not upgraded yet falls back to an attribute.

Types: `import '@c2n/<name>/vue'` registers the tags with Volar, and `"extends": [..., "@c2n/framework-types/tsconfig.vue.json"]` supplies the matching `vueCompilerOptions` (`strictTemplates`, plus the `v-model` prop mapping so `v-model` binds `value`/`checked` rather than `modelValue`). Declare no local `vueCompilerOptions` next to it — a local one replaces the inherited object rather than merging.

- Events: `@selection-change`, `@submit-message` bind by their real kebab-case name — Vue calls `addEventListener` with the name as written. The handler gets a plain `Event`, so narrow it (`(event as CustomEvent<{ value: string[] }>).detail`).
- `v-model` works on `c2-text-field` / `c2-textarea`: on a custom element Vue compiles it to the plain-text model directive, which sets `el.value` and listens for `input`, and both components expose `value` and re-emit the native `input` event.
- `.prop` forces a DOM property (`:value.prop="selected"` for array/object values); `.attr` forces an attribute (`:align.attr="side"`), needed when a property is not reflected but the component styles it with `:host([attr])` — `c2-chat-message`'s `align` is the case to know.
- A static attribute stays an attribute, so spell it the way the component declares it (`row-key`, not `rowKey`).

## Angular

`CUSTOM_ELEMENTS_SCHEMA` on the component is the only required configuration. `[rows]="…"` writes a property with `setProperty`; `(selection-change)` binds the event by its real name. A **static** attribute stays an attribute, so a camelCase property needs `[rowKey]="'id'"` or the real attribute name (`row-key`) — the lowercase spelling `rowkey` is forwarded to `row-key` with a warning.

Forms: Angular's built-in value accessors match `input`/`select`/`textarea` only, so `ngModel` and `formControlName` do nothing on a c2 control without `@c2n/angular`. Add `imports: [FormsModule, ...C2_FORM_ACCESSORS]`.

The schema turns off template type checking, so `$event` is a bare `Event`: take the component's event-map type in the handler rather than `$any` at the call site.

## Svelte

Svelte binds attributes and `on:` events directly.

## Table cells

`renderCell` cannot return framework markup (it is handed to Lit). Mark the column `cell-slot` and render one light-DOM child per row into `slot="cell:<row key>:<field>"`; the children stay in the document, so ordinary CSS reaches them. Requires `row-key`; `renderCell`/the column format is the fallback.

## Editor support outside TypeScript

`@c2n/framework-types` ships `dist/html-custom-data.json` (point `html.customData` at it for VS Code / Volar) and `dist/web-types.json` (picked up automatically by the JetBrains IDEs). Both are generated from the custom-elements manifests, and cover plain HTML, Angular templates and Vue SFCs.

## Server-side rendering and static HTML

- Components must not touch `document`/`window` at module scope; the c2 components guard with `isServer`.
- Without SSR of the shadow DOM, hide unregistered tags until they upgrade: `c2-modal:not(:defined) { display: none }` (dialogs, lists) or `visibility: hidden` (layout-stable chrome).
- Server-rendered markup only carries attributes, so spell camelCase properties as their kebab-case attribute (`row-key`); see the React section for why the camelCase spelling is lost on the way.
- Theme CSS is plain CSS; load it in the document head so the first paint is themed.
- "Lit is in dev mode. Not recommended for production!" in a dev server (Next.js, Vite) is expected: Lit publishes a `development` export condition with extra checks and warnings, and dev servers resolve it. A production build resolves the default condition and the message is gone; nothing to configure.
