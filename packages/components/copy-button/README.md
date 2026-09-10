# @c2n/copy-button

Copy button built with Lit: puts text on the clipboard — the element it sits in, another element by `id`, or a literal string.

```bash
npm install @c2n/copy-button
```

```html
<script type="module">
  import '@c2n/copy-button'
</script>

<!-- Copies its parent, pinned in the corner, revealed on hover. -->
<pre style="position: relative">npx -y @c2n/mcp<c2-copy-button pin></c2-copy-button></pre>

<!-- Copies another element by id. -->
<p id="address">548 Market St, San Francisco, CA 94104</p>
<c2-copy-button for="address" reveal="always">Copy address</c2-copy-button>

<!-- Copies an exact string. -->
<c2-copy-button value="c2n_live_8f4c19ab7e2d" reveal="always">Copy token</c2-copy-button>
```

- **Source**: `value` (a literal string) wins, then `for` (the `id` of the source element, looked up in the containing document or shadow root), then the light-DOM parent. `parentElement` is deliberate: a button slotted into another custom element copies the element it was authored inside, not the shadow-DOM node it renders in.
- **Reading a source**: each source is read the way it stores its text — the `source` of a `c2-code-viewer` (the real code, not the highlighted token spans), the `value` of an `<input>`, `<textarea>` or `<select>`, and the rendered text of anything else. Any `c2-copy-button` inside the source is skipped, so a button sitting in the block it copies never copies its own label. Inner whitespace is preserved (newlines in a `<pre>` survive); only the leading and trailing whitespace is trimmed.
- **Reveal**: `reveal="hover"` is the default — the button is transparent until the pointer enters its source, so a corner button does not sit on top of the content it copies. Only the opacity changes, so it keeps its box and stays reachable: it also appears when focus lands anywhere inside the source, on devices with no hover at all (where a hover-only button would be unreachable), and for as long as the `copied` confirmation shows. While hidden it takes no pointer events, so there is never an invisible click target. `reveal="always"` shows it permanently.
- **Pin**: `pin` absolutely positions the button in a corner of its containing block — the bare attribute means top right, or name one of `top-right`, `top-left`, `bottom-right`, `bottom-left` — inset by `--c2-copy-button__pin--offset-x` / `-y`. Give the element it sits in `position: relative`, as with any absolutely positioned child. A pinned button also **stays put while its source scrolls**: an absolutely positioned child of a scrolling box lives in that box's scrollable overflow and would otherwise scroll away with the content, exactly when it is needed, since long or wide text is why there is a scrollbar at all. It finds the nearest ancestor that can scroll and cancels out its scroll offset, in both directions. The lookup is keyed on the overflow style rather than on whether the box currently overflows, so content that grows later (a webfont finishing) cannot leave the button attached to nothing.
- **Feedback**: after a successful copy the icon becomes a check and the `copied` attribute is set for `copied-duration` ms (default `2000`), then cleared. `copied` is reflected, so `c2-copy-button[copied]` is styleable from outside, and the `__container__copied--*` variables cover it from within.
- **Events**: `copied` carries `detail.text`; `copy-error` carries `detail.error` when the clipboard write is refused, so a failure is never silent. The async `copy()` method returns `false` in that case.
- **Slots**: the default slot is an optional label beside the icon — leave it empty for an icon-only, square button. `copy-icon` and `copied-icon` replace the two glyphs; `copied-label` replaces the text while the copied state shows.
- **Accessibility**: renders a real `<button>` with focus delegated to it. The accessible name comes from `label` / `copied-label` (default "Copy" / "Copied"), and the state change is announced through a visually hidden `role="status"` region, because an icon swap alone is not read out.
- **Fallback**: where `navigator.clipboard` is unavailable — any non-secure context, which includes a plain-http dev server — it falls back to an off-screen `<textarea>` and `document.execCommand('copy')` rather than doing nothing.

Everything is themed through CSS custom properties: `__container--*` for the button box (size, padding, radius, border, colours, typography) with `__hover`, `__active`, `__focus`, `__disabled` and `__copied` states, `__icon--*` for the glyph, `__pin--offset-x` / `-y` for the pinned inset and `--c2-copy-button--transition-duration` for the reveal fade. The full list is in `custom-elements.json` and on the docs site.
