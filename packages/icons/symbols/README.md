# Symbols

Spot illustrations as Lit web components, for empty states, status panels, onboarding and error pages: `<c2-symbol-empty-inbox>`, `<c2-symbol-no-results>`, `<c2-symbol-success>`, and more.

The artwork is drawn for this package (MIT, like the rest of the repository) on one 160×160 grid, and every colour in it comes from a small set of themeable roles, so a theme recolours the whole set at once and dark mode works through `@c2n/theme`.

## Installation

```bash
npm install @c2n/symbols
```

## Usage

Import only the symbols you use:

```typescript
import '@c2n/symbols/symbols/empty-inbox.js'
```

```html
<c2-symbol-empty-inbox></c2-symbol-empty-inbox>
```

Or register the whole set:

```typescript
import '@c2n/symbols'
```

A symbol is decorative by default (`aria-hidden`). Give it a `label` when it carries meaning that no nearby text repeats:

```html
<c2-symbol-offline label="You are offline"></c2-symbol-offline>
```

The symbol names, catalog (title, category, description), tag helper and `SymbolElement` base class are exported from the package root.

### In a status panel

```html
<c2-status-panel
  heading="No results"
  description="Try a different keyword or clear the filters."
  style="--c2-status-panel__media--size: 128px; --c2-status-panel__media-icon--size: 128px; --c2-status-panel__media--background-color: transparent"
>
  <c2-symbol-no-results slot="media"></c2-symbol-no-results>
</c2-status-panel>
```

## Theming

| Property                           | Default   | Role                                             |
| ---------------------------------- | --------- | ------------------------------------------------ |
| `--c2-symbol--size`                | `120px`   | Width and height                                 |
| `--c2-symbol--stroke-width`        | `3`       | Outline width on the 160×160 canvas              |
| `--c2-symbol__backdrop--color`     | `#f4f4f5` | Soft disc behind the artwork                     |
| `--c2-symbol__surface--color`      | `#ffffff` | Faces of objects, marks drawn on coloured shapes |
| `--c2-symbol__muted--color`        | `#e4e4e7` | Secondary fills, ground shadows                  |
| `--c2-symbol__line--color`         | `#a1a1aa` | Default outline                                  |
| `--c2-symbol__ink--color`          | `#71717a` | Small solid details                              |
| `--c2-symbol__primary--color`      | `#0265dc` | Accent                                           |
| `--c2-symbol__primary-soft--color` | `#edf1fe` | Soft accent fills                                |
| `--c2-symbol__success--color`      | `#16a34a` | Success badges                                   |
| `--c2-symbol__warning--color`      | `#f59e0b` | Warning badges, the light bulb, the rocket flame |
| `--c2-symbol__error--color`        | `#dc2626` | Error badges and strike-throughs                 |

Set `--c2-symbol__backdrop--color: transparent` to drop the disc.

## Adding or editing a symbol

The components under `src/symbols/` are generated and committed. The sources are `svg/<name>.svg` plus an entry in `svg/catalog.json`. A source must use the exact wrapper `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">` and take every colour from a class: a fill role (`backdrop`, `surface`, `muted`, `ink`, `primary`, `primary-soft`, `success`, `warning`, `error`), the default outline `line`, or a coloured stroke `line-<role>`. The generator rejects `fill`, `stroke`, `style` and any other class. Then run:

```bash
npm run generate -w packages/icons/symbols
npm run build -w packages/icons/symbols
```
