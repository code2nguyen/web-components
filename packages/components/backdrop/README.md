# Backdrop

`c2-backdrop` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/backdrop'
```

```html
<c2-backdrop pattern="grid"><h1>Components for every framework</h1></c2-backdrop>
```

A container that draws a decorative background behind its content.

- `pattern` is `dots`, `grid`, `stripes` (still) or `flicker`, `aurora`, `meteors` (moving).
- The pattern fades toward the edges, is hidden from assistive technology and never takes the pointer.
- Moving patterns pause off screen and stay still under reduced motion.
- Colours, spacing and the fade are `--c2-backdrop*` custom properties; see the API page of the docs site.
