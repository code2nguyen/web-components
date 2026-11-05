# Audio Player

`c2-audio-player` plays a voice note or a recording the way Slack clips and WhatsApp voice messages do: a play button,
the waveform as the seek bar, the time and a speed toggle. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/audio-player'
```

```html
<c2-audio-player src="note.webm" label="voice note from Ana" duration="47" peaks="[0.1,0.4,0.8,0.6]"></c2-audio-player>
```

- **Source:** `src` plays with an `<audio>` of the player's own. An `<audio>` put inside the element (with its
  `<source>`s, without `controls`) plays instead, and the player never writes on it. `media` is that element either
  way, to hand to `c2-transcript` or `c2-audio-visualizer`.
- **Waveform:** `peaks` (0–1, usually stored with the recording) drawn as `bars` bars at most, fewer when the waveform
  is narrow. Without `peaks`, the player fetches and decodes the file once (same-origin or CORS) to compute them; when
  it cannot, the bars stay flat. `duration` shows the length before metadata loads.
- **Playback:** the waveform is the seek bar (click, drag, or the arrow keys, Home and End; Space plays). The speed
  button cycles 1×, 1.5× and 2×. `exclusive` pauses the other exclusive players on the page. `play()` and `pause()`
  drive it from script; the host fires `play`, `pause`, `ended` and `ratechange`.
- **Transcript and layouts:** `transcript` (text) or the `transcript` slot adds a toggle that opens it below.
  `variant="bubble"` is the compact chat look, with the `avatar` slot before the play button.
- **Accessibility:** a group named by `label`; the play button says "Play …" or "Pause …"; the waveform is a slider read
  as "0:12 of 0:47".

Every colour, size and the bubble look are `--c2-audio-player*` CSS variables; the API page lists them.
