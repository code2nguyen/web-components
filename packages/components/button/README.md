# @c2n/button

`c2-button` is a themeable button with slots for the label text, a prefix icon, a suffix icon and a running (busy) icon.

```bash
npm install @c2n/button
```

```html
<script type="module">
  import '@c2n/button'
</script>

<c2-button>
  <svg slot="prefix-icon" viewBox="0 0 24 24" ...></svg>
  Save
</c2-button>

<c2-button running>Saving…</c2-button>
<c2-button disabled>Disabled</c2-button>
```

Every visual aspect is controlled through `--c2-button__*` CSS custom properties; see the generated `custom-elements.json` or the demo site for the full list.
