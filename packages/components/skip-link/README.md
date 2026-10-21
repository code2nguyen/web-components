# Skip Link

`@c2n/components/skip-link` provides `c2-skip-link`, a "Skip to main content" link that stays out of sight until a keyboard user tabs onto it, then moves focus into the main content.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/skip-link'
</script>

<body>
  <c2-skip-link href="#main"></c2-skip-link>
  <header>…</header>
  <main id="main">…</main>
</body>
```

Put it first in the page. Without `href` it targets the page's first `<main>`. The default text is translatable; slot your own text to replace it (`<c2-skip-link href="#results">Skip to results</c2-skip-link>`). Its look and position are set through the `--c2-skip-link--*` custom properties.
