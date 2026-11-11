# Camera Capture

`c2-camera-capture` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/camera-capture'
```

```html
<c2-camera-capture guide="card" crop></c2-camera-capture>
```

A camera viewfinder for taking a photo of a document, a card or a face: a framing guide (`guide`), quality hints (too
dark, glare, moving, blurry), auto-capture once the picture holds steady (`auto-capture`, `steady-time`), retake or
keep, a front/back switch, and a list of required shots (`shots`). Each photo reaches the app as a `Blob`, in the
`capture`, `accept` and `complete` events and in `photos`.

The camera opens when the user presses **Start camera** or the app calls `start()`, and closes when the photos are
taken, on `stop()`, or when the element leaves the page. `streamSource` replaces `getUserMedia` (a chosen device, a
WebRTC stream, or a canvas `captureStream()` in a demo or a test); `assessFrame` replaces the quality rules.

Slots: `idle`, `error`, `guide`, `actions`, `done`. Every look is a `--c2-camera-capture…` CSS variable; the full list
is in `custom-elements.json` and on the docs site.
