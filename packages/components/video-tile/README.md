# Video Tile

`c2-video-tile` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/video-tile'
```

```html
<c2-video-tile name="Ana Ruiz" speaking></c2-video-tile> <c2-video-tile name="Kenji Watanabe" muted hand-raised></c2-video-tile>
```

One participant of a call: their video, or their avatar while the camera is off, with name, a live microphone meter and status badges.

- `stream` (property) plays muted in an inner `<video>`; an SDK's own `<video>` goes in the default slot instead.
- `local` mirrors the self view; `kind="screen"` shows a screen share.
- `muted`, `speaking` (or `detect-speaking`), `hand-raised`, `pinned` and `connection`, plus `badge` and `actions` slots.
- Named by the participant and their state; a raised hand is announced.
- Themed through `--c2-video-tile*` custom properties; see the API page of the docs site.
