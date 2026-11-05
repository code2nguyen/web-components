# Transcript

`c2-transcript` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/transcript'
```

```html
<c2-transcript style="height: 360px"></c2-transcript>
```

Speaker-labelled, timestamped segments synced to playback.

- `segments` (`{ speaker, start, end, text, words? }`) and `speakers` (`{ name, avatar, color }`) hold the text.
- `media` follows an `<audio>` or `<video>`, or set `current-time`; a click on a time, a segment or a word fires `transcript-seek` and seeks.
- The segment playing stays in view while `follow` is on; scrolling away shows "Jump to current".
- `query` marks matches; `nextMatch()`, `previousMatch()` and `match-change` drive a find bar.
- Colours, sizes and the speaker palette are `--c2-transcript*` custom properties; see the API page of the docs site.
