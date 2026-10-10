# Feature: `c2-streaming-text` — smooth reveal of streamed text

**Status**: Design (not started)
**Roadmap**: #96, section H, P2
**Related**: [007-markdown](../007-markdown/spec.md). Both components reveal text through the same core controller.

## Problem

LLM tokens arrive in bursts: nothing for 400 ms, then 60 characters at once. Printing each chunk as it lands reads as jerky. ChatGPT and Claude.ai buffer the stream and release it at a steady pace, behind a caret.

`c2-streaming-text` does this for **plain text**: summaries, tool output, captions and status lines. Markdown answers go to `c2-markdown`, which uses the same pacing engine, so both read identically on one page.

## Goals

1. **Steady reveal.** Bursty input is released at an adaptive rate that never falls more than a bounded time behind the data.
2. **Caret and fade-in.** A caret that blinks while the stream runs, and new words that fade in. Both are styled only through CSS variables.
3. **Cheap DOM.** Animated spans are merged back into one text node once their animation ends, so a 20 kB answer holds a handful of nodes rather than thousands.
4. **Accessible.** Screen readers get the text without the pacing, and `aria-busy` is set while the text grows.
5. **Shared engine.** The pacing lives in `@c2n/core` as a reactive controller, which `c2-markdown` reuses.

## Non-goals

- Markdown or any other formatting. That is `c2-markdown`.
- A typewriter effect for static text (a fake stream). Apps can feed `append` on a timer if they want it.
- Transport: fetch, SSE, WebSocket and the AI SDK. The app reads the stream and calls `append`.

## Usage

```html
<c2-streaming-text streaming></c2-streaming-text>
```

```ts
const out = document.querySelector('c2-streaming-text')!
for await (const chunk of stream) out.append(chunk)
out.streaming = false // the backlog is released quickly, the caret goes, then `reveal-end` fires
```

## Public API

| Property    | Attribute   | Type                    | Default    | Purpose                                                                                                                                                                                |
| ----------- | ----------- | ----------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`     | `value`     | `string`                | `''`       | The full text received so far. Setting a value that starts with the current one acts as an append. Any other value resets the reveal (and is shown at once when `streaming` is false). |
| `streaming` | `streaming` | `boolean`               | `false`    | More text is coming. Shows the caret and sets `aria-busy`. Setting it to `false` flushes the backlog.                                                                                  |
| `reveal`    | `reveal`    | `'smooth' \| 'instant'` | `'smooth'` | Behaviour: whether the display may lag behind the data. `instant` prints each chunk as it arrives. `prefers-reduced-motion: reduce` forces `instant`.                                  |
| `segment`   | `segment`   | `'word' \| 'grapheme'`  | `'word'`   | The unit that is released and faded in, found with `Intl.Segmenter`. Word segmentation already handles CJK. `grapheme` gives a per-character typewriter look.                          |

Methods:

- `append(chunk)` adds text to the stream.
- `clear()` resets the text and the reveal.
- The `text` getter returns the full text received, including the part not yet revealed.

Events:

| Event        | Detail | Notes                                                                                                                                                                                                                                 |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reveal-end` | none   | Fires when `streaming` is false and the display has caught up with the data. A chat list scrolls or swaps its actions in on this event rather than on the network's last chunk, which arrives before the text has finished appearing. |

### Theming

| Variable                                                     | Default                   | Notes                                                                                 |
| ------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------- |
| `--c2-streaming-text--color`, `--font-family`, `--font-size` | inherit, inherit, inherit | Text styling                                                                          |
| `--c2-streaming-text--white-space`                           | `pre-wrap`                | Keeps newlines from the model                                                         |
| `--c2-streaming-text__caret--content`                        | `'▍'`                     | Set to `none` to hide the caret, or `'●'`, `'_'`…                                     |
| `--c2-streaming-text__caret--color`                          | maps to the primary token |                                                                                       |
| `--c2-streaming-text__caret--blink-duration`                 | `1s`                      | `0s` stops the blink                                                                  |
| `--c2-streaming-text__segment--enter-duration`               | `150ms`                   | Fade-in of each released segment. `0s` turns the fade off.                            |
| `--c2-streaming-text__reveal--max-lag`                       | `600ms`                   | How far the display may trail the data. The controller reads it when a stream starts. |
| `--c2-streaming-text__reveal--flush-duration`                | `300ms`                   | Time to release the remaining backlog once `streaming` turns false                    |

`max-lag` and `flush-duration` are animation timings. The repo convention puts animation values in CSS variables, so the controller reads them with `getComputedStyle` once per stream, the way `c2-google-map-marker` reads its pin colours.

## Pacing algorithm (`@c2n/core/stream-reveal.js`)

`StreamRevealController(host, { maxLag, flushDuration, segment, onReveal })` exposes `push(chunk)`, `end()`, `reset(text)` and `revealed` (the revealed length, always on a segment boundary).

On each animation frame, while `revealed < received`:

- The backlog is `received − revealed` segments.
- The rate is `max(backlog / maxLag, floorRate)`, where `floorRate` is about 30 segments per second, so a short tail does not crawl.
- After `end()`, the rate is `backlog / flushDuration`.
- The controller releases `rate × frameDelta` segments.
- `document.hidden` releases the backlog at once, because animation frames pause in a background tab.
- When `revealed === received` after `end()`, it calls `onReveal(done)`, and the host fires `reveal-end`.

## Rendering

- Revealed text so far is kept as **one settled text node**, plus up to N `<span class="enter">` for segments still fading in.
- On `animationend`, a span's text is appended to the settled node and the span is removed. The DOM size stays bounded and selection keeps working.
- The caret is a `::after` on a final empty span, with `content: var(--c2-streaming-text__caret--content)`. It is `aria-hidden` by construction, because generated content is not in the text.
- SSR renders the full `value` as text: nothing animates on the server.

## Accessibility

- `internals.ariaBusy` is set while `streaming` or while the display trails the data.
- Assistive technology reads the DOM text, which is the revealed part. The component sets no live region itself, because announcing replies belongs to `c2-chat-message-list`. Leaving it out avoids reading out every word.

## Test plan

- Bursty fake stream (0 ms, then 500 characters, then a pause): the revealed length rises steadily and the lag never exceeds `max-lag` + one frame.
- `streaming=false` mid-burst: everything is revealed within `flush-duration`, and `reveal-end` fires once.
- `reveal="instant"` and `prefers-reduced-motion`: the display equals the data after each `append`.
- DOM bound: after 20 kB of text, at most N + 2 child nodes remain.
- A selection made during the stream survives later appends.
- `segment="grapheme"` never splits an emoji ZWJ sequence or a combining mark.
- Unit tests (`node --test`) for the controller's rate maths, with a fake clock.
