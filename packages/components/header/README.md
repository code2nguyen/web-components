# Header

A site-shell header that arranges brand, navigation, actions and a mobile trigger without owning navigation state.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/header'
</script>

<c2-header sticky blurred>
  <strong slot="brand">Northstar</strong>
  <a href="/markets">Markets</a>
  <button slot="actions">Sign in</button>
</c2-header>
```

A `sticky` header matches `:state(stuck)` and fires `stuck-change` once page content scrolls beneath it (style it with `--c2-header__stuck--box-shadow`). Add `hide-on-scroll` to slide it away while the reader scrolls down and bring it back on the way up; `:state(retracted)` and `retract-change` report that. For anything other than a header, use `c2-sticky`.
