# Using c2n components per framework

All components are standard custom elements (Lit 3). Register with a side-effect import; then they are plain HTML.

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

Custom elements work as JSX tags. React 19 passes primitive props as attributes and functions as event listeners for `on*` names; for custom events attach listeners with a `ref` (`ref.current.addEventListener('selection-change', …)`). Declare the tags in `JSX.IntrinsicElements` for TypeScript. React 18 and older: pass attributes as strings and use refs for events and properties.

## Vue 3

Tell the compiler about the tags: `compilerOptions.isCustomElement = (tag) => tag.startsWith('c2-')` (in `@vitejs/plugin-vue`'s `template.compilerOptions`); without it every `c2-*` tag is treated as a Vue component and renders nothing. Register the elements at module scope before `mount()`: Vue chooses between a property and an attribute with `key in el`, so a binding on an element that has not upgraded yet falls back to an attribute.

- Events: `@selection-change`, `@submit-message` bind by their real kebab-case name — Vue calls `addEventListener` with the name as written. The handler gets a plain `Event`, so narrow it (`(event as CustomEvent<{ value: string[] }>).detail`).
- `v-model` works on `c2-text-field` / `c2-textarea`: on a custom element Vue compiles it to the plain-text model directive, which sets `el.value` and listens for `input`, and both components expose `value` and re-emit the native `input` event.
- `.prop` forces a DOM property (`:value.prop="selected"` for array/object values); `.attr` forces an attribute (`:align.attr="side"`), needed when a property is not reflected but the component styles it with `:host([attr])` — `c2-chat-message`'s `align` is the case to know.
- A static attribute stays an attribute, so spell it the way the component declares it (`row-key`, not `rowKey`).

## Svelte / Angular

Svelte binds attributes and `on:` events directly. Angular needs `CUSTOM_ELEMENTS_SCHEMA` and `[attr.x]` / `(event)` bindings.

## Server-side rendering and static HTML

- Components must not touch `document`/`window` at module scope; the c2 components guard with `isServer`.
- Without SSR of the shadow DOM, hide unregistered tags until they upgrade: `c2-modal:not(:defined) { display: none }` (dialogs, lists) or `visibility: hidden` (layout-stable chrome).
- Theme CSS is plain CSS; load it in the document head so the first paint is themed.
