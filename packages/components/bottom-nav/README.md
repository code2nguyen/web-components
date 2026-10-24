# Bottom Nav

`c2-bottom-nav` is the mobile tab bar: three to five `c2-bottom-nav-item` destinations along the bottom of the screen, each an icon over a short label with an optional count or dot badge. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/bottom-nav'
```

```html
<c2-bottom-nav value="home" hide-on-scroll>
  <c2-bottom-nav-item value="home" href="/"><c2-phosphor-house slot="icon"></c2-phosphor-house>Home</c2-bottom-nav-item>
  <c2-bottom-nav-item value="inbox" href="/inbox" count="3"><c2-phosphor-tray slot="icon"></c2-phosphor-tray>Inbox</c2-bottom-nav-item>
  <c2-bottom-nav-item value="profile" href="/me" dot><c2-phosphor-user slot="icon"></c2-phosphor-user>Profile</c2-bottom-nav-item>
</c2-bottom-nav>
```

```js
nav.addEventListener('item-select', (event) => {
  if (hasUnsavedChanges()) event.preventDefault() // stay; the link is not followed
})
nav.addEventListener('change', () => router.navigate(nav.value))
nav.addEventListener('reselect', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
```

The bar is a navigation landmark of links (or buttons, for items without `href`), the current one announced with `aria-current="page"`. It is `position: sticky` at the bottom and padded by `env(safe-area-inset-bottom)`. `label-visibility` is `labeled` (default), `auto`, `selected` or `unlabeled`; hidden labels stay the accessible names. Badges are read as part of the item's name ("Inbox, 3 new").

Every look is CSS: `--c2-bottom-nav--*` on the bar (background, border, radius, blur, margin, safe-area padding) and `--c2-bottom-nav-item__*` for the items (indicator, colours, label type, item direction), which inherit from a class on the bar. The full list is in `custom-elements.json` and on the API tab of the docs site.
