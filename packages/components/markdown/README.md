# Markdown

`c2-markdown` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/markdown'
```

A safe markdown renderer that streams: CommonMark and GitHub-flavoured markdown, TeX math (`c2-math`), Mermaid diagrams (`c2-mermaid`) and highlighted code (`c2-code-viewer`), for chat answers and documents.

```html
<c2-markdown>
  <script type="text/markdown">
    # Release notes

    - **Table**: column pinning
    - Area: $A = \pi r^2$
  </script>
</c2-markdown>

<!-- an untrusted, streaming chat answer -->
<c2-markdown streaming image-policy="click"></c2-markdown>
```

```js
const answer = document.querySelector('c2-markdown')
for await (const chunk of stream) answer.appendText(chunk)
answer.streaming = false
```

- Safe by construction: rendered from tokens with Lit, never `innerHTML`; raw HTML is shown as code; links and images keep only `http(s)`/relative URLs (links also `mailto:`/`tel:`), after an optional `urlTransform`.
- `image-policy="click"` makes images (rendered as `c2-image`) wait for a click, except `image-origins`.
- Streaming: steady reveal shared with `c2-streaming-text` (`reveal`, `--c2-markdown__reveal--*`), only the growing block re-renders, the unfinished tail is healed, `reveal-end` fires when done; the caret is `--c2-markdown__caret--content`.
- `math` (`dollar` | `bracket` | `off`), `breaks`, `heading-offset`, `heading-anchors`, `code` (`viewer` | `plain`) and `renderers` (custom templates per token type).
- `link-click` is cancelable for client-side routing or confirmation.
