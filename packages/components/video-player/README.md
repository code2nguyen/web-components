# Video Player

`c2-video-player` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/video-player'
```

```html
<c2-video-player label="Product tour" thumbnails="thumbs.vtt">
  <video src="tour.mp4" poster="tour.jpg" playsinline>
    <track kind="captions" srclang="en" label="English" src="tour.en.vtt" />
    <track kind="chapters" srclang="en" src="tour.chapters.vtt" />
  </video>
</c2-video-player>
```

Themed controls over a real `<video>`, the way Loom and YouTube draw them.

- The slotted `<video>` keeps every native feature (sources, captions, `crossorigin`, an HLS/DASH library); the player never writes on it. `src` and `poster` are a shortcut for a single file. `media` gives the video element.
- The seek bar shows the buffered range and the played part, one segment per chapter (`chapters`, or a chapters track); `chapter-change` fires as playback enters one.
- Hovering or dragging the bar shows the time, the chapter and a thumbnail from `thumbnails` (a WebVTT sprite file, or a function of the time).
- Controls: play, time, volume and mute, captions, a settings menu (speed, caption track), picture-in-picture and full screen. They hide while the video plays and the pointer rests.
- Keyboard: Space/K, ←/→, J/L, ↑/↓, M, C, F, 0–9, Home and End. The seek bar is a slider ("1:23 of 4:56, Dashboards").
- Colours, sizes and the controls background are `--c2-video-player*` custom properties; see the API page of the docs site.
