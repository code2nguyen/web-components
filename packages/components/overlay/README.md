# @c2n/overlay

Anchored popup built on the browser Popover API and positioned with floating-ui, built with Lit.

```bash
npm install @c2n/overlay
```

```html
<script type="module">
  import '@c2n/overlay'
</script>

<button popovertarget="menu">Open</button>
<c2-overlay id="menu" placement="bottom-start">
  <div class="menu">…your surface…</div>
</c2-overlay>
```

- **Native behaviour**: the overlay is a `popover="auto"` element in the top layer: Escape and clicking outside close it, `toggle` / `beforetoggle` fire, and the `open` attribute mirrors the state (set it to open or close programmatically). Use `popover="manual"` to opt out of light dismiss.
- **Anchor**: the `anchor` property (an element) or attribute (an id), or the element whose `popovertarget` is the overlay's `id`.
- **Placement**: any floating-ui placement (`bottom-start`, `top`, `right-end`, …). It flips and shifts to stay on screen; the placement in use is reflected as `current-placement`, and `--c2-overlay--available-height` / `--available-width` tell the content how much room there is on that side.
- **Sizing**: at least as wide as the anchor by default; `fit-anchor` matches the width exactly, `free-width` sizes by content.
- **Spacing and motion**: `--c2-overlay--offset-y`, `--offset-x`, `--viewport-padding` and `--transition-duration`; `__backdrop--background` tints the page behind it.

The overlay is a positioning shell: the slotted content owns its own background, border and shadow.
