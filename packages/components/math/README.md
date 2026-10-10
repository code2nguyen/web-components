# Math

`c2-math` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/math'
```

TeX formulas rendered as native MathML by [Temml](https://temml.org): the browser does the layout with the system math font and screen readers read it as math.

```html
<p>The area is <c2-math value="\pi r^2"></c2-math>.</p>

<c2-math display>
  <script type="math/tex">
    \int_0^\infty e^{-x^2}\,dx = \frac{\sqrt\pi}{2}
  </script>
</c2-math>
```

- `value`, or the element's text (a `<script type="math/tex">` child keeps the browser from parsing it); `display` renders a centred block.
- Safe for untrusted TeX: `\href`, `\url`, `\includegraphics`, `\style`, `\class` and `\htmlId` are rejected, expansion and sizes are capped, and the output is built as DOM nodes.
- A source that does not parse shows in the error style and fires `math-error` (`detail.message`, `detail.position`).
- `configureMath({ macros })` sets page-wide macros; the `macros` property adds per-element ones.
- Copying a whole formula puts its TeX on the clipboard as text and its MathML as HTML; `text` and `mathml` read them from script.
- On the server the TeX renders as code until the element upgrades.
