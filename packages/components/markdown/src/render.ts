import { html, nothing, type TemplateResult } from 'lit'
import { html as staticHtml, literal, type StaticValue } from 'lit/static-html.js'
import type { Token, Tokens } from 'marked'
import { decodeEntities } from './entities'
import { PENDING_INFO, PENDING_MATH } from './heal'
import type { MathToken } from './math-extension'
import { PENDING_URL, isExternal, originOf, safeUrl, type UrlTransform } from './safe-url'

/** When images load: `load` lazily as they near the viewport, `click` only after the reader asks. */
export type ImagePolicy = 'load' | 'click'

/** How closed code fences render: through `c2-code-viewer` (highlighted, copyable), or as a plain `<pre>`. */
export type CodeMode = 'viewer' | 'plain'

/** A lazily loaded element a document needs. */
export type LazyModule = 'code-viewer' | 'math' | 'mermaid'

/** Helpers handed to a custom renderer so it can render a token's children the built-in way. */
export interface RenderHelpers {
  inline(tokens: Token[] | undefined): unknown
  blocks(tokens: Token[] | undefined): unknown
  /** Text of a token with character references decoded. */
  text(value: string): string
}

/** A custom renderer for one token type. Its output still goes through Lit, so it cannot reintroduce `innerHTML`. */
export type Renderer = (token: Token, helpers: RenderHelpers) => unknown

export interface RenderContext {
  headingOffset: number
  headingIds: Map<Token, string> | null
  imagePolicy: ImagePolicy
  imageOrigins: string[]
  urlTransform?: UrlTransform
  code: CodeMode
  /** Which lazy elements are defined; until they are, their content renders as plain code. */
  ready: Record<LazyModule, boolean>
  /** Called while rendering when a lazy element would be used. */
  need(module: LazyModule): void
  renderers?: Partial<Record<string, Renderer>>
}

let taskCount = 0

const HEADINGS: StaticValue[] = [literal`h1`, literal`h2`, literal`h3`, literal`h4`, literal`h5`, literal`h6`]

const caretTemplate = html`<span class="caret" part="caret" aria-hidden="true"></span>`

const checkIcon = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
</svg>`

/** GitHub-style heading slugs, numbered when they repeat. */
export function headingIds(blocks: Token[]): Map<Token, string> {
  const ids = new Map<Token, string>()
  const seen = new Map<string, number>()
  const visit = (tokens: Token[] | undefined) => {
    for (const token of tokens ?? []) {
      if (token.type === 'heading') {
        const base =
          decodeEntities((token as Tokens.Heading).text)
            .toLowerCase()
            .replace(/<[^>]*>/g, '')
            .replace(/[^\p{L}\p{N}\s_-]/gu, '')
            .trim()
            .replace(/\s/g, '-') || 'section'
        const count = seen.get(base) ?? 0
        seen.set(base, count + 1)
        ids.set(token, count ? `${base}-${count}` : base)
      } else if (token.type === 'blockquote' || token.type === 'list_item') visit((token as Tokens.Blockquote).tokens)
      else if (token.type === 'list') visit((token as Tokens.List).items as Token[])
    }
  }
  visit(blocks)
  return ids
}

function languageOf(info: string | undefined): { lang: string; pending: boolean } {
  const words = (info ?? '').trim().split(/\s+/)
  const pending = words.includes(PENDING_INFO)
  return { lang: words[0] === PENDING_INFO ? '' : (words[0] ?? ''), pending }
}

export function renderInline(tokens: Token[] | undefined, ctx: RenderContext): unknown {
  return (tokens ?? []).map((token) => inlineToken(token, ctx))
}

function inlineToken(token: Token, ctx: RenderContext): unknown {
  const custom = ctx.renderers?.[token.type]
  if (custom) return custom(token, helpers(ctx))
  switch (token.type) {
    case 'text': {
      const text = token as Tokens.Text
      return text.tokens ? renderInline(text.tokens, ctx) : decodeEntities(text.text)
    }
    case 'escape':
      return (token as Tokens.Escape).text
    case 'strong':
      return html`<strong>${renderInline((token as Tokens.Strong).tokens, ctx)}</strong>`
    case 'em':
      return html`<em>${renderInline((token as Tokens.Em).tokens, ctx)}</em>`
    case 'del':
      return html`<del>${renderInline((token as Tokens.Del).tokens, ctx)}</del>`
    case 'codespan':
      return html`<code class="code">${decodeEntities((token as Tokens.Codespan).text)}</code>`
    case 'br':
      return html`<br />`
    case 'html':
      // Raw HTML is shown as code, never interpreted.
      return html`<code class="raw-html" part="raw-html">${(token as Tokens.HTML).text}</code>`
    case 'link':
      return renderLink(token as Tokens.Link, ctx)
    case 'image':
      return renderImage(token as Tokens.Image, ctx)
    case 'mathInline':
      return renderMath(token as unknown as MathToken, ctx)
    default:
      return token.raw
  }
}

function renderLink(token: Tokens.Link, ctx: RenderContext): unknown {
  const label = renderInline(token.tokens, ctx)
  if (token.href.startsWith(PENDING_URL)) return html`<span class="link link--pending">${label}</span>`
  const href = safeUrl(decodeEntities(token.href), 'link', ctx.urlTransform)
  if (!href) return html`<span class="link link--blocked">${label}</span>`
  const external = isExternal(href)
  return html`<a
    class="link"
    part="link"
    href=${href}
    title=${token.title ? decodeEntities(token.title) : nothing}
    target=${external ? '_blank' : nothing}
    rel=${external ? 'noopener noreferrer nofollow' : nothing}
    >${label}</a
  >`
}

function renderImage(token: Tokens.Image, ctx: RenderContext): unknown {
  const alt = decodeEntities(token.text)
  const src = safeUrl(decodeEntities(token.href), 'image', ctx.urlTransform)
  if (!src) return alt
  const click = ctx.imagePolicy === 'click' && !ctx.imageOrigins.includes(originOf(src))
  return html`<c2-image
    class="image"
    src=${src}
    alt=${alt}
    title=${token.title ? decodeEntities(token.title) : nothing}
    referrerpolicy="no-referrer"
    loading=${click ? 'click' : 'lazy'}
  ></c2-image>`
}

function renderMath(token: MathToken, ctx: RenderContext): unknown {
  if (!ctx.ready.math) {
    ctx.need('math')
    return html`<code class="math-source">${token.text}</code>`
  }
  return html`<c2-math
    class=${token.display && token.type === 'mathBlock' ? 'block math-block' : 'math'}
    ?display=${token.display}
    .value=${token.text}
  ></c2-math>`
}

function helpers(ctx: RenderContext): RenderHelpers {
  return {
    inline: (tokens) => renderInline(tokens, ctx),
    blocks: (tokens) => (tokens ?? []).map((token, index, all) => renderBlock(token, ctx, false, index === all.length - 1)),
    text: decodeEntities,
  }
}

/** Renders the children of a container block; the caret, if any, goes to its last child. */
function renderChildren(tokens: Token[] | undefined, ctx: RenderContext, caret: boolean): unknown {
  const list = (tokens ?? []).filter((token) => token.type !== 'space')
  return list.map((token, index) => renderBlock(token, ctx, caret && index === list.length - 1, false))
}

/**
 * Renders one block token. `caret` puts the streaming caret at the end of this block's last line; `top` marks a
 * top-level block, whose element carries the `block` class the enter animation and spacing apply to.
 */
export function renderBlock(token: Token, ctx: RenderContext, caret = false, top = true): unknown {
  const custom = ctx.renderers?.[token.type]
  if (custom) return custom(token, helpers(ctx))
  const block = top ? 'block' : ''
  const tail = caret ? caretTemplate : nothing
  switch (token.type) {
    case 'heading': {
      const heading = token as Tokens.Heading
      const tag = HEADINGS[Math.min(6, Math.max(1, heading.depth + ctx.headingOffset)) - 1]
      const id = ctx.headingIds?.get(token)
      return staticHtml`<${tag} class="heading ${block}" part="heading" id=${id ?? nothing}
        >${renderInline(heading.tokens, ctx)}${tail}${id ? html`<a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>` : nothing}</${tag}
      >`
    }
    case 'paragraph':
      return html`<p class="paragraph ${block}" part="paragraph">${renderInline((token as Tokens.Paragraph).tokens, ctx)}${tail}</p>`
    case 'text': {
      // A tight list item's content: inline, without a paragraph.
      const text = token as Tokens.Text
      return html`${text.tokens ? renderInline(text.tokens, ctx) : decodeEntities(text.text)}${tail}`
    }
    case 'blockquote':
      return html`<blockquote class="blockquote ${block}" part="blockquote">${renderChildren((token as Tokens.Blockquote).tokens, ctx, caret)}</blockquote>`
    case 'list':
      return renderList(token as Tokens.List, ctx, caret, block)
    case 'code':
      return renderCode(token as Tokens.Code, ctx, caret, block)
    case 'mathBlock':
      return html`${renderMath(token as unknown as MathToken, ctx)}${tail}`
    case 'table':
      return renderTable(token as Tokens.Table, ctx, caret, block)
    case 'hr':
      return html`<hr class="rule ${block}" />`
    case 'html':
      // A raw HTML block is shown as HTML source, never interpreted.
      return renderCode(
        { type: 'code', raw: token.raw, lang: 'html', text: (token as Tokens.HTML).text.replace(/\n+$/, '') },
        ctx,
        caret,
        `${block} raw-html-block`,
      )
    default:
      return html`<p class="paragraph ${block}">${token.raw}${tail}</p>`
  }
}

function renderList(list: Tokens.List, ctx: RenderContext, caret: boolean, block: string): TemplateResult {
  const items = list.items.map((item, index) => {
    const last = index === list.items.length - 1
    const content = item.tokens.filter((token) => token.type !== 'checkbox')
    if (!item.task) return html`<li>${renderChildren(content, ctx, caret && last)}</li>`
    // The read-only checkbox is named by its item's text.
    const id = `c2-markdown-task-${++taskCount}`
    return html`<li class="task">
      <span
        class="task-box ${item.checked ? 'task-box--checked' : ''}"
        role="checkbox"
        aria-checked=${item.checked ? 'true' : 'false'}
        aria-disabled="true"
        aria-labelledby=${id}
        >${item.checked ? checkIcon : nothing}</span
      ><span class="task-text" id=${id}>${renderChildren(content, ctx, caret && last)}</span>
    </li>`
  })
  return list.ordered
    ? html`<ol class="list ${block}" part="list" start=${list.start !== '' && list.start !== 1 ? list.start : nothing}>
        ${items}
      </ol>`
    : html`<ul class="list ${block} ${list.items.some((item) => item.task) ? 'list--tasks' : ''}" part="list">
        ${items}
      </ul>`
}

function renderCode(code: Tokens.Code, ctx: RenderContext, caret: boolean, block: string): TemplateResult {
  const { lang, pending } = languageOf(code.lang)
  const text = code.text
  const plain = html`<pre class="code-block code-block--plain ${pending ? 'code-block--pending' : ''} ${block}" part="code-block"><code>${text}</code>${
    caret ? caretTemplate : nothing
  }</pre>`
  if (pending || lang === PENDING_MATH) return plain
  if (lang === 'mermaid') {
    if (!ctx.ready.mermaid) {
      ctx.need('mermaid')
      return plain
    }
    return html`<c2-mermaid class="diagram ${block}" .value=${text}></c2-mermaid>`
  }
  if (lang === 'math' || lang === 'tex' || lang === 'latex') {
    return html`${renderMath({ type: 'mathBlock', raw: code.raw, text, display: true }, ctx)}`
  }
  if (ctx.code === 'plain') return plain
  if (!ctx.ready['code-viewer']) {
    ctx.need('code-viewer')
    return plain
  }
  return html`<c2-code-viewer class="code-block ${block}" part="code-block" language=${lang || 'text'} copyable .code=${text}></c2-code-viewer>`
}

function renderTable(table: Tokens.Table, ctx: RenderContext, caret: boolean, block: string): TemplateResult {
  // Alignment through classes rather than inline styles, which a strict style-src CSP would block.
  const align = (value: string | null) => (value ? `align-${value}` : nothing)
  const lastRow = table.rows.length - 1
  return html`<div class="table-scroll ${block}" role="region" aria-label="Table" tabindex="0">
    <table class="table" part="table">
      <thead>
        <tr>
          ${table.header.map((cell) => html`<th class=${align(cell.align)}>${renderInline(cell.tokens, ctx)}</th>`)}
        </tr>
      </thead>
      ${
        table.rows.length
          ? html`<tbody>
              ${table.rows.map(
                (row, rowIndex) =>
                  html`<tr>
                    ${row.map(
                      (cell, cellIndex) =>
                        html`<td class=${align(cell.align)}>
                          ${renderInline(cell.tokens, ctx)}${caret && rowIndex === lastRow && cellIndex === row.length - 1 ? caretTemplate : nothing}
                        </td>`,
                    )}
                  </tr>`,
              )}
            </tbody>`
          : nothing
      }
    </table>
  </div>`
}
