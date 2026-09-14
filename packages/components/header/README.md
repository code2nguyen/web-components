# Header

A site-shell header that arranges brand, navigation, actions and a mobile trigger without owning navigation state.

```bash
npm install @c2n/header
```

```html
<script type="module">
  import '@c2n/header'
</script>

<c2-header sticky blurred>
  <strong slot="brand">Northstar</strong>
  <a href="/markets">Markets</a>
  <button slot="actions">Sign in</button>
</c2-header>
```
