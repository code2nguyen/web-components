# Theming c2n components

## Layers

1. **Tokens** `--c2-theme--<name>` (from `@c2n/theme/tokens.css`, ~35 of them). Set by the application.
2. **Base theme** `@c2n/theme/base.css`: `--c2-<component>__<part>--<prop>: var(--c2-theme--<token>, <component default>)` on `:root`/`:host` for every mapped component variable. Generated from the component manifests.
3. **Component variables** `--c2-<component>__<part>[__<state>]--<property>`: the fine-grained escape hatch. Set on an element, a class or any ancestor; they always win over the base theme.
4. **Variant components** built from 2 and 3.

## Install

```ts
import '@c2n/theme/theme.css' // tokens + base theme, once
```

```css
:root {
  --c2-theme--color-primary: #7c3aed;
  --c2-theme--color-primary-hover: #6d28d9;
  --c2-theme--radius-md: 10px;
  --c2-theme--font-family: 'Inter', system-ui, sans-serif;
}
```

## Bring your own tokens

```css
@import '@c2n/theme/base.css';
:root {
  --c2-theme--color-primary: var(--brand-600);
  --c2-theme--color-on-primary: var(--brand-on-600);
  --c2-theme--color-surface: var(--surface);
  --c2-theme--color-on-surface: var(--text);
  --c2-theme--color-outline: var(--border);
  --c2-theme--radius-md: var(--radius);
  --c2-theme--font-family: var(--font-sans);
  --c2-theme--focus-ring: 2px solid var(--brand-600);
}
```

Dark mode then follows the app's own switch because the bridged values flip.

## Dark mode with the shipped tokens

`tokens.css` sets light values on `:root` and dark values under `[data-theme='dark']` and `.c2-dark`, with `prefers-color-scheme: dark` as the fallback when no `data-theme` attribute is present. `data-theme="light"` / `.c2-light` opts a subtree out. Selectors are not tied to the root element, so any subtree can be inverted.

## Token groups

- Colour roles: `color-primary`, `color-primary-hover`, `color-primary-active`, `color-on-primary`, `color-primary-container`, `color-surface`, `color-surface-container-low`, `color-surface-container`, `color-on-surface`, `color-on-surface-variant`, `color-outline`, `color-outline-variant`, `color-outline-strong`, `color-error`, `color-scrim`, `color-inverse-surface`, `color-on-inverse-surface`.
- Typography: `font-family` (unset by default: components inherit the page font), `font-size-sm|md`, `font-weight-medium|semibold`.
- Shape: `radius-sm|md|lg|xl|full`.
- Borders: `border-width`, `border` (composite: the whole resting border shorthand; falls back to `border-width solid color-outline`).
- Interaction: `focus-ring` (outline shorthand), `disabled-opacity`, `motion-scale` (multiplies every duration; `0` disables motion).
- Elevation: `shadow-md`, `shadow-lg`.

Composite tokens wrap their primitives: `var(--c2-theme--border, var(--c2-theme--border-width, 1px) solid var(--c2-theme--color-outline, #bcbcc6))`, so set the shorthand or just the colour.

## What the base theme does not cover

Sizes, paddings, gaps, identity colours (avatar fallbacks), status colours, the code viewer's syntax theme, and variables without a default (they inherit). Use component variables or a variant for those. `@c2n/theme/report.json` lists what is mapped per package; MCP `get_theme` with a `tag` shows the mapping of one component.

## Grammar and states

`--c2-<component>__<part>[__<state>]--<property>`: `__` separates component / part / state, `--` separates the CSS property. States: `hover`, `active`, `focus`, `selected`, `disabled`, `open`, `error`, `read-only`. Example: `--c2-checkbox__container__selected--background-color`.
