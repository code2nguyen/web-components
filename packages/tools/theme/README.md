# @c2n/theme

Design tokens for the `@c2n/*` web components, plus a **generated base theme** that maps every component CSS variable onto them.

Components are themed through their own CSS custom properties (`--c2-button__container--background-color`, …, about 700 in total). `@c2n/theme` adds a convenience layer on top: ~35 shared tokens named `--c2-theme--<name>`. The base theme sets each component variable to `var(--c2-theme--<token>, <component default>)` at `:root`, so an application only has to define the tokens. Any component variable you set yourself still wins.

```bash
npm install @c2n/theme
```

```ts
import '@c2n/theme/theme.css' // tokens + base theme
```

```css
/* Your app: override a few tokens, every component follows. */
:root {
  --c2-theme--color-primary: #7c3aed;
  --c2-theme--radius-md: 10px;
  --c2-theme--font-family: 'Inter', system-ui, sans-serif;
}
```

## Files

| Export                   | Content                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `@c2n/theme/theme.css`   | `tokens.css` + `base.css`                                                                                                                   |
| `@c2n/theme/tokens.css`  | Token defaults: light on `:root`, dark under `[data-theme='dark']` / `.c2-dark` and as the `prefers-color-scheme: dark` fallback            |
| `@c2n/theme/base.css`    | `--c2-<component>…: var(--c2-theme--…, <default>)` for every mapped component variable. Use it alone if your app already defines the tokens |
| `@c2n/theme/tokens.js`   | The token table as TypeScript (`tokens`, `TokenDef`)                                                                                        |
| `@c2n/theme/tokens.json` | Tokens + the `component variable → token` mapping                                                                                           |
| `@c2n/theme/report.json` | Coverage per package and the list of variables left unmapped                                                                                |

## Dark mode

Set `data-theme="dark"` (or the `c2-dark` class) on `<html>` or on any subtree; without it the OS preference applies. `data-theme="light"` / `c2-light` opts a subtree out.

## Layers

1. **Tokens** — `--c2-theme--*`, set by the app.
2. **Base theme** — generated mapping, ships here.
3. **Component variables** — `--c2-<component>__<part>[__<state>]--<property>`, the fine-grained escape hatch.
4. **App variant components** — repeated looks wrapped in your own components (see the docs site guide).

## Development

`npm run build -w packages/tools/theme` compiles `src/tokens.ts` and runs `scripts/theme-generator`, which reads every `@c2n/*/custom-elements.json`, classifies each documented CSS variable (`scripts/theme-generator/classify.ts`, exceptions in `overrides.ts`) and writes `dist/`. The build depends on every component build so the manifests are fresh; the console prints a coverage table and `dist/report.json` lists what stayed unmapped and why.

`npm run dev -w packages/tools/theme` opens a Vite harness (`index.html`) with themed components, a dark-mode toggle and token overrides.
