# Table Of Contents

`c2-table-of-contents` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/table-of-contents'
```

```html
<main>
  <h2 id="overview">Overview</h2>
  …
  <h3 id="install-npm">With npm</h3>
  …
</main>
<c2-table-of-contents offset="80"></c2-table-of-contents>
```

An "On this page" navigation. It lists the `h2`/`h3` headings of the page's `<main>` (or of the element named by `for`,
matched by `selector`), nests them by level, and marks the section at the top of the scroll area current
(`aria-current="true"`) with a sliding indicator. Activating a link scrolls to the section, focuses its heading and
updates the URL fragment (`keep-url` leaves the URL alone). `offset` accounts for a sticky header. Pass `items`
(`[{ id, label, level }]`) to list sections yourself, which also renders on the server. The `active-change` event
reports the current section. Every visual detail is a `--c2-table-of-contents__*` custom property; see the API page.
