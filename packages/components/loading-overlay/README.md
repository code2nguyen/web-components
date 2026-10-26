# Loading Overlay

`@c2n/components/loading-overlay` provides `c2-loading-overlay`, which covers a region while it loads: the content stays in place, dimmed and blocked, with a spinner and an announced label.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/loading-overlay'
</script>

<c2-loading-overlay loading>
  <section class="card">…</section>
  <span slot="label">Saving changes…</span>
</c2-loading-overlay>
```

While `loading`, the content is `inert`, the element is busy (`aria-busy`) and a polite live region announces the `label`, the `label` slot's text or the translatable "Loading". `--c2-loading-overlay--delay` keeps quick loads from flashing the overlay. Use `c2-skeleton` when there is no content to show yet.
