# Mermaid

`c2-mermaid` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/mermaid'
```

A [Mermaid](https://mermaid.js.org) diagram drawn from its text source in your theme colours. Mermaid loads with the first diagram on the page.

```html
<c2-mermaid>
  <script type="text/mermaid">
    sequenceDiagram
      Client->>API: POST /orders
      API-->>Client: 201 Created
  </script>
</c2-mermaid>
```

- `value`, or a `<script type="text/mermaid">` child (indentation stripped); `label` names the diagram for assistive technology (defaults to its `accTitle`).
- Colours come from `--c2-mermaid__node--*`, `__edge--color`, `__secondary--background`, `__tertiary--background` and `__note--background`, mapped onto `@c2n/theme`; the diagram re-renders when they change (theme switch included). `refresh()` re-renders by hand.
- Safe for untrusted sources: `securityLevel: 'strict'`, plain-text labels, `%%{init}%%` cannot override security or theme settings, and the SVG is stripped of scripts, embedded HTML, handlers, links and external `url()`/`href` before it is shown.
- Events: `mermaid-render` (`detail.type`) and `mermaid-error` (`detail.message`); `svgElement` returns the drawn SVG for export.
