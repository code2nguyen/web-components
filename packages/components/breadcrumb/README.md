# @c2n/breadcrumb

Breadcrumb built with Lit: a navigation trail of `c2-link-button` items with separators, an automatic current page and optional collapsing.

```bash
npm install @c2n/breadcrumb
```

```html
<script type="module">
  import '@c2n/breadcrumb'
</script>

<c2-breadcrumb>
  <c2-link-button href="/">Home</c2-link-button>
  <c2-link-button href="/library">Library</c2-link-button>
  <c2-link-button href="/library/data">Data</c2-link-button>
</c2-breadcrumb>

<c2-breadcrumb max-items="3">
  <span slot="separator">/</span>
  <c2-link-button href="/">Home</c2-link-button>
  <c2-link-button href="/a">Workspace</c2-link-button>
  <c2-link-button href="/a/b">Team</c2-link-button>
  <c2-link-button href="/a/b/c">Projects</c2-link-button>
  <span>Q3 launch</span>
</c2-breadcrumb>
```

- **Items**: every child is an item, in order. `c2-link-button` (registered by this package) gives real anchors with `href`; any element works for the current page. Items added or removed later are picked up.
- **Current page**: the last item is marked automatically (`selected` on a link button, `aria-current="page"` otherwise) and styled as text, unless another item already carries `selected` or `aria-current`.
- **Separator**: a chevron by default; put text or an icon in the `separator` slot and it is cloned between every pair of items. `--c2-breadcrumb__separator--size` and `--color` theme it.
- **One row**: the trail never wraps. When it does not fit its container, items collapse behind an ellipsis in priority order: the current page always, then the first item, then the middle items closest to the current page while room remains (re-measured on resize). `max-items="3"` additionally caps the visible items at three. The ellipsis is a button that reveals every item and moves focus to the first of them.
- **Accessibility**: a `nav` landmark labelled "Breadcrumb" (`aria-label` overrides) wrapping an ordered list.

The breadcrumb styles its items through the link button's variables, so `--c2-breadcrumb__item--*` (colour, font size, weight, padding, radius, hover and current colours) applies to links, the ellipsis and a plain current element alike; `--c2-breadcrumb--gap` spaces items and separators; the host fills its container, so size the container to decide where the trail collapses. The full list is in `custom-elements.json` and on the docs site.
