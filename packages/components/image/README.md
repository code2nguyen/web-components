# Image

`c2-image` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/image'
```

An image with a loading placeholder (shimmer or blurred `placeholder-src`), a fade to the loaded image, a fallback with the alternative text on error, an optional full-screen `preview`, and `loading="click"`, which makes no request until the reader activates the placeholder.

```html
<c2-image src="/team.jpg" alt="The team at the offsite" width="1200" height="800" preview></c2-image>

<!-- an image URL you did not choose, e.g. in an LLM answer -->
<c2-image loading="click" src="https://example.com/chart.png" alt="Revenue chart"></c2-image>
```

- `loading`: `lazy` (default), `eager` or `click`. Activating a click-to-load placeholder fires a cancelable `load-request` (`detail.src`); cancel it, or rewrite `src` to a proxy inside the handler. `load()` requests the image from script.
- `width` / `height` reserve the box and ratio before the image arrives; `srcset`, `sizes`, `referrerpolicy` and `crossorigin` pass through.
- `load` and `error` are re-dispatched from the inner image; `preview-open` is cancelable, so an app can open its own viewer.
- Slots `placeholder`, `fallback` and `load-label` replace the default surfaces; the box and every surface are styled through `--c2-image…` variables.
