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

## Vue

Tell the compiler about the tags: `compilerOptions.isCustomElement = (tag) => tag.startsWith('c2-')`. Bind attributes normally, listen with `@selection-change`. Use `.prop` modifier for array/object properties (`:value.prop="selected"`).

## Svelte / Angular

Svelte binds attributes and `on:` events directly. Angular needs `CUSTOM_ELEMENTS_SCHEMA` and `[attr.x]` / `(event)` bindings.

## Server-side rendering and static HTML

- Components must not touch `document`/`window` at module scope; the c2 components guard with `isServer`.
- Without SSR of the shadow DOM, hide unregistered tags until they upgrade: `c2-modal:not(:defined) { display: none }` (dialogs, lists) or `visibility: hidden` (layout-stable chrome).
- Theme CSS is plain CSS; load it in the document head so the first paint is themed.
