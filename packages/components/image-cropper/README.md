# @c2n/image-cropper

Image cropper built with Lit: a selection over an image that the reader moves and resizes, read back as a canvas or a blob.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/image-cropper'
</script>

<c2-image-cropper src="/photo.jpg" alt="Profile photo" aspect-ratio="1" shape="ellipse"></c2-image-cropper>

<script type="module">
  const cropper = document.querySelector('c2-image-cropper')
  cropper.addEventListener('crop-change', (event) => console.log(event.detail.crop))
  const avatar = await cropper.toBlob('image/webp', 0.9, { width: 256 })
</script>
```

- **Selection**: `crop` is `{ x, y, width, height }` in the image's natural pixels (JSON in markup). Left unset, the cropper selects the centred 80% of the image once it loads; `reset()` does that again. A `crop` off `aspect-ratio` is refitted around its centre.
- **Proportions**: `aspect-ratio` locks them (`1`, `16/9`, `4:3`, `1.5`); changing it refits the selection around its centre. `shape="ellipse"` rounds the selection and clips the output to it.
- **Input**: drag the selection to move it, a handle to resize it, or the image outside it to draw a new one; Escape (or a cancelled pointer) undoes a drag. The selection is one tab stop: Arrow keys move it (Shift for 10×), Alt + Arrow keys move its right or bottom edge, `+`/`-` scale it, and the result is announced. `disabled` locks it.
- **Output**: `toCanvas({ width?, height? })` and `toBlob(type?, quality?, { width?, height? })` draw the selection at its natural size or the size you give. A cross-origin image needs `crossorigin="anonymous"` and CORS headers, or the canvas cannot be read.
- **Events**: `crop-input` on every step of a drag, `crop-change` when the reader lets go or presses a key; neither bubbles, and neither fires for changes made by script. `load` and `error` are re-dispatched from the image.
- **Empty state**: the `placeholder` slot shows while there is no `src`.

Theme it with the `__frame`, `__image`, `__overlay`, `__selection`, `__guides` and `__handle` variables (`--c2-image-cropper__overlay--color`, `--c2-image-cropper__handle--size`, …). The full list is in `custom-elements.json` and on the docs site.
