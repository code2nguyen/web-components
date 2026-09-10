# @c2n/spinner

Spinner built with Lit: a circular progress ring, indeterminate by default or showing a value, with optional text.

```bash
npm install @c2n/spinner
```

```html
<script type="module">
  import '@c2n/spinner'
</script>

<c2-spinner></c2-spinner>
<c2-spinner>Loading…</c2-spinner>
<c2-spinner value="65"></c2-spinner>
<c2-spinner value="3" max="4">3 of 4 steps</c2-spinner>
```

- **Indeterminate**: the arc grows, shrinks and spins; `--c2-spinner--animation-duration` sets one cycle.
- **Determinate**: `value` (out of `max`, default 100) fills the ring clockwise from the top and animates between values; clear it to spin again.
- **Text**: slotted text sits beside the ring (`--c2-spinner--flex-direction: column` for below) and is the accessible name; without text, `label` (default "Loading") names it. The element is `role="progressbar"` with `aria-valuenow` when determinate.
- **Reduced motion**: a slow steady rotation of a fixed arc replaces the pulsing.

Theme it with `--c2-spinner--size`, `--c2-spinner--stroke-width` (in the ring's 48-unit box, so it scales with the size), `--c2-spinner--stroke-linecap`, `--c2-spinner--color`, `--c2-spinner__track--color` (`transparent` for an arc alone) and the `--c2-spinner__label--*` text variables. The full list is in `custom-elements.json` and on the docs site.
