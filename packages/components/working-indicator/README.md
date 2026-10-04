# @c2n/working-indicator

Working indicator built with Lit: a live "work in progress" line, like an agent's "✻ Scheming… 12s".

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/working-indicator'
</script>

<c2-working-indicator></c2-working-indicator>
<c2-working-indicator messages='["Scheming","Pondering","Brewing"]' elapsed><span slot="meta">esc to interrupt</span></c2-working-indicator>
<c2-working-indicator indicator="dots" effect="wave" label="Generating"></c2-working-indicator>
<c2-working-indicator effect="fill" label="Uploading" value="62"></c2-working-indicator>
<c2-working-indicator state="done" done-label="Schemed for 14s"></c2-working-indicator>
```

- **Indicator**: `glyph` (cycling ✢✳✶✻✽), `dots`, `ring`, `pulse`, `orbit` or `none`; or your own mark in the `indicator` slot.
- **Effect**: the label `shimmer`s, `wave`s letter by letter, `pulse`s or `fill`s; with a `value` (out of `max`) the fill is determinate and the element is a `progressbar`.
- **Ellipsis**: trailing dots that `fade` in, `bounce`, stay `static` or are `none`.
- **Messages**: a JSON array of labels rotated every `--c2-working-indicator__label--rotate-duration`.
- **Elapsed**: `elapsed` shows a live counter (`started` sets the start time), followed by the `meta` slot.
- **State**: `running`, `paused`, `done` or `error`; finishing stops the animations, shows a check or a cross and `done-label`.
- **Accessibility**: a polite `status` that announces the label and the outcome, never the rotating messages or the counter. Reduced motion stops every animation.

Every colour, size and duration is a `--c2-working-indicator…` variable. The full list is in `custom-elements.json` and on the docs site.
