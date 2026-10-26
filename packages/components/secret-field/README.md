# Secret Field

`@c2n/components/secret-field` provides `c2-secret-field`, which shows an API key or other secret masked, with buttons to reveal it, copy it and ask for a new one.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/secret-field'
</script>

<c2-secret-field label="Secret key" value="acme_live_51HxQ…4242" reveal-start="10" regenerable>
  <span slot="help">Keep it on your server; never ship it to a browser.</span>
</c2-secret-field>
```

The mask keeps `reveal-start` leading and `reveal-end` (default 4) trailing characters. Copy always copies the whole value. `regenerable` adds a button that fires `regenerate`: confirm it, then set `value` (and `revealed` to show the new secret once). `hide-reveal` leaves only the copy button. The built-in labels are translatable through `addTranslations({ fr: { 'secret-field': { … } } })`.
