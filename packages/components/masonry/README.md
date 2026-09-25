# @c2n/masonry

`c2-masonry` automatically packs explicitly sized `c2-masonry-item` tiles into the first free grid cells. Use it for dashboards where cards have different row and column spans and should close gaps after content changes. Use `c2-dashboard` instead when the application chooses fixed tracks and card coordinates. This package does not depend on `c2-dashboard` or any application framework.

```bash
npm install @c2n/masonry
```

```html
<script type="module">
  import '@c2n/masonry'
</script>

<c2-masonry id="operations" class="operations" editable>
  <c2-masonry-item item-id="revenue" label="Revenue" rows="12" cols="3" cols-sm="4" cols-md="5" cols-lg="6">
    <article>
      <h2>Revenue</h2>
      <strong>$8.4M</strong>
      <p>Up 12% this quarter</p>
    </article>
  </c2-masonry-item>
  <c2-masonry-item item-id="orders" label="Open orders" rows="9" cols="2" cols-sm="2" cols-md="3" cols-lg="4">
    <article>
      <h2>Open orders</h2>
      <strong>142</strong>
      <p>Across 7 regions</p>
    </article>
  </c2-masonry-item>
  <c2-masonry-item item-id="activity" label="Recent activity" rows="12" cols="3" cols-sm="6" cols-md="4" cols-lg="4">
    <article>
      <h2>Recent activity</h2>
      <p>Application-owned content scrolls if it exceeds the tile height.</p>
    </article>
  </c2-masonry-item>
</c2-masonry>

<style>
  .operations {
    --c2-masonry--gap: 10px;
    --c2-masonry--row-height: 12px;
    --c2-masonry-item--background: #fff;
    --c2-masonry-item--border: 1px solid #e4e4e7;
    --c2-masonry-item--border-radius: 10px;
    --c2-masonry-item__content--padding: 12px;
  }
</style>
```

The container observes its own content width: `xs` is below 600 px (1 column), `sm` is 600–959.99 px (6), `md` is 960–1279.99 px (9), and `lg` is 1280 px or wider (12). `cols` is the fallback where no range override is given. Effective spans clamp to the available columns; authored spans are not overwritten. One tile order is repacked at every width. Row span is shared across widths. CSS controls cell height and gap; tile content never grows the declared span and remains scrollable through a keyboard-reachable region.

## Editing and persistence

Every tile needs a unique, nonempty `item-id` before editing is available. Missing or duplicate IDs leave content visible, disable all layout editing, and emit `layout-error`. The `editable` attribute shows separate named move and resize controls. Slotted controls and links do not initiate a layout gesture. A focused edit control starts a session with Enter or Space; arrow keys adjust its candidate, Enter/Space commits, and Escape cancels. Move also supports Home/End. Pointer gestures use the same controls and can auto-scroll a nearby scrolling container. Live status announces position and span; focus remains on the control after completion. Reduced-motion preference removes decorative movement.

Listen on the container itself: events do not bubble. One real user commit emits one `layout-change`; initialization, width changes, programmatic `layout` assignment, cancellation, and no-op completion emit none. Committed edits are saved to and restored from `localStorage` by default. The automatic key is `c2-masonry:<pathname>:<element-id>`; if the container has no `id`, its position among masonry containers in the same document or shadow root is used instead. Give the container a stable `id` or `storage-key` when its position may change. An explicit `layout` property takes precedence over stored data. Invalid or unavailable storage is ignored without preventing edits or events.

Use `save-layout="false"` to opt out, or set a custom key:

```html
<c2-masonry editable save-layout="false">...</c2-masonry> <c2-masonry editable storage-key="operations-layout">...</c2-masonry>
```

The property-only `layout` snapshot has this complete shape. Array position is global order; it stores no pixel positions or coordinates:

```ts
interface MasonryLayoutSnapshot {
  version: 1
  items: Array<{
    id: string
    rows: number
    columns: { xs: number; sm: number; md: number; lg: number }
  }>
}
```

`rows` and each column count must be a positive integer; each range's maximum is its column count. An invalid supplied snapshot is rejected atomically with `layout-error`, leaving the previous valid arrangement. Newly added tile IDs append in authored order; removed IDs disappear from the next emitted snapshot. An authored span change updates that tile and repacks without a user-change event. Invalid authored numbers use defaults and report `invalid-span`.

## Public API

| Element           | Property / attribute                                                                   | Default     | Purpose                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| `c2-masonry`      | `editable`                                                                             | `false`     | Enable explicit move/resize controls. `editable="false"` stays false.     |
| `c2-masonry`      | `saveLayout` / `save-layout`                                                           | `true`      | Restore and save committed layouts in localStorage; `"false"` opts out.   |
| `c2-masonry`      | `storageKey` / `storage-key`                                                           | absent      | Override the automatic localStorage key.                                  |
| `c2-masonry`      | `layout` property only                                                                 | `undefined` | Apply an application-owned versioned snapshot.                            |
| `c2-masonry-item` | `itemId` / `item-id`                                                                   | absent      | Stable unique identity required for editing.                              |
| `c2-masonry-item` | `label`                                                                                | absent      | Edit-control and scroll-region name; falls back to `aria-label`, then ID. |
| `c2-masonry-item` | `rows`                                                                                 | `10`        | Positive integer row span for all ranges.                                 |
| `c2-masonry-item` | `cols`                                                                                 | `3`         | Positive integer base column span.                                        |
| `c2-masonry-item` | `colsXs` / `cols-xs`, `colsSm` / `cols-sm`, `colsMd` / `cols-md`, `colsLg` / `cols-lg` | absent      | Optional positive integer overrides by container-width range.             |

`layout-change` detail is `{ layout, itemId, action: 'move' | 'resize', inputMethod: 'mouse' | 'touch' | 'pen' | 'keyboard' }`. `layout-error` detail is `{ reason: 'missing-id' | 'duplicate-id' | 'invalid-span' | 'invalid-layout', itemId? }`. Both are nonbubbling, noncancelable `CustomEvent`s on `c2-masonry`.

The container accepts direct tile children in its default slot. Each tile accepts application content in its default slot and an optional `move-icon` with a built-in SVG fallback. Hovering a tile reveals its move handle and highlights the right and bottom resize borders. Resizing has no icon: drag the right border for columns or the bottom border for rows, or focus the bottom border and use arrow keys. Keyboard focus also reveals the controls. Exposed parts: container `grid`, `placeholder`; tile `content`, `controls`, `move-handle`, `resize-handle`, `resize-edge`.

## Styling

All presentation settings below are CSS custom properties; row/column spans remain structural attributes. Defaults are also in each element's Sass theme map and generated manifest.

| Container variable                         | Default               | Effect                       |
| ------------------------------------------ | --------------------- | ---------------------------- |
| `--c2-masonry--gap`                        | `8px`                 | Cell/tile gap                |
| `--c2-masonry--row-height`                 | `8px`                 | Cell row height              |
| `--c2-masonry--padding`                    | `0px`                 | Grid inset                   |
| `--c2-masonry--background`                 | `transparent`         | Grid background              |
| `--c2-masonry--border`                     | `none`                | Outer border                 |
| `--c2-masonry--border-radius`              | `0px`                 | Outer corners                |
| `--c2-masonry__placeholder--background`    | `rgb(37 99 235 / 8%)` | Candidate fill               |
| `--c2-masonry__placeholder--border`        | `2px dashed #2563eb`  | Candidate edge               |
| `--c2-masonry__placeholder--border-radius` | `6px`                 | Candidate corners            |
| `--c2-masonry__motion--duration`           | `160ms`               | Decorative movement duration |
| `--c2-masonry__motion--timing-function`    | `ease`                | Decorative movement easing   |

| Tile variable                                  | Default                           | Effect                |
| ---------------------------------------------- | --------------------------------- | --------------------- |
| `--c2-masonry-item--background`                | `transparent`                     | Tile surface          |
| `--c2-masonry-item--border`                    | `none`                            | Tile border           |
| `--c2-masonry-item--border-radius`             | `0px`                             | Tile corners          |
| `--c2-masonry-item--box-shadow`                | `none`                            | Tile elevation        |
| `--c2-masonry-item__content--padding`          | `0px`                             | Scroll-region inset   |
| `--c2-masonry-item__controls--gap`             | `4px`                             | Handle spacing        |
| `--c2-masonry-item__controls--background`      | `transparent`                     | Control group surface |
| `--c2-masonry-item__handle--size`              | `32px`                            | Handle hit target     |
| `--c2-masonry-item__resize-handle--size`       | `8px`                             | Resize hit-zone depth |
| `--c2-masonry-item__resize-edge__hover--color` | `rgb(37 99 235 / 35%)`            | Resize edge highlight |
| `--c2-masonry-item__handle--icon-size`         | `16px`                            | Built-in icon size    |
| `--c2-masonry-item__handle--color`             | `#18181b`                         | Handle foreground     |
| `--c2-masonry-item__handle--background`        | `transparent`                     | Handle surface        |
| `--c2-masonry-item__handle--border-radius`     | `6px`                             | Handle corners        |
| `--c2-masonry-item__handle__hover--background` | `transparent`                     | Hover surface         |
| `--c2-masonry-item__handle__focus--outline`    | `2px solid #2563eb`               | Keyboard focus        |
| `--c2-masonry-item__dragging--opacity`         | `0.92`                            | Active tile opacity   |
| `--c2-masonry-item__dragging--box-shadow`      | `0 12px 28px rgb(15 23 42 / 24%)` | Active tile elevation |

The root import registers both tags. For tree-shaken use, `@c2n/masonry/masonry-item.js` registers only the tile element. The package's `custom-elements.json` and the UI API tab provide machine-readable details.
