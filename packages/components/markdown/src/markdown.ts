import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { guard } from 'lit/directives/guard.js'
import { repeat } from 'lit/directives/repeat.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { DEFAULT_FLUSH_DURATION, DEFAULT_MAX_LAG, StreamRevealController, parseCssTime, type RevealMode } from '@c2n/core/stream-reveal.js'
import '@c2n/image'
import { lexBlocks } from './lex'
import type { MathMode } from './math-extension'
import { headingIds, renderBlock, type CodeMode, type ImagePolicy, type LazyModule, type RenderContext, type Renderer } from './render'
import { isExternal, type UrlTransform } from './safe-url'
import styles from './markdown.scss?inline'

export type { RevealMode } from '@c2n/core/stream-reveal.js'
export type { MathMode } from './math-extension'
export type { CodeMode, ImagePolicy, Renderer, RenderHelpers } from './render'
export type { UrlKind, UrlTransform } from './safe-url'

/** Events fired by {@link Markdown}, keyed for `addEventListener`. */
export interface MarkdownEventMap {
  'reveal-end': Event
  'link-click': CustomEvent<{ href: string; external: boolean; event: MouseEvent }>
}

export interface Markdown {
  addEventListener: TypedAddEventListener<Markdown, MarkdownEventMap>
  removeEventListener: TypedRemoveEventListener<Markdown, MarkdownEventMap>
}

const spaceSeparated = {
  fromAttribute: (value: string | null) => (value ? value.split(/\s+/).filter(Boolean) : []),
  toAttribute: (value: string[]) => value.join(' '),
}

const loaders: Record<LazyModule, () => Promise<unknown>> = {
  'code-viewer': () => import('@c2n/code-viewer'),
  math: () => import('@c2n/math'),
  mermaid: () => import('@c2n/mermaid'),
}
const tags: Record<LazyModule, string> = { 'code-viewer': 'c2-code-viewer', math: 'c2-math', mermaid: 'c2-mermaid' }

function isDefined(module: LazyModule): boolean {
  return !isServer && !!customElements.get(tags[module])
}

function stripIndent(text: string): string {
  const lines = text.replace(/^\s*\n|\n\s*$/g, '').split('\n')
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => /^\s*/.exec(line)![0].length))
  return lines.map((line) => line.slice(Number.isFinite(indent) ? indent : 0)).join('\n')
}

/**
 * Renders markdown (CommonMark and GitHub-flavoured: tables, task lists, strikethrough, autolinks) plus TeX math and
 * Mermaid diagrams, safely and while it streams.
 *
 * **Safe by construction.** The output is built from the parser's tokens as Lit templates from a fixed list of
 * elements; no markdown ever reaches `innerHTML`. Raw HTML in the source is shown as code, never interpreted. Links
 * and images only keep `http(s)`, relative and (links) `mailto:`/`tel:` URLs, after the optional `urlTransform`.
 * Images render as `c2-image`; `image-policy="click"` makes every image wait for a click (except `image-origins`),
 * which closes the image-URL data-exfiltration channel a prompt injection opens in model output.
 *
 * **Streaming.** Feed it with `appendText(chunk)` (or by setting `value`) while `streaming` is set. The text is
 * revealed at a steady pace by the same controller as `c2-streaming-text`, only the block still growing is
 * re-rendered (finished blocks keep their DOM, so a selection survives), and the unfinished tail is healed: `**bold`
 * renders bold, a half-typed link shows its label, an unfinished image or diagram is held back, and an open code
 * fence shows as plain code until it closes. `reveal-end` fires once the stream has ended and the display caught up.
 *
 * **Composed.** Closed code fences render through `c2-code-viewer` (highlighted, copyable), `mermaid` fences through
 * `c2-mermaid`, `$…$`, `$$…$$`, `\(…\)` and `\[…\]` through `c2-math`; each loads on first use. Their own `--c2-…`
 * variables, set on this element, style every block.
 *
 * The source is the `value` attribute or a child `<script type="text/markdown">` (indentation stripped).
 *
 * @tag c2-markdown
 *
 * @csspart body - Container of the rendered blocks.
 * @csspart heading - Every heading.
 * @csspart paragraph - Every paragraph.
 * @csspart link - Every link.
 * @csspart blockquote - Every block quote.
 * @csspart list - Every bulleted, numbered or task list.
 * @csspart table - Every table.
 * @csspart code-block - Every code block: a `c2-code-viewer`, or a plain `<pre>` while streaming or with `code="plain"`.
 * @csspart raw-html - Raw HTML from the source, shown as inline code.
 * @csspart caret - Caret at the end of the text while it streams. Draws `--c2-markdown__caret--content`.
 *
 * @event {Event} reveal-end - Fired once per stream, when `streaming` is false and the display has caught up with the received text.
 * @event {CustomEvent<{ href: string; external: boolean; event: MouseEvent }>} link-click - Cancelable. A link was clicked; cancel it to route the link yourself or confirm before leaving.
 *
 * @cssproperty {color} [--c2-markdown--color=inherit] - Inherits, so an answer takes the colour of the bubble or card it sits in.
 * @cssproperty {font-family} [--c2-markdown--font-family=inherit]
 * @cssproperty {pixel} [--c2-markdown--font-size=14px]
 * @cssproperty {line-height} [--c2-markdown--line-height=1.6]
 * @cssproperty {pixel} [--c2-markdown--block-gap=12px] - Space between blocks.
 *
 * @cssproperty {color} [--c2-markdown__heading--color=inherit]
 * @cssproperty {font-weight} [--c2-markdown__heading--font-weight=600]
 * @cssproperty {line-height} [--c2-markdown__heading--line-height=1.3]
 * @cssproperty {pixel} [--c2-markdown__heading--margin-top=24px] - Extra space above a heading that follows other blocks.
 * @cssproperty {pixel} [--c2-markdown__h1--font-size=24px]
 * @cssproperty {pixel} [--c2-markdown__h2--font-size=20px]
 * @cssproperty {pixel} [--c2-markdown__h3--font-size=17px]
 * @cssproperty {pixel} [--c2-markdown__h4--font-size=15px]
 * @cssproperty {pixel} [--c2-markdown__h5--font-size=14px]
 * @cssproperty {pixel} [--c2-markdown__h6--font-size=13px]
 *
 * @cssproperty {color} [--c2-markdown__link--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-markdown__link__hover--color=rgb(1, 84, 184)]
 * @cssproperty {text-decoration} [--c2-markdown__link--text-decoration=underline]
 * @cssproperty {color} [--c2-markdown__link__pending--color=#71717a] - A link whose URL is still streaming in.
 * @cssproperty {outline} [--c2-markdown__link__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 *
 * @cssproperty {font-family} [--c2-markdown__code--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {pixel} [--c2-markdown__code--font-size=0.9em]
 * @cssproperty {color} [--c2-markdown__code--color=#18181b]
 * @cssproperty {background} [--c2-markdown__code--background=#f4f4f5]
 * @cssproperty {border-radius} [--c2-markdown__code--border-radius=4px]
 * @cssproperty {padding} [--c2-markdown__code--padding=1px 5px]
 * @cssproperty {color} [--c2-markdown__raw-html--color=#71717a] - Raw HTML from the source, shown as code.
 * @cssproperty {background} [--c2-markdown__raw-html--background=#f4f4f5]
 *
 * @cssproperty {background} [--c2-markdown__code-block--background=#fafafa] - Plain code blocks (streaming or `code="plain"`).
 * @cssproperty {border} [--c2-markdown__code-block--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-markdown__code-block--border-radius=8px]
 * @cssproperty {padding} [--c2-markdown__code-block--padding=12px 16px]
 * @cssproperty {pixel} [--c2-markdown__code-block--font-size=13px]
 *
 * @cssproperty {border} [--c2-markdown__blockquote--border-left=3px solid #e4e4e7]
 * @cssproperty {color} [--c2-markdown__blockquote--color=#71717a]
 * @cssproperty {padding} [--c2-markdown__blockquote--padding-left=12px]
 *
 * @cssproperty {padding} [--c2-markdown__list--padding-left=24px]
 * @cssproperty {pixel} [--c2-markdown__list--item-gap=4px]
 * @cssproperty {color} [--c2-markdown__list__marker--color=#71717a]
 * @cssproperty {border} [--c2-markdown__task--border=1px solid #bcbcc6]
 * @cssproperty {color} [--c2-markdown__task__checked--background=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-markdown__task__checked--color=#ffffff]
 *
 * @cssproperty {border} [--c2-markdown__table--border=1px solid #e4e4e7]
 * @cssproperty {background} [--c2-markdown__table__header--background=#fafafa]
 * @cssproperty {font-weight} [--c2-markdown__table__header--font-weight=600]
 * @cssproperty {padding} [--c2-markdown__table__cell--padding=6px 12px]
 * @cssproperty {background} [--c2-markdown__table__row__striped--background=transparent] - Every other body row.
 *
 * @cssproperty {border} [--c2-markdown__hr--border-top=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-markdown__image--border-radius=8px] - Passed to each `c2-image`.
 * @cssproperty {width} [--c2-markdown__image--max-width=100%]
 *
 * @cssproperty {content} [--c2-markdown__caret--content='▍'] - Caret glyph. `none` hides the caret.
 * @cssproperty {color} [--c2-markdown__caret--color=rgb(2, 101, 220)]
 * @cssproperty {pixel} [--c2-markdown__caret--margin-left=1px]
 * @cssproperty {time} [--c2-markdown__caret--blink-duration=1s] - `0s` keeps the caret solid.
 * @cssproperty {time} [--c2-markdown__block--enter-duration=150ms] - Fade-in of each new block while streaming. `0s` turns it off.
 * @cssproperty {time} [--c2-markdown__reveal--max-lag=600ms] - Longest the display may trail the received text while streaming.
 * @cssproperty {time} [--c2-markdown__reveal--flush-duration=300ms] - Time to release the rest once `streaming` turns false.
 */
@customElement('c2-markdown')
export class Markdown extends LitElement {
  static override styles = unsafeCSS(styles)

  /** More text is coming: heals the unfinished tail, shows the caret and marks the element busy. False flushes and renders the final text. */
  @property({ type: Boolean }) streaming = false

  /** `smooth` paces streamed text; `instant` shows each chunk as it arrives. Reduced motion always behaves as `instant`. */
  @property() reveal: RevealMode = 'smooth'

  /** `load` (default) loads images lazily; `click` makes each image wait for a click, except those from `image-origins`. */
  @property({ attribute: 'image-policy' }) imagePolicy: ImagePolicy = 'load'

  /** Origins whose images load without a click under `image-policy="click"` (space-separated in the attribute). */
  @property({ attribute: 'image-origins', converter: spaceSeparated }) imageOrigins: string[] = []

  /** Rewrites or drops link and image URLs after the protocol check: return a new URL (a proxy) or `null`. */
  @property({ attribute: false }) urlTransform?: UrlTransform

  /** Math delimiters: `dollar` (all of `$…$`, `$$…$$`, `\(…\)`, `\[…\]`), `bracket` (backslash forms only) or `off`. */
  @property() math: MathMode = 'dollar'

  /** A single newline becomes a line break, as most chat interfaces expect. */
  @property({ type: Boolean }) breaks = false

  /** Shifts heading levels so a `#` inside a card is not the page's `<h1>`. Capped at h6. */
  @property({ type: Number, attribute: 'heading-offset' }) headingOffset = 0

  /** Gives headings GitHub-style ids and an anchor link shown on hover. */
  @property({ type: Boolean, attribute: 'heading-anchors' }) headingAnchors = false

  /** `viewer` renders closed code fences through `c2-code-viewer`; `plain` as a styled `<pre>` that never loads shiki. */
  @property() code: CodeMode = 'viewer'

  /** Custom templates for token types (`link`, `heading`, `code`, …). */
  @property({ attribute: false }) renderers?: Partial<Record<string, Renderer>>

  @state() private ready: Record<LazyModule, boolean> = { 'code-viewer': isDefined('code-viewer'), math: isDefined('math'), mermaid: isDefined('mermaid') }
  @state() private textSource = ''

  private readonly internals = this.attachInternals()
  private readonly controller = new StreamRevealController(this, {
    maxLag: DEFAULT_MAX_LAG,
    flushDuration: DEFAULT_FLUSH_DURATION,
    onRevealEnd: () => this.dispatchEvent(new Event('reveal-end', { bubbles: true, composed: true })),
  })
  private valueSet = false
  private needs = new Set<LazyModule>()
  private loading = new Set<LazyModule>()
  private mutations?: MutationObserver
  private reducedMotion: MediaQueryList | null = null
  /** Upgraded over a server-rendered shadow root: the first render repeats the server's source so Lit can hydrate. */
  private hydrating = !isServer && !!this.shadowRoot

  /** Markdown source received so far. Setting a value that extends the current one appends to the stream. */
  @property({ noAccessor: true })
  get value(): string {
    return this.controller.text
  }

  set value(next: string | null | undefined) {
    const old = this.controller.text
    this.valueSet = next !== null && next !== undefined
    this.controller.set(next ?? this.textSource)
    this.requestUpdate('value', old)
  }

  /** The markdown source received so far (same as `value`). */
  get text(): string {
    return this.controller.text
  }

  /** Adds a chunk to the stream. */
  appendText(chunk: string): void {
    const old = this.controller.text
    this.valueSet = true
    this.controller.push(chunk)
    this.requestUpdate('value', old)
  }

  /** Clears the source and the reveal. */
  clear(): void {
    this.value = ''
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (isServer) return
    this.readScript()
    this.mutations ??= new MutationObserver(() => this.readScript())
    this.mutations.observe(this, { childList: true, characterData: true, subtree: true })
    this.reducedMotion ??= window.matchMedia('(prefers-reduced-motion: reduce)')
    this.reducedMotion.addEventListener('change', this.handleMotionChange)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.mutations?.disconnect()
    this.reducedMotion?.removeEventListener('change', this.handleMotionChange)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.controller.smooth = this.reveal !== 'instant' && !this.reducedMotion?.matches
    if (changed.has('streaming')) {
      if (this.streaming) {
        this.readTimings()
        this.controller.start()
      } else if (changed.get('streaming') !== undefined) this.controller.end()
    }
  }

  override render() {
    const pending = this.streaming || this.controller.pending
    const source = this.hydrating ? (this.valueSet ? this.controller.text : '') : this.controller.text.slice(0, this.controller.revealed)
    const { blocks, links, tailStart } = lexBlocks(source, { breaks: this.breaks, math: this.math }, pending)
    this.needs.clear()
    const ctx: RenderContext = {
      headingOffset: this.headingOffset,
      headingIds: this.headingAnchors ? headingIds(blocks) : null,
      imagePolicy: this.imagePolicy,
      imageOrigins: this.imageOrigins,
      urlTransform: this.urlTransform,
      code: this.code,
      ready: this.ready,
      need: (module) => this.needs.add(module),
      renderers: this.renderers,
    }
    // Everything a finished block's template depends on besides its own source.
    const version = JSON.stringify([
      links,
      this.headingOffset,
      this.headingAnchors,
      this.imagePolicy,
      this.imageOrigins,
      this.code,
      this.ready,
      this.math,
      this.breaks,
    ])
    const caretAt = pending ? blocks.length - 1 : -1
    const body = repeat(
      blocks,
      (_, index) => index,
      (block, index) =>
        guard([block.raw, version, this.urlTransform, this.renderers, tailStart >= 0 && index >= tailStart, index === caretAt], () =>
          renderBlock(block, ctx, index === caretAt),
        ),
    )
    return html`<div class="body" part="body">
      ${body}${pending && blocks.length === 0 ? html`<span class="caret" part="caret" aria-hidden="true"></span>` : nothing}
    </div>`
  }

  protected override firstUpdated(): void {
    this.renderRoot.addEventListener('click', this.handleClick as EventListener)
    this.readTimings()
  }

  protected override updated(): void {
    if (this.hydrating) {
      this.hydrating = false
      this.requestUpdate()
    }
    const busy = this.streaming || this.controller.pending
    this.internals.ariaBusy = busy ? 'true' : null
    try {
      if (busy) this.internals.states.add('streaming')
      else this.internals.states.delete('streaming')
    } catch {
      // Custom states are an enhancement: without them new blocks simply do not fade in.
    }
    for (const module of this.needs) this.loadModule(module)
  }

  private readonly handleMotionChange = () => this.requestUpdate()

  private readScript(): void {
    const script = this.querySelector('script[type="text/markdown"]')
    const text = script ? stripIndent(script.textContent ?? '') : ''
    if (text === this.textSource) return
    this.textSource = text
    if (!this.valueSet) {
      const old = this.controller.text
      this.controller.set(text)
      this.requestUpdate('value', old)
    }
  }

  private readTimings(): void {
    const body = this.renderRoot?.querySelector<HTMLElement>('.body')
    if (!body) return
    const computed = getComputedStyle(body)
    this.controller.maxLag = parseCssTime(computed.getPropertyValue('--_max-lag'), DEFAULT_MAX_LAG)
    this.controller.flushDuration = parseCssTime(computed.getPropertyValue('--_flush-duration'), DEFAULT_FLUSH_DURATION)
  }

  private loadModule(module: LazyModule): void {
    if (this.ready[module] || this.loading.has(module)) return
    this.loading.add(module)
    const done = () => {
      this.loading.delete(module)
      this.ready = { ...this.ready, [module]: true }
    }
    if (isDefined(module)) done()
    else void loaders[module]().then(done, () => this.loading.delete(module))
  }

  private readonly handleClick = (event: MouseEvent) => {
    const anchor = event.composedPath().find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement && this.renderRoot.contains(node))
    if (!anchor) return
    const href = anchor.getAttribute('href') ?? ''
    const external = isExternal(href)
    const request = new CustomEvent('link-click', { detail: { href, external, event }, bubbles: true, composed: true, cancelable: true })
    if (!this.dispatchEvent(request)) {
      event.preventDefault()
      return
    }
    // Ids live in this shadow root, where the document's fragment navigation cannot find them.
    if (href.startsWith('#')) {
      const target = (this.renderRoot as ShadowRoot).getElementById(decodeURIComponent(href.slice(1)))
      if (target) {
        event.preventDefault()
        target.scrollIntoView({ block: 'start' })
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-markdown': Markdown
  }
}
