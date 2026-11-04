# Video Grid

`c2-video-grid` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/video-grid'
import '@c2n/components/video-tile'
```

```html
<c2-video-grid layout="grid" max-tiles="9">
  <c2-video-tile name="Ana Ruiz" speaking></c2-video-tile>
  <c2-video-tile name="Kenji Watanabe" muted></c2-video-tile>
</c2-video-grid>
```

Lays out the tiles of a call the way Meet does, every tile as large as the space allows.

- `grid` picks the column count that makes tiles largest and centres the last row; `spotlight` and `sidebar` draw the featured tile large.
- The featured tile is a child marked `featured`, else a screen share, else a pinned tile, else the first; `featured-change` fires when it changes.
- `max-tiles` folds the rest into a "+N more" tile that fires `overflow-click`; pinned and speaking tiles stay drawn.
- Tiles are routed by manual slot assignment, so a tile that moves keeps its playing video.
- By default it takes its height from its width at 16:9; `--c2-video-grid--height` sets one. Themed through `--c2-video-grid*` custom properties; see the API page of the docs site.
