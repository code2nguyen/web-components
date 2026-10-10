# Feature: `c2-markdown` — safe, streaming markdown renderer

**Status**: Design approved (decisions 2026-10-10), not started
**Roadmap**: #40, section B, P2
**Research**: [research.md](./research.md)

## Decisions (2026-10-10)

| #   | Question                              | Decision                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Images                                | **Load by default**, and chat apps opt into click-to-load. Image behaviour lives in a separate component, **`c2-image`** (#41, [spec](../009-image/spec.md)). Every markdown image renders as one.                                                                                                                            |
| 2   | Raw HTML in the source                | **Shown as code**, never interpreted. An HTML block becomes a code block in `html` and an inline tag becomes inline code. There is no sanitiser and no option to turn interpretation on.                                                                                                                                      |
| 3   | Math and Mermaid                      | **In v1, as separate components built first**: **`c2-math`** ([spec](../010-math/spec.md)) and **`c2-mermaid`** ([spec](../011-mermaid/spec.md)). Neither had a roadmap row, so both are proposed as new rows. Markdown loads each lazily.                                                                                    |
| 4   | Caret                                 | **CSS variables only.** There is no caret attribute. `--c2-markdown__caret--content: none` hides it.                                                                                                                                                                                                                          |
| —   | Relation to `c2-streaming-text` (#96) | Both components reveal text through **one shared pacing controller** in `@c2n/core`, with the same `streaming` / `reveal` / `appendText` API and the same caret variables, so a page mixing them reads identically. `c2-streaming-text` handles plain text and `c2-markdown` handles formatted text. Neither wraps the other. |

## Build order

Each step is its own PR, following the roadmap's definition of done.

```
1. @c2n/core   stream-reveal.js   ─┬─► 2. c2-streaming-text (#96)
                                   │
3. c2-image (#41) ─────────────────┤
4. c2-math (new) ──────────────────┤
5. c2-mermaid (new) ───────────────┤
   c2-code-viewer (shipped) ───────┴─► 6. c2-markdown (#40)
```

The controller and steps 2–5 can run in parallel once the controller has landed. `c2-markdown` imports `@c2n/image` statically, because images are common and the element is small. It imports `@c2n/code-viewer`, `@c2n/math` and `@c2n/mermaid` lazily, on first need.

## Problem

Apps built on c2n render two kinds of markdown:

- **Chat answers** that stream token by token from an LLM. They are untrusted, they are often half-finished when rendered, and they need to show progress without flicker.
- **Static documents**: READMEs, release notes, help text. These are trusted, longer, and need good typography.

No prior-art web component is both safe by default and built for streaming (research §5).

## Goals

1. **Safe by construction.** Output is built from parser tokens as Lit templates, from an allowlist. No HTML string ever reaches `innerHTML`, and raw HTML is displayed as code. Every URL is checked.
2. **Smooth streaming.** Text is paced by the shared reveal controller. Only the block that is still growing is re-rendered, and finished blocks keep their DOM nodes, so selection survives and nothing flickers. Unfinished syntax is healed: a half-typed `**bold`, `[link](htt` or `$x^` never shows raw markers or fires a request.
3. **CommonMark + GFM + math + Mermaid**: tables, task lists, strikethrough, autolinks, TeX math, diagrams.
4. **Themed like every c2 component** through documented `--c2-markdown…` variables that map onto `@c2n/theme`.
5. **Composed from c2 components.** Code goes through `c2-code-viewer`, images through `c2-image`, math through `c2-math` and diagrams through `c2-mermaid`, each with its own variables inheriting through the shadow root.
6. **SSR-safe.** The renderer is a pure tokens → `TemplateResult` function.

## Non-goals

- Editing (`c2-notepad`, `c2-page-editor`). Fetching from a URL (the app sets `value`).
- Interpreting raw HTML, under any option (decision 2).
- Per-character animation of formatted text: markdown reveals smoothly but fades in per block. Word-level fade belongs to `c2-streaming-text`, which handles plain text.

## Usage

```html
<!-- Static document -->
<c2-markdown>
  <script type="text/markdown">
    # Release 0.0.25

    - **Table**: column pinning
    - Area: $A = \pi r^2$
  </script>
</c2-markdown>

<!-- Untrusted chat answer -->
<c2-markdown streaming image-policy="click"></c2-markdown>
```

```ts
const md = document.querySelector('c2-markdown')!
for await (const chunk of stream) md.appendText(chunk)
md.streaming = false
md.addEventListener('reveal-end', () => showActions(), { once: true })
```

## Public API

### Properties and attributes

| Property         | Attribute         | Type                                               | Default    | Purpose                                                                                                                                                                                                                   |
| ---------------- | ----------------- | -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`          | `value`           | `string \| undefined`                              | —          | Markdown source. When unset, the slotted `<script type="text/markdown">` is read, with indentation stripped. A new value that starts with the old one takes the append path.                                              |
| `streaming`      | `streaming`       | `boolean`                                          | `false`    | Same meaning as on `c2-streaming-text`: shows the caret, sets `aria-busy`, heals the tail and defers code, math and diagram rendering of the open block. `false` flushes the backlog and does one final, unhealed render. |
| `reveal`         | `reveal`          | `'smooth' \| 'instant'`                            | `'smooth'` | Same meaning as on `c2-streaming-text`: whether the display may lag behind the data. `prefers-reduced-motion` forces `instant`.                                                                                           |
| `imagePolicy`    | `image-policy`    | `'load' \| 'click'`                                | `'load'`   | Decision 1. `click` renders every image as `<c2-image load="click">`, except for origins listed in `image-origins`.                                                                                                       |
| `imageOrigins`   | `image-origins`   | `string[]` (space-separated attribute)             | `[]`       | Origins that load without a click under `image-policy="click"`                                                                                                                                                            |
| `urlTransform`   | —                 | `(url, kind: 'link' \| 'image') => string \| null` | —          | Runs after the protocol check. Rewrite a URL to a proxy, or return `null` to drop it: a link becomes its text, an image becomes its alt text.                                                                             |
| `math`           | `math`            | `'dollar' \| 'bracket' \| 'off'`                   | `'dollar'` | Math delimiters. `dollar` accepts `$…$`, `$$…$$`, `\(…\)` and `\[…\]`. `bracket` accepts only the backslash forms, for finance text full of prices. `off` leaves math as text.                                            |
| `breaks`         | `breaks`          | `boolean`                                          | `false`    | A single newline becomes `<br>` (GFM `breaks`). Most chat UIs turn this on.                                                                                                                                               |
| `headingOffset`  | `heading-offset`  | `number`                                           | `0`        | Shift heading levels, so a `#` inside a card is not the page's `<h1>`. Capped at h6.                                                                                                                                      |
| `headingAnchors` | `heading-anchors` | `boolean`                                          | `false`    | Gives headings a GitHub-style slug `id` and an anchor link that appears on hover                                                                                                                                          |
| `code`           | `code`            | `'viewer' \| 'plain'`                              | `'viewer'` | `viewer` renders closed fences through `c2-code-viewer`. `plain` renders a themed `<pre>` and never loads shiki.                                                                                                          |
| `renderers`      | —                 | `Partial<Record<TokenType, Renderer>>`             | —          | Override the template for one token type, for example a router link. The output is still a Lit template, so an override cannot reintroduce `innerHTML` by accident.                                                       |

Behavioural options are attributes and everything visual is a CSS variable. Attribute spellings follow the manifest rules.

### Methods and getters

- `appendText(chunk)` and `clear()` behave as on `c2-streaming-text`.
- `text` returns the source.

### Events

| Event        | Detail                                                   | Bubbles | Notes                                                                                                                                                                                      |
| ------------ | -------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reveal-end` | none                                                     | no      | Same event as on `c2-streaming-text`: the stream has ended and the display has caught up                                                                                                   |
| `link-click` | `{ href: string, external: boolean, event: MouseEvent }` | yes     | Cancelable. Lets an app route internal links itself or confirm before leaving the site                                                                                                     |
| (composed)   | —                                                        | —       | These come from the inner components and reach the app unchanged: `code-copy` (code viewer), `load-request` (image; cancel or rewrite to confirm or proxy), `math-error`, `mermaid-error`. |

Events are declared in a `MarkdownEventMap` with `TypedAddEventListener`.

### Slots and parts

- Default slot: the `<script type="text/markdown">` source, never displayed.
- Parts: `heading`, `paragraph`, `link`, `blockquote`, `list`, `table`, `code-block`, `raw-html`, `caret`.

## Architecture

```
appendText(chunk) ──► StreamRevealController (@c2n/core) ──► revealed source (on a grapheme boundary)
                                                                │  one pass per animation frame
                                                                ▼
lex     marked.lexer(source, { gfm, breaks, extensions: [mathBlock, mathInline] }) → block tokens, each with .raw
                                                                │
split   finished blocks = all but the last · tail = last block
        streaming? → heal(tail.raw), re-lex the tail only
                                                                ▼
render  repeat(blocks, (b, i) => i, b => guard([b.raw, ctxVersion], () => renderBlock(b, ctx)))
        renderBlock / renderInline: an allowlisted switch over token.type → Lit templates
```

### 1. Parser: marked as a lexer only

`marked` 18.x (MIT, 13.6 kB gzipped) is used **only as a lexer**: its HTML renderer is never called. It was chosen for GFM, the per-block `raw` source that drives memoisation, and its extension API. The alternatives and why each lost are in research §1.

Math adds two small marked tokenizer extensions of our own, about 60 lines. They avoid marked-katex-extension, which is tied to KaTeX. Their rules:

- `$$…$$` and `\[…\]` are blocks.
- `\(…\)` and `$…$` are inline.
- Inline `$` follows Pandoc's rules: the opening `$` must be followed by a non-space character, and the closing `$` must follow a non-space character and must not be followed by a digit. `\$` escapes. So `$5 and $10` stays text.

### 2. Streaming

- The **reveal controller** (shared with `c2-streaming-text`, [spec](../008-streaming-text/spec.md#pacing-algorithm-c2ncorestream-revealjs)) decides how much of the source is visible on each frame. Markdown renders `source.slice(0, revealed)`, so bursty tokens appear at the same steady pace as plain streaming text.
- **Block memoisation.** The visible source is re-lexed on each frame, which takes about 1 ms for chat-length text. Lit `repeat` + `guard` keyed on `raw` means only the tail block's template is re-evaluated, and **a finished block's DOM nodes are never replaced**. The tests assert this.
- New blocks fade in (`--c2-markdown__block--enter-duration`).
- Reference links defined late are covered: `ctxVersion` includes a hash of `tokens.links`, so a new definition re-renders exactly the blocks that use references.
- Lexing incrementally from the previous tail's offset is deferred until measurement shows the need.

### 3. Healing the tail (`heal.ts`, only while streaming)

| Unfinished syntax                                  | Rendered as                                                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `**bold`, `*em`, `_em`, `~~del`, `` `code ``       | Closed at the end, so it renders styled immediately. A single `~` between word characters is escaped.                   |
| `[label](https://exa`                              | The label as text with no `href`, styled as a pending link (`__link__pending--color`). A partial URL is never rendered. |
| `![alt](…` (incomplete)                            | Dropped. A pending image must not fire a request.                                                                       |
| An open ` ``` ` fence (including `mermaid`)        | A plain `<pre>` of the text so far. It becomes a `c2-code-viewer` or `c2-mermaid` on the frame where the fence closes.  |
| An open `$$`, `\[`, `\(` or a closable `$`         | The TeX source, dimmed, as code. It becomes a `c2-math` when its delimiter closes.                                      |
| A table with a header row but no delimiter row yet | A paragraph. It becomes a table when the delimiter row arrives.                                                         |
| An unclosed raw HTML tag such as `<div`            | Inline code, as decision 2 already requires                                                                             |
| A trailing lone `#`, `-`, `>`, `1.`                | Held back, so a list marker or heading does not flash and then change                                                   |

### 4. Rendering (`render.ts`)

A pure function `(token, ctx) => TemplateResult`. Its allowlist:

| Token                                          | Renders as                                                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `heading`                                      | `<hN>` shifted by `heading-offset`, optional slug anchor                                                              |
| `paragraph`, `blockquote`, `hr`, `space`, `br` | The native element                                                                                                    |
| `list`, `list_item`                            | `<ul>` / `<ol start>`. Task items show a disabled checkbox drawn with an inline SVG, which exposes its checked state. |
| `table`                                        | A focusable scroll wrapper holding `<table>`, with column alignment                                                   |
| `code` (closed)                                | `<c2-code-viewer lang=… .code=…>`, or a plain `<pre>` when `code="plain"` or while the module loads                   |
| `code` with lang `mermaid`                     | `<c2-mermaid .value=…>`, with a plain `<pre>` while the module loads                                                  |
| `mathBlock`, `mathInline`                      | `<c2-math display? .value=…>`, with dimmed TeX code while the module loads                                            |
| `html` (block)                                 | **Decision 2**: a code block in `html` (`c2-code-viewer lang="html"`), part `raw-html`                                |
| `html` (inline), `tag`                         | **Decision 2**: `<code part="raw-html">`                                                                              |
| `strong`, `em`, `del`, `codespan`              | The native element                                                                                                    |
| `link`                                         | `<a>` with a checked `href`. External links get `target="_blank" rel="noopener noreferrer nofollow"`.                 |
| `image`                                        | `<c2-image src alt referrerpolicy="no-referrer" load=…>` (decision 1)                                                 |
| `text`, `escape`                               | Text binding                                                                                                          |
| anything else                                  | Its `raw`, as text                                                                                                    |

Text only ever goes through `${}` bindings.

### 5. Safety

- **URLs** (`safe-url.ts`) are parsed with `new URL(raw, document.baseURI)`. On the server, the base is a placeholder origin and only the protocol is checked. Allowed protocols:
  - Links: `http:`, `https:`, `mailto:`, `tel:`, relative URLs and `#fragment`s.
  - Images: `http:`, `https:` and relative URLs.

  `javascript:`, `vbscript:`, `data:`, `file:` and `blob:` are rejected, including entity- or whitespace-obfuscated forms. Next, `urlTransform` runs. For images, `image-policy` and `image-origins` then pick `load="lazy"` or `load="click"` on the `c2-image`.

- **Raw HTML** is never parsed into DOM (decision 2). It is displayed as code, so there is no sanitiser to keep up to date and nothing for DOMPurify to do.
- **Image exfiltration**: `image-policy="click"` plus `c2-image`'s zero-request blocked state. While streaming, an incomplete image is never rendered. The docs page's "Rendering AI output" section recommends `image-policy="click"` for model output, and warns that an open redirect on an allowed origin defeats `image-origins`.
- **Math** goes through Temml with `trust: false` and expansion limits. **Diagrams** go through Mermaid with `securityLevel: 'strict'`, locked against `init` overrides, with the SVG stripped before adoption. Details are in their specs.

### 6. Shadow DOM, not light DOM

Unlike `<vaadin-markdown>`:

- Writing children the author did not render causes SSR hydration mismatches.
- Page CSS leaking into chat answers is a bug.
- The repo's contract is CSS variables, with `::part()` and `renderers` as escape hatches.

### 7. Accessibility

- `internals.ariaBusy` while streaming or while the display is still revealing. No `aria-live`: announcements belong to `c2-chat-message-list`.
- The caret is generated content, which is not in the accessibility tree.
- Tables sit in a scroll wrapper with `tabindex="0"` when they overflow, plus an accessible name.
- Heading levels follow `heading-offset`.
- Animations respect `prefers-reduced-motion`.
- Math is native MathML, which assistive technology reads. Diagrams carry `accTitle` and `accDescr`.

## Theming (CSS variables)

Defaults use literals that `@c2n/theme` already maps: 14px and 12px font sizes, weight 600, 6px radius and the colour ramp. The inner components keep their own variables (`--c2-code-viewer…`, `--c2-image…`, `--c2-math…`, `--c2-mermaid…`). Set on `c2-markdown`, they inherit into every block.

| Group       | Variables                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base        | `--c2-markdown--color`, `--font-family`, `--font-size=14px`, `--line-height=1.6`, `--block-gap=12px`                                                                 |
| Headings    | `__heading--color`, `__heading--font-weight=600`, `__heading--margin-top`, `__h1--font-size` … `__h6--font-size`                                                     |
| Links       | `__link--color`, `__link__hover--color`, `__link--text-decoration`, `__link__pending--color`                                                                         |
| Inline code | `__code--font-family`, `__code--font-size`, `__code--background`, `__code--color`, `__code--border-radius=6px`, `__code--padding`                                    |
| Raw HTML    | `__raw-html--color`, `__raw-html--background` (inline raw HTML can be told apart from authored code)                                                                 |
| Blocks      | `__code-block--margin`, `__math-block--margin`, `__diagram--margin`, `__image--margin`                                                                               |
| Blockquote  | `__blockquote--border-left`, `__blockquote--color`, `__blockquote--padding-left`                                                                                     |
| Lists       | `__list--padding-left`, `__list__marker--color`, `__task--accent-color`                                                                                              |
| Table       | `__table--border`, `__table__header--background`, `__table__header--font-weight`, `__table__cell--padding`, `__table__row__striped--background`                      |
| Rule        | `__hr--border-top`                                                                                                                                                   |
| Streaming   | `__caret--content='▍'`, `__caret--color`, `__caret--blink-duration=1s`, `__block--enter-duration=150ms`, `__reveal--max-lag=600ms`, `__reveal--flush-duration=300ms` |

The streaming variables mirror `c2-streaming-text`'s names part for part (decision 4).

## Files

```
packages/core/src/stream-reveal.ts          shared pacing controller (step 1)
packages/components/markdown/
  src/markdown.ts        element: properties, reveal controller, slot source, internals, lazy module loading
  src/lex.ts             marked.lexer wrapper, block keys, link-ref hash
  src/math-extension.ts  marked tokenizers for $…$, $$…$$, \(…\), \[…\]
  src/heal.ts            tail healing (pure)
  src/render.ts          tokens → TemplateResult (pure, SSR-safe)
  src/safe-url.ts        protocol allowlist, urlTransform, image-policy
  src/markdown.scss
  test/markdown.spec.ts  Playwright
  test/heal.test.ts, test/math-extension.test.ts   node --test, no browser
```

## Test plan

- **Rendering:** a CommonMark/GFM/math/mermaid fixture covering every allowlisted token, snapshotted as structure.
- **Raw HTML (decision 2):** `<script>alert(1)</script>`, `<img src=x onerror=…>`, `<iframe>` and `<div onclick>` all appear as visible code. No element of those types, and no `on*` attribute, exists anywhere in the shadow tree.
- **URL corpus:**
  - `javascript:`, `java&#x09;script:`, `data:text/html`, `vbscript:` links
  - `data:` images
  - autolinks to `javascript:`
  - reference-definition links
  - `urlTransform` returning junk or `null`
- **Images:**
  - The default policy loads (lazily).
  - `image-policy="click"` makes zero requests until activation.
  - An origin in `image-origins` loads.
  - While streaming, zero requests are made before the image's markdown closes.
- **Streaming:**
  - Character-by-character feed: finished blocks keep the **same DOM node**, and a selection inside a finished block survives 100 appends.
  - At most one block is re-rendered per frame.
  - No raw `**`, `$$` or ` ``` ` marker is ever visible.
  - A fence becomes `c2-code-viewer` or `c2-mermaid` only after it closes. Math becomes `c2-math` only after its delimiter closes.
  - `reveal-end` fires once, after `streaming=false` and the catch-up.
- **Math delimiters:** `$5 and $10` stays text, and `math="bracket"` ignores `$x$`.
- **Lazy modules:** a document with no code, math or diagram makes no request for those chunks.
- **SSR:** `render.ts` imported with no DOM globals.
- **Umbrella:** all five tags register. Size budgets are recorded: the markdown entry is about 13.6 kB for marked plus about 6 kB of component. The code viewer, math and Mermaid fall in the lazy chunks.

## Dogfooding

- `apps/examples/support-inbox-vue`: agent replies stream through `c2-markdown` inside `c2-chat-message`.
- `open-packages/chatbot`: assistant content.
- Docs site: changelog cards, or examples in the AI-tools guide. Any friction goes to `COMPONENT-FEEDBACK.md`.

## Later (not v1)

- GitHub alerts (`> [!NOTE]`, rendered with `c2-banner`).
- Footnotes.
- A `c2-table-of-contents` (#63) wired to `heading-anchors`.
- Incremental lexing, or `@lezer/markdown` for documents over 100 kB, if measurement shows the need.
