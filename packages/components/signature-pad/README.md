# Signature Pad

`c2-signature-pad` is a box to sign in with a mouse, a pen or a finger. Strokes are kept as points and drawn as smooth SVG paths. The pad has Undo and Clear buttons, `undo()` and `clear()` methods, and exports with `toSVG()`, `toDataURL(type?)` and `toBlob(type?)`. It is a form control: under a `name`, the form receives the signature as SVG markup. It also supports `required` and `readonly`, and takes part in `c2-form-field`.

It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/signature-pad'
```

```html
<c2-signature-pad name="signature" label="Your signature" required></c2-signature-pad>
```

- Attributes: `strokes` (JSON, `[[[x, y], …], …]` in CSS pixels), `name`, `required`, `readonly`, `disabled`, `label`, `placeholder`.
- Events: `input` and `change` after each stroke, Undo and Clear.
- Styling: `--c2-signature-pad--width`, `--c2-signature-pad--height`, `--c2-signature-pad__export__stroke--color` (the ink of exports, dark in every theme), `--c2-signature-pad__stroke--color` and `--c2-signature-pad__stroke--width`, and the surface, baseline and button variables listed on the API tab.

A signature cannot be drawn from the keyboard, so a form that asks for one should accept a typed name as well.
