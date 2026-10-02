# Marker

Inline text marker that draws attention to a run of text the way a pen would: a highlighter stroke behind it, a line
under or through it, or a box or loose circle around it. Set `animated` to draw the mark the first time it scrolls into
view.

```bash
npm install @c2n/marker
```

```html
<script type="module">
  import '@c2n/marker'
</script>

<p>
  Deploys are <c2-marker>fully automated</c2-marker>, <c2-marker variant="underline" animated>reviewed</c2-marker> and
  <c2-marker variant="circle">reversible</c2-marker>. The old <c2-marker variant="strike-through">manual checklist</c2-marker> is gone.
</p>

<style>
  c2-marker[variant='circle'] {
    --c2-marker__stroke--color: #dc2626;
    --c2-marker__mark--transition-duration: 900ms;
  }
</style>
```

Variants: `highlight` (default), `underline`, `strike-through`, `box`, `circle`. The host is announced as a `mark`
(a `deletion` for `strike-through`). Colours, stroke width, padding and timing are CSS custom properties; see
`custom-elements.json` for the full list.
