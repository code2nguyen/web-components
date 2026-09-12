# Phosphor Icons

Every [Phosphor](https://phosphoricons.com/) icon as a Lit web component: `<c2-phosphor-heart>`, `<c2-phosphor-camera>`, and more. Generated from `@phosphor-icons/core@2.1.1`.

## Installation

```bash
npm install @c2n/phosphor-icons
```

## Usage

Import only the icons you use:

```typescript
import '@c2n/phosphor-icons/icons/heart.js'
```

```html
<c2-phosphor-heart weight="fill"></c2-phosphor-heart>
```

Or register the whole set:

```typescript
import '@c2n/phosphor-icons'
```

The `weight` attribute accepts `regular`, `thin`, `light`, `bold`, `fill`, or `duotone`. The icon names, source metadata, tag helper, weight type, and `PhosphorIcon` base class are exported from the package root.

## Theming

| Property                    | Default        |
| --------------------------- | -------------- |
| `--c2-phosphor-icon--size`  | `24px`         |
| `--c2-phosphor-icon--color` | `currentColor` |

## Regenerating

The components under `src/icons/` are generated and committed. After updating `@phosphor-icons/core`, run:

```bash
npm run generate -w packages/icons/phosphor-icons
npm run build -w packages/icons/phosphor-icons
```
