# Celebration

`c2-celebration` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/celebration'
```

```html
<c2-celebration trigger="click"><c2-button>Publish</c2-button></c2-celebration>
```

Confetti, a burst of sparks or rising emoji for a moment worth marking.

- `fire()` plays from the element's centre or from `{ x, y }`; `trigger="click"` plays from the click.
- `kind` is `confetti`, `burst` or `emoji` (the `emoji` list; repeated calls stream reactions).
- Draws in the top layer, so nothing clips it; the pointer goes through; nothing under reduced motion.
- Colours, count, spread and duration are `--c2-celebration*` custom properties; see the API page of the docs site.
