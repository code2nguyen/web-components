# Streaming Text

`c2-streaming-text` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/streaming-text'
```

Plain text that arrives in bursts, such as an LLM answer, revealed at a steady pace behind a caret. Chunks are released word by word so the display never trails the received text by more than `--c2-streaming-text__reveal--max-lag` (600 ms); released words fade in and merge back into one text node.

```html
<c2-streaming-text streaming></c2-streaming-text>
```

```js
const output = document.querySelector('c2-streaming-text')
for await (const chunk of stream) output.appendText(chunk)
output.streaming = false // the rest is released, the caret goes, then `reveal-end` fires
```

- `streaming` shows the caret and sets `aria-busy`; turning it off flushes the backlog within `--c2-streaming-text__reveal--flush-duration`.
- `value` is the text received so far (setting an extension appends); `appendText(chunk)` and `clear()` change it.
- `reveal="instant"` prints each chunk at once (as does `prefers-reduced-motion`); `segment="grapheme"` reveals per character.
- The caret glyph is `--c2-streaming-text__caret--content` (`none` hides it), with `--color`, `--margin-left` and `--blink-duration`.
