# Barcode Scanner

`c2-barcode-scanner` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/barcode-scanner'
```

```html
<c2-barcode-scanner formats="ean_13;upc_a"></c2-barcode-scanner>
```

Reads barcodes and QR codes with the device's camera: it shows the camera with a scan window, reads the picture inside
the window and fires `scan` with the code's `value` and `format`. It stops at the first code, or keeps going with
`continuous` (`repeat-delay` decides when the same code counts again); `beep` sounds on a scan, and the light button
shows on a camera with a torch (`torch`). `formats` narrows what is read.

Codes are read by the browser's `BarcodeDetector` where it knows the formats asked for, else by `@zxing/library`, an
optional peer dependency imported on the first scan: install it for Firefox, Safari and Windows. `decoder` replaces
both, `streamSource` replaces `getUserMedia`, and `scanImage(blob)` reads a still picture.

The camera opens when the user presses **Start camera** or the app calls `start()`, and closes on a scan, on `stop()`,
or when the element leaves the page. It shares its camera core with `c2-camera-capture` (`@c2n/camera-capture/camera.js`).

Slots: `idle`, `error`, `window`, `done`, `actions`. Every look is a `--c2-barcode-scanner…` CSS variable; the full
list is in `custom-elements.json` and on the docs site.
