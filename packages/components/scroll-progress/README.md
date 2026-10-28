# Scroll Progress

`c2-scroll-progress` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/scroll-progress'
```

```html
<c2-scroll-progress style="position: fixed; inset: 0 0 auto"></c2-scroll-progress>
```

How far the reader got: a bar that fills or a ring that closes as the page or a container scrolls.

- Follows the page, or the container named by `for` (a `c2-scroll-area` works).
- `variant="bar"` or `"ring"` (with a slotted centre); it does not place itself.
- A progress bar for assistive technology, updated in whole percents.
- Themed through `--c2-scroll-progress*` custom properties; see the API page of the docs site.
