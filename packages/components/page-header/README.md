# Page Header

`c2-page-header` is the top of a page: a breadcrumb (or a parent link on narrow widths), your heading with status badges, a description, metadata, page actions that fold into a "More actions" menu, tabs and a toolbar. With `sticky` a condensed bar keeps the title and the primary action in view. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/page-header'
```

```html
<c2-page-header sticky>
  <c2-breadcrumb slot="breadcrumb">…</c2-breadcrumb>
  <h1>October supplier run</h1>
  <c2-badge slot="title-suffix" tone="warning">Awaiting approval</c2-badge>
  <p slot="description">12 payouts to EU suppliers.</p>
  <c2-button slot="actions" overflow-priority="1">Export</c2-button>
  <c2-button slot="actions" primary>Approve batch</c2-button>
  <nav slot="navigation" aria-label="Batch">…</nav>
</c2-page-header>
```

```js
pageHeader.addEventListener('condensed-change', (event) => event.detail) // { condensed }
pageHeader.addEventListener('overflow-change', (event) => event.detail) // { folded }
```
