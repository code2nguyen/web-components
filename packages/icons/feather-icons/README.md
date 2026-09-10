# Feather Icons

Every [Feather](https://feathericons.com/) icon as a Lit web component: `<c2-feather-arrow-right>`, `<c2-feather-camera>`, …

## Installation

```bash
npm install @c2n/feather-icons
```

## Usage

Import only the icons you use (recommended):

```typescript
import '@c2n/feather-icons/icons/arrow-right.js'
```

```html
<c2-feather-arrow-right></c2-feather-arrow-right>
```

Or register the whole set at once:

```typescript
import '@c2n/feather-icons'
```

The icon names (`featherIconNames`, `FeatherIconName`) and the `FeatherIcon` base class are exported from the package root.

## Theming

All icons share the same CSS custom properties:

| Property                          | Default        |
| --------------------------------- | -------------- |
| `--c2-feather-icon--size`         | `24px`         |
| `--c2-feather-icon--color`        | `currentColor` |
| `--c2-feather-icon--stroke-width` | `2`            |

## Regenerating

The components under `src/icons/` are generated from the `feather-icons` npm package and committed. After bumping `feather-icons` run:

```bash
npm run generate -w packages/icons/feather-icons
npm run build -w packages/icons/feather-icons
```
