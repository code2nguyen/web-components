# Image Annotator

`c2-image-annotator` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/image-annotator'
```

```html
<c2-image-annotator src="/screenshot.png"></c2-image-annotator>
```

Arrows, boxes, text, numbered steps, blur and redaction over an image.

- Shapes are plain objects in image pixels (`shapes`); `annotation-change` gives them after every edit.
- Select, move, resize, delete, undo and redo; every tool works from the keyboard.
- `toBlob()` / `toDataURL()` export the image at full size; redaction and blur are flattened into the pixels.
- `readonly` shows the shapes without the toolbar.
- Colours and the toolbar look are `--c2-image-annotator*` custom properties; see the API page of the docs site.
