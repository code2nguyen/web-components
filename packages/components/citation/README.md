# Citation

`c2-citation` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/citation'
```

```html
<p>
  Lit renders on the server<c2-citation
    index="1"
    href="https://lit.dev/docs/ssr/overview/"
    source-title="Server-side rendering – Lit"
    snippet="Lit's SSR renders components to static HTML."
  ></c2-citation
  >.
</p>
```

A numbered marker linking to its source, with a hover/focus preview card (site, title, snippet, address) drawn by
`c2-hover-card`. Only http(s) and relative addresses become links. Every look is a `--c2-citation__*` CSS variable.
