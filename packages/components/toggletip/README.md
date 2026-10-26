# Toggletip

`@c2n/components/toggletip` provides `c2-toggletip`, a small ⓘ button that opens a help bubble on click or tap. The bubble can hold links, works on touch, and is announced to screen readers when it opens.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/toggletip'
</script>

<label for="vat">VAT number</label>
<c2-toggletip label="About the VAT number">
  <p>Your EU VAT number, starting with the two-letter country code.</p>
  <a href="/help/vat">Where to find it</a>
</c2-toggletip>
<input id="vat" />
```

Escape, a press outside and focus leaving close it. `placement` picks the preferred side; the bubble flips when there is no room. Put words in the `icon` slot to replace the ⓘ (`<span slot="icon">What's this?</span>`). The default button name, "More information", is translatable through `addTranslations({ fr: { toggletip: { label: '…' } } })`.
