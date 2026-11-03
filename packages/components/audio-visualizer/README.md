# Audio Visualizer

`c2-audio-visualizer` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/audio-visualizer'
```

```html
<c2-audio-visualizer level="0.6"></c2-audio-visualizer> <c2-audio-visualizer variant="orb" state="thinking" label="Assistant thinking"></c2-audio-visualizer>
```

Live audio level as bars, a waveform or an orb: the mic meter of a call, the waveform of a voice message, the orb of a voice assistant.

- Sources: a `MediaStream` (`stream`), a playing `<audio>`/`<video>` (`media`), or a `level` from 0 to 1 that a call SDK reports.
- Without a source, `state` (`idle`, `listening`, `thinking`, `speaking`) animates what an agent is doing.
- `speaking-change` fires when the source starts or stops speaking, and `:state(speaking)` matches meanwhile.
- Draws only while on screen; a steady meter under reduced motion.
- Themed through `--c2-audio-visualizer*` custom properties; see the API page of the docs site.
