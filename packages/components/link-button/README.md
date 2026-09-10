# Link Button

`c2-link-button` is a text-styled control for link and navigation actions.

- With `href` it renders a real `<a>` (with `target`, `rel` and `download` passthrough), so middle-click, open in new tab and screen readers behave natively.
- Without `href` it renders a `<button type="button">` and fires a normal `click` event.
- `prefix-icon` and `suffix-icon` slots hold an inline SVG, a `c2-feather-*` element or a `c2-mat-icon`.
- `external` opens the destination in a new tab (`target="_blank"`, `rel="noopener noreferrer"`). Add an icon through the `suffix-icon` slot when you want one.
- `selected` marks the current or active item (`aria-current="page"` on links); `disabled` dims it and blocks clicks.

```html
<script type="module">
  import '@c2n/link-button'
</script>

<c2-link-button href="/docs">Documentation</c2-link-button>
<c2-link-button href="https://github.com" external>GitHub</c2-link-button>
<c2-link-button selected>Overview</c2-link-button>
```

## Theming

Every visual aspect is controlled through `--c2-link-button__*` CSS custom properties; see the generated `custom-elements.json` or the docs site for the full list.
