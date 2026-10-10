# Feature: `c2-mermaid` — Mermaid diagrams, themed and sandboxed

**Status**: Design (not started)
**Roadmap**: new row proposed with this spec (section B). No earlier roadmap item covers it. `c2-flow` is an interactive graph built from data. This component renders text diagrams.
**Related**: [007-markdown](../007-markdown/spec.md) renders closed ` ```mermaid ` fences through `c2-mermaid`.

## Problem

LLMs and READMEs write diagrams as [Mermaid](https://mermaid.js.org) text: flowcharts, sequence, class, state, ER, gantt and pie diagrams. Rendering one takes four things:

- loading a very large library (mermaid 12.1.0, MIT) without paying for it upfront;
- matching the app's theme, including dark mode;
- treating the source as untrusted;
- never rendering a diagram that is still streaming.

## Goals

1. **Lazy.** `mermaid` is imported on the first render, and Mermaid itself code-splits its diagram types.
2. **Themed from tokens.** Mermaid's `base` theme gets `themeVariables` read from `--c2-mermaid…` variables, which map onto `@c2n/theme`. Diagrams follow light and dark mode.
3. **Safe.**
   - `securityLevel: 'strict'`: labels are sanitised by Mermaid's bundled DOMPurify, and `click` callbacks and links are disabled.
   - `htmlLabels: false`, so there is no `<foreignObject>`.
   - The SVG string Mermaid returns is parsed with `DOMParser('image/svg+xml')`. `<script>`, `<foreignObject>`, `on*` attributes and `href`s that are not fragments are stripped before the nodes are adopted into the shadow root. The string never goes through `innerHTML`.
4. **Errors are not crashes.** A parse error shows the source as code plus the message, and fires `mermaid-error`.

## Usage

```html
<c2-mermaid>
  <script type="text/mermaid">
    sequenceDiagram
      Client->>API: POST /orders
      API-->>Client: 201 Created
  </script>
</c2-mermaid>
```

## Public API

| Property | Attribute | Type                  | Default | Purpose                                                                                                                                |
| -------- | --------- | --------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `value`  | `value`   | `string \| undefined` | —       | Mermaid source. When unset, the slotted `<script type="text/mermaid">` is read. Indentation is stripped.                               |
| `label`  | `label`   | `string`              | —       | Accessible name. Defaults to the diagram's `accTitle` if the source sets one, otherwise "Diagram". `accDescr` becomes the description. |

Methods:

- `refresh()` re-renders, for example after the app switches theme in a way the element cannot observe.
- The `svg` getter returns the rendered SVG element, for export or download.

Events:

| Event            | Detail                               | Notes                                                                                   |
| ---------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| `mermaid-render` | `{ type: string }`                   | Fires after each successful render, with the diagram type (`flowchart`, `sequence`, …). |
| `mermaid-error`  | `{ message: string, line?: number }` | The source failed to parse or render.                                                   |

Parts: `diagram`, `error`, `source`.

## Rendering pipeline

1. The source changes, so the element schedules a render (debounced to one frame).
2. `const { default: mermaid } = await import('mermaid')` runs once per page.
3. Renders go through a **page-wide queue**. `mermaid.initialize` is global, so two elements with different themes must not interleave. Each queued job initialises with its own `themeVariables` and then calls `mermaid.render(uniqueId, source)`.
4. The SVG is parsed and stripped, then the element's previous diagram is swapped for it in one step, so nothing flickers on re-render.
5. **Theme changes.** The element re-reads its variables and re-renders when their resolved colours change, whatever caused the change: the OS scheme, a `data-theme` switch, or an app overriding a token. It keeps a hidden probe element with `color: var(--c2-mermaid__node--color)`, `background-color: var(--c2-mermaid__node--background)`, `border-color: var(--c2-mermaid__edge--color)` and `transition: all 1ms`. Its `transitionend` fires exactly when one of those values changes. `refresh()` is the manual fallback. The same probe also resolves `light-dark()` and `var()` chains into the concrete colours Mermaid requires, read with `getComputedStyle`.

Sizing: the SVG gets `max-width: 100%` and keeps its intrinsic aspect ratio. A diagram wider than its container scrolls horizontally, and the scroller is focusable only when it overflows.

SSR: the server renders the source as code in the `source` part. Mermaid needs a DOM, so the diagram appears on the client.

## Theming

These map to Mermaid `themeVariables`:

| Variable                              | Default (light)         | Mermaid key          |
| ------------------------------------- | ----------------------- | -------------------- |
| `--c2-mermaid--font-family`           | inherit                 | `fontFamily`         |
| `--c2-mermaid--font-size`             | `14px`                  | `fontSize`           |
| `--c2-mermaid__node--background`      | primary container token | `primaryColor`       |
| `--c2-mermaid__node--color`           | on-surface token        | `primaryTextColor`   |
| `--c2-mermaid__node--border-color`    | primary token           | `primaryBorderColor` |
| `--c2-mermaid__secondary--background` | surface variant token   | `secondaryColor`     |
| `--c2-mermaid__tertiary--background`  | surface token           | `tertiaryColor`      |
| `--c2-mermaid__edge--color`           | outline token           | `lineColor`          |
| `--c2-mermaid__note--background`      | warning container       | `noteBkgColor`       |
| `--c2-mermaid--background`            | transparent             | `background`         |

Plus layout variables that are not passed to Mermaid: `--c2-mermaid--padding`, `--c2-mermaid--border`, `--c2-mermaid--border-radius`, `--c2-mermaid__error--color`.

## Bundle

`mermaid` is a runtime dependency of `@c2n/mermaid`, loaded only by dynamic `import()`. The `c2-mermaid` entry itself stays small (a few kB). Mermaid falls in the umbrella's `lazy` budget. `c2-markdown` imports `@c2n/mermaid` lazily, on the first closed mermaid fence.

## Test plan

- A flowchart, a sequence and an ER source each render an `<svg>` with the expected node labels.
- A malicious source (`click A call alert(1)`, `click A href "javascript:…"`, a `<img onerror>` label, `%%{init: {"securityLevel":"loose"}}%%` trying to override the security level) gives no script, no `on*` attribute and no external `href`. The `init` directive cannot lower `securityLevel`: set `secure: ['securityLevel', 'htmlLabels', 'theme', 'themeVariables']` in the config.
- A parse error gives `mermaid-error` and shows the source and the message.
- Two elements with different `--c2-mermaid…` values render with their own colours (proves the queue).
- Switching the site to dark re-renders with the dark values.
- No request for the mermaid chunk on a page with no `c2-mermaid` element.
