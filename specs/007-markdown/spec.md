# Feature: `c2-markdown` — safe, streaming markdown renderer

**Status**: Design (not started)
**Roadmap**: #40, section B, P2
**Research**: [research.md](./research.md)

## Problem

Apps built on c2n render two kinds of markdown:

- **Chat answers** that stream in token by token from an LLM. They are untrusted, they are often half-finished when rendered, and they need to show their progress without flicker.
- **Static documents** such as READMEs, release notes, help text and descriptions. These are usually trusted and longer, and they need good typography.

Today the only options are `innerHTML` on a third-party parser's output, which is unsafe and re-renders everything on each chunk, or the notepad's line-based format, which is an editor format and not CommonMark. No prior-art web component is both safe by default and built for streaming (research §5).

## Goals

1. **Safe by construction.** Output is built from parser tokens as Lit templates, from an allowlist of elements. No HTML string from the markdown ever reaches `innerHTML`. Every URL is checked.
2. **Smooth streaming.** Appending text re-renders only the block that is still growing. Finished blocks keep their DOM nodes, so a reader's text selection survives and nothing flickers. Unfinished syntax is healed, so a half-typed `**bold` or `[link](htt` never shows raw markers or fires a request.
3. **CommonMark + GFM**: tables, task lists, strikethrough, autolinks.
4. **Themed like every c2 component**: typography, spacing and colours through documented `--c2-markdown…` variables that map onto `@c2n/theme`.
5. **Reuse what the repo has.** Fenced code renders through `c2-code-viewer` (shiki, already shared per page) and is loaded lazily.
6. **SSR-safe**: the renderer is a pure tokens → `TemplateResult` function with no `document` access, so `@lit-labs/ssr` and Next.js render it.

## Non-goals

- Editing markdown. `c2-notepad` and `c2-page-editor` cover that.
- Fetching from a URL. Apps fetch the source and set `value`, which keeps the network and CSP decisions in the app.
- Math and Mermaid in v1. Phase 2 adds them as lazy opt-in modules (see Phasing).
- Per-word or per-character typing animation. v1 fades in each new block. Word reveal would mean splitting text nodes, which works against selection and cost.

## Usage

```html
<!-- Static: the source in a script tag (the browser does not parse it, and indentation is stripped) -->
<c2-markdown>
  <script type="text/markdown">
    # Release 0.0.25

    - **Table**: column pinning
    - Fixed `c2-select` keyboard focus
  </script>
</c2-markdown>

<!-- Chat: untrusted and streaming -->
<c2-markdown streaming image-policy="click"></c2-markdown>
```

```ts
const md = document.querySelector('c2-markdown')!
for await (const chunk of stream) md.append(chunk)
md.streaming = false // final render: the caret goes away, healing stops, open code blocks are highlighted
```

`c2-chat-message` needs no changes. A `c2-markdown` goes in its default slot.

## Public API

### Properties and attributes

| Property         | Attribute         | Type                                                 | Default    | Purpose                                                                                                                                                                                                                       |
| ---------------- | ----------------- | ---------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`          | `value`           | `string \| undefined`                                | —          | Markdown source. When it is unset, the slotted `<script type="text/markdown">` is read. A new value that starts with the old one takes the append path.                                                                       |
| `streaming`      | `streaming`       | `boolean`                                            | `false`    | The source is still growing. Turns on tail healing, the caret, `aria-busy` and deferred highlighting. Setting it to `false` triggers one final, unhealed render.                                                              |
| `html`           | `html`            | `'text' \| 'sanitize'`                               | `'text'`   | How raw HTML in the source is handled. `text` shows it literally. `sanitize` keeps an allowlist of inline elements (see Safety).                                                                                              |
| `imagePolicy`    | `image-policy`    | `'load' \| 'click' \| 'block'`                       | `'load'`   | `click` renders a placeholder showing the alt text and host, and loads on click. `block` shows only the alt text. Origins listed in `image-origins` always load.                                                              |
| `imageOrigins`   | `image-origins`   | `string[]` (space-separated attribute)               | `[]`       | Origins that load without a click under `click` or `block`.                                                                                                                                                                   |
| `urlTransform`   | —                 | `(url, kind: 'link' \| 'image') => string \| null`   | —          | App hook that runs after the built-in protocol check: rewrite a URL to a proxy, or return `null` to drop it. A dropped link renders as its text, a dropped image as its alt text.                                             |
| `breaks`         | `breaks`          | `boolean`                                            | `false`    | Treat a single newline as `<br>` (GFM `breaks`). Most chat UIs want this on.                                                                                                                                                  |
| `headingOffset`  | `heading-offset`  | `number`                                             | `0`        | Shift heading levels so a `#` inside a card does not become the page's `<h1>`. Capped at h6.                                                                                                                                  |
| `headingAnchors` | `heading-anchors` | `boolean`                                            | `false`    | Give headings a GitHub-style slug `id` and a hover anchor link. Ready for a future `c2-table-of-contents`.                                                                                                                    |
| `code`           | `code`            | `'viewer' \| 'plain'`                                | `'viewer'` | `viewer` renders closed fences as a `c2-code-viewer`, loaded lazily. `plain` renders a themed `<pre>` and never loads shiki.                                                                                                  |
| `renderers`      | —                 | `Partial<Record<BlockType \| InlineType, Renderer>>` | —          | Override the template for a token type, for example to render links as a router link or headings with a custom anchor. The output still goes through Lit bindings, so an override cannot reintroduce `innerHTML` by accident. |

`value` stays a plain string attribute so a server-rendered `value="…"` works. Attribute spellings follow the manifest rules (`image-policy`, not `imagePolicy`). The `html`, `image-policy` and `code` options change behaviour or structure, so they are attributes. Everything visual is a CSS variable.

### Methods

- `append(chunk: string): void` is the streaming path. It is equivalent to `value += chunk`, but it skips the prefix comparison.
- `text: string` (getter) returns the rendered plain text, for copying and search.

### Events

| Event        | Detail                                                   | Bubbles | Notes                                                                                                                                                                       |
| ------------ | -------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `link-click` | `{ href: string, external: boolean, event: MouseEvent }` | yes     | Cancelable. `preventDefault()` lets an app route internal links itself or confirm before leaving for an external link (streamdown's `linkSafety` without imposing a modal). |
| `image-load` | `{ src: string }`                                        | yes     | Fired when a reader clicks a placeholder to load an image under `image-policy="click"`. Cancelable.                                                                         |

`code-copy` from the inner `c2-code-viewer` is composed and already reaches the app.

The events are declared in a `MarkdownEventMap` through `TypedAddEventListener`, following the repo convention.

### Slots and parts

- Default slot: the `<script type="text/markdown">` source. The slot itself is never displayed.
- `::part()` hooks for what variables cannot express: `heading`, `paragraph`, `link`, `blockquote`, `table`, `code-block`, `image`, `caret`.

## Architecture

```
source string
  │  (rAF-throttled while streaming)
  ▼
lex   ─ marked.lexer(source, { gfm: true, breaks })   → Token[]  (one per top-level block, each with .raw)
  │
  ▼
split ─ finished blocks = all but the last; tail = last block
  │       └ streaming? heal(tail.raw) and re-lex that block only
  ▼
render ─ repeat(blocks, (b, i) => i, b => guard([b.raw, ctxVersion], () => renderBlock(b, ctx)))
          renderBlock / renderInline: an allowlisted switch over token.type returning Lit templates
```

### 1. Parser: marked as a lexer only

marked is used only as a lexer. `marked.parse` is never called and marked's HTML renderer is never used. Reasons (research §1):

- 13.6 kB gzipped, with GFM included.
- Its per-block `raw` source drives the memoisation.
- It has an extension API for phase 2.
- streamdown, Vaadin, Web Awesome, zero-md and md-block already rely on it.

The alternatives each lose on one point: micromark and remark need unified to produce a tree, markdown-it is three times the size, and @lezer/markdown would need our own renderer. `marked` becomes a runtime `dependency` of `@c2n/markdown`. It stays external in the package build and is pinned in the umbrella's `dependencies` like the other third-party libraries.

### 2. Streaming: block memoisation

- Each `append` stores the text and schedules one render per animation frame, however many chunks arrive in that frame.
- The whole source is re-lexed on each frame, which takes about a millisecond for chat-length text. Lit's `repeat` + `guard` keyed on `raw` means only the tail block's template is re-evaluated. **A finished block's DOM nodes are never replaced**: this is the property tests assert (node identity and selection survive appends).
- Reference-style links defined at the end of the document do resolve in earlier blocks. `ctxVersion` includes a hash of `tokens.links`, so a new definition re-renders exactly the blocks that use references.
- A later optimisation, only if measurement shows the need: lex from the start offset of the previous tail instead of from 0.

### 3. Healing the tail (`heal.ts`)

This only runs while `streaming` is true. It works on the tail block's text:

| Unfinished syntax                                  | Rendered as                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `**bold`, `*em`, `_em`, `~~del`, `` `code ``       | Closed at the end, so it renders styled immediately. A single `~` between word characters is escaped.                     |
| `[label](https://exa`                              | The label as **text with no `href`** (styled like a pending link). A partial URL is never rendered.                       |
| `![alt](https://…` (incomplete)                    | Dropped. A pending image must not fire a request.                                                                         |
| An open ` ``` ` fence                              | A plain `<pre>` of the code so far, never highlighted. It becomes a `c2-code-viewer` on the frame where the fence closes. |
| A table with a header row but no delimiter row yet | Shown as a paragraph. It becomes a table when the delimiter row arrives, which is the only layout jump, and a rare one.   |
| A trailing lone `#`, `-`, `>` or `1.`              | Held back, so a list bullet or heading does not appear and then change.                                                   |

Inline `$` math is never healed, because it is usually a currency sign.

### 4. Rendering (`render.ts`)

The renderer is a pure function `(token, ctx) => TemplateResult`. Its allowlist:

- `heading`, `paragraph`, `blockquote`, `list`/`list_item` (task items get a disabled checkbox drawn with an inline SVG), `code`, `table`, `hr`, `space`
- Inline: `strong`, `em`, `del`, `codespan`, `br`, `link`, `image`, `text`, `escape`

Rules:

- Unknown token types render their `raw` text.
- Text only ever goes through `${}` bindings.
- External links get `target="_blank" rel="noopener noreferrer nofollow"`.
- Images get `loading="lazy" referrerpolicy="no-referrer" decoding="async"`, plus intrinsic size when the source gives it.

### 5. Safety

- **URLs** (`safe-url.ts`) are parsed with `new URL(raw, document.baseURI)`. On the server, the base is a placeholder origin and only the protocol is checked. Allowed protocols:
  - Links: `http:`, `https:`, `mailto:`, `tel:`, and relative URLs and `#fragment`s.
  - Images: `http:`, `https:`, and relative URLs.

  `javascript:`, `vbscript:`, `data:`, `file:` and `blob:` are rejected, including entity- or whitespace-obfuscated forms. marked decodes entities first, and `URL` normalises control characters. Next, `urlTransform` runs. Then `image-policy` applies.

- **Raw HTML** in `html="text"` mode, the default, renders as literal text. In `html="sanitize"`, each HTML token is parsed inertly (`Document.parseHTMLUnsafe` / `<template>`) and rebuilt node by node from an allowlist:
  - Elements: `b i em strong u s del ins mark sub sup small kbd abbr br span details summary img`.
  - Attributes: `title`, `open`, `alt`, plus `src` through the same URL and image policy.

  No attributes or styles are copied otherwise. The sanitiser is about 1 kB, has no dependency and shares the URL code. DOMPurify (11.7 kB) and `setHTML` (not in Safari) are both left out deliberately. On the server, `sanitize` falls back to text until hydration.

- **Image exfiltration** (research §3) is why `image-policy` and `image-origins` exist. The docs page's "Rendering AI output" section recommends `image-policy="click"` and/or `image-origins` for any model output, and warns that an open redirect on an allowed origin defeats the allowlist.

### 6. Code blocks

- With `code="viewer"`, the first closed fence triggers `import('@c2n/code-viewer')`. It counts in the umbrella's `lazy` budget, not the markdown entry.
- Until the module is defined, the fence renders as the same plain `<pre>` used while streaming. After that it renders `<c2-code-viewer lang=… .code=…>`.
- The fence's info string is the language.
- The code viewer's own variables inherit through the shadow root, so `--c2-code-viewer…` set on `c2-markdown` styles every block. There is no second highlighting stack, and every viewer on the page shares one shiki highlighter.

### 7. Shadow DOM, not light DOM

`<vaadin-markdown>` renders into light DOM so page CSS applies. We don't, because:

1. It would write children the author did not render, which is the same SSR hydration mismatch the "never write on the host" rule exists for.
2. Page CSS leaking into chat answers is a bug, not a feature.
3. The repo's theming contract is CSS variables.

Escape hatches are `::part()` and `renderers`.

### 8. Accessibility

- While streaming, the element sets `internals.ariaBusy = 'true'` and clears it when streaming ends. It sets no `aria-live`: announcing replies is `c2-chat-message-list`'s job, and a live markdown region would read every token.
- Each caret is `aria-hidden`.
- Tables sit in a scroll wrapper with `tabindex="0"` and an accessible name, so they can be scrolled with the keyboard.
- Task checkboxes are disabled and expose their checked state.
- Heading levels follow `heading-offset`.
- Animations respect `prefers-reduced-motion`.

## Theming (CSS variables)

Defaults use literals that `@c2n/theme` already maps: 14px and 12px font sizes, 600 weight, 6px radius and the colour ramp. Draft list:

| Group       | Variables                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Base        | `--c2-markdown--color`, `--font-family`, `--font-size=14px`, `--line-height=1.6`, `--block-gap=12px`                                            |
| Headings    | `__heading--color`, `__heading--font-weight=600`, `__heading--margin-top`, `__h1--font-size` … `__h6--font-size`                                |
| Links       | `__link--color`, `__link__hover--color`, `__link--text-decoration`, `__link__pending--color`                                                    |
| Inline code | `__code--font-family`, `__code--font-size`, `__code--background`, `__code--color`, `__code--border-radius=6px`, `__code--padding`               |
| Code block  | `__code-block--margin`; everything else is delegated to `--c2-code-viewer…`                                                                     |
| Blockquote  | `__blockquote--border-left`, `__blockquote--color`, `__blockquote--padding-left`                                                                |
| Lists       | `__list--padding-left`, `__list__marker--color`, `__task--accent-color`                                                                         |
| Table       | `__table--border`, `__table__header--background`, `__table__header--font-weight`, `__table__cell--padding`, `__table__row__striped--background` |
| Rule, image | `__hr--border-top`, `__image--max-width=100%`, `__image--border-radius`, `__image-placeholder--background`, `__image-placeholder--color`        |
| Streaming   | `__caret--color`, `__caret--width`, `__caret--animation-duration`, `__block--enter-duration=150ms`                                              |

Every variable gets an `@cssproperty` line and a `$theme` map default, as the convention requires.

## Files

```
packages/components/markdown/
  src/markdown.ts        element: properties, append, rAF scheduling, slot source, internals
  src/lex.ts             marked.lexer wrapper + block keys + link-ref hash
  src/heal.ts            tail healing (pure, unit-testable)
  src/render.ts          tokens → TemplateResult (pure, SSR-safe)
  src/safe-url.ts        protocol allowlist, urlTransform, image policy
  src/sanitize-html.ts   allowlist rebuild for html="sanitize"
  src/markdown.scss
  test/markdown.spec.ts  Playwright
  test/heal.test.ts      node --test, no browser
```

## Test plan

- **Rendering:** a CommonMark/GFM fixture covering every allowlisted token. Snapshot it against expected structure, not exact HTML.
- **XSS corpus** (none of these may produce script execution, an event-handler attribute or a dangerous `href`/`src`):
  - `javascript:` links
  - obfuscated `java&#x09;script:` links
  - `data:text/html` links and `data:` images
  - `<script>` and `<img onerror>` in both `html` modes
  - autolinks to `javascript:`
  - reference-definition links
  - `urlTransform` returning junk
- **Streaming:**
  - Feed a reply character by character. Finished blocks keep the **same DOM node** (identity check), and a selection inside a finished block survives 100 appends.
  - At most one block template is re-evaluated per frame.
  - No raw `**` is ever visible.
  - An intercepted route counts **zero** image requests before the image's markdown closes.
  - An open fence becomes a `c2-code-viewer` once it closes.
  - `streaming=false` removes the caret and `aria-busy`.
- **Image policy:**
  - `click` makes no request until the reader clicks.
  - Allowed origins load.
  - `block` never loads.
- **Unit tests** for the `heal.ts` table above and for `safe-url.ts`.
- **SSR:** `render.ts` imported with no DOM globals.
- **Umbrella:** the tag registers. Size budget recorded at roughly 13.6 kB for marked plus about 5 kB for the component, gzipped.

## Dogfooding

- `apps/examples/support-inbox-vue`: agent replies stream through `c2-markdown` inside `c2-chat-message`.
- `open-packages/chatbot`: render assistant content with it.
- Docs site: the changelog cards or the AI-tools guide examples. Any friction goes to `COMPONENT-FEEDBACK.md`.

## Phasing

| Phase | Scope                                                                                                                                                                                                                                                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Everything above: CommonMark + GFM, streaming, healing, URL and image policy, `html` modes, lazy `c2-code-viewer`, theming, docs (≥ 6 gallery cards), presets, tests                                                                                            |
| 2     | Opt-in subpath modules, each lazy and wired through `renderers` + a marked extension: `@c2n/markdown/math.js` (Temml → MathML), `@c2n/markdown/mermaid.js` (rendered after the fence closes), GitHub alerts (`> [!NOTE]`, rendered with `c2-banner`), footnotes |
| 3     | Only if measurement shows the need: incremental lexing from the last tail offset; `@lezer/markdown` for documents over 100 kB                                                                                                                                   |

## Open questions (need a decision)

1. **Default `image-policy`.** I recommend `load`, so READMEs just work and chat apps opt into `click`. The alternative is `click` by default: safer for AI output, but more friction for documents.
2. **Default `html`.** I recommend `text`, which is safest and matches react-markdown. `sanitize` would render the occasional `<kbd>`/`<details>` in READMEs out of the box.
3. **Phase-2 scope.** Should math and Mermaid move into v1? Chat apps for technical users often expect math.
4. **Caret style.** A single block caret (Claude.ai style), or `caret="block|bar|none"` as an attribute? The latter would be presentation exposed as an attribute, which the convention discourages, so I lean towards a `--c2-markdown__caret--*` variable set with `content: none` to hide it.
