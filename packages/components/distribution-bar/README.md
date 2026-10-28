# Distribution Bar

`c2-distribution-bar` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/distribution-bar'
```

```html
<c2-distribution-bar items='[{"label":"TypeScript","value":820},{"label":"SCSS","value":120},{"label":"Astro","value":50}]'>Languages</c2-distribution-bar>
```

One 100% stacked bar of a breakdown, with a legend of each part's share. `items` takes `{ label, value, color?, key? }`;
`sort="descending"` orders the parts largest first, `max-items` folds the smallest into "Other", `legend-content`
shows the `percent`, the `value` or `both`, and `interactive` turns the legend into buttons that fire `item-click`.
Hovering a part brings it forward and names its share in a bubble. Every look is a `--c2-distribution-bar__*` CSS
variable; see the API page of the docs site.
