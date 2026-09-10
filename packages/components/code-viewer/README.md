# @c2n/code-viewer

Syntax-highlighted code blocks powered by [shiki](https://shiki.style), built with Lit.

```bash
npm install @c2n/code-viewer
```

```html
<script type="module">
  import '@c2n/code-viewer'
</script>

<c2-code-viewer language="ts" line-numbers highlight-lines="2" copyable>
  <span slot="title">greet.ts</span>
  export function greet(name: string) { return `Hello, ${name}!` }
</c2-code-viewer>
```

- **Source**: the default slot, with text in a `<pre>` (formatters collapse whitespace inside custom elements but leave `<pre>` alone) or markup in a `<template>` (so the browser does not parse it); indentation is stripped. Or the `code` property / attribute, where `\n` stands for a newline.
- **Languages and themes**: `language` takes any shiki id or alias; `theme` any built-in theme name or `css-variables`. Grammars and themes load on demand into one shared highlighter using shiki's JavaScript engine, no WASM.
- **Dark mode**: add `dark-theme` and both palettes are rendered; `color-scheme="auto|light|dark"` picks one (auto follows `prefers-color-scheme`).
- **Extras**: `line-numbers` (+ `start-line`), `highlight-lines="2-4,7"`, `copyable` (fires `code-copy`), `wrap`, `inline`, a `title` slot for a file name header, and `--c2-code-viewer--max-height` for scrolling.
- **Progressive**: the plain code renders immediately (server-side too) and is upgraded in place once highlighted.

Theming: `--c2-code-viewer--*` for the frame (font, padding, borders, radius, max-height; `background` and `color` override the theme), `__header`, `__copy`, `__line-numbers` and `__line__highlighted` for the parts, and `__theme--*` for the colours of the `css-variables` theme. The full list is in `custom-elements.json` and on the docs site.
