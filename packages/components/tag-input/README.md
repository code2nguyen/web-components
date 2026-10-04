# @c2n/tag-input

`c2-tag-input` turns typed or pasted text into removable tags: recipients, keywords, labels.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/tag-input'
</script>

<c2-tag-input name="to" aria-label="Recipients" placeholder="Add recipients" delimiters=",; " pattern="[^\s@]+@[^\s@]+\.[^\s@]+"></c2-tag-input>
```

- `delimiters` — every character commits the pending text (default `,`); Enter always commits. `split-pattern` takes a regular expression instead. Pasted text is also split on line breaks and tabs.
- `parseTag` (property) normalizes each token; `pattern` / `validator` (property) validate it; `reject-invalid`, `allow-duplicates`, `max`, `add-on-blur` tune what is accepted.
- `value` is a `string[]` (semicolon-separated in markup); in a form each tag is its own entry under `name`.
- Cancelable `tag-add` / `tag-remove` events, plus `input` / `change` whenever the tags change.

Docs: https://code2nguyen.github.io/web-components/components/tag-input
