import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import temml from 'temml'
import temmlStyles from './temml.css?inline'
import styles from './math.scss?inline'

/** Events fired by {@link MathFormula}, keyed for `addEventListener`. */
export interface MathEventMap {
  'math-error': CustomEvent<{ message: string; position?: number }>
}

export interface MathFormula {
  addEventListener: TypedAddEventListener<MathFormula, MathEventMap>
  removeEventListener: TypedRemoveEventListener<MathFormula, MathEventMap>
}

export interface MathConfig {
  /** Macros every `c2-math` on the page knows, e.g. `{ '\\RR': '\\mathbb{R}' }`. An element's own `macros` win. */
  macros?: Record<string, string>
}

const config: MathConfig = {}

/** Sets page-wide defaults for every `c2-math`; elements already rendered pick them up on their next render. */
export function configureMath(next: MathConfig): void {
  Object.assign(config, next)
}

/** Expansion and size limits that stop a hostile formula (`\def\a{\a\a}\a`, a huge `\rule`) from hanging the page. */
const MAX_EXPAND = 1000
const MAX_SIZE: [number, number] = [Infinity, 200]

function stripIndent(text: string): string {
  const lines = text.replace(/^\s*\n|\n\s*$/g, '').split('\n')
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => /^\s*/.exec(line)![0].length))
  return lines.map((line) => line.slice(Number.isFinite(indent) ? indent : 0)).join('\n')
}

/**
 * A TeX formula rendered as native MathML by [Temml](https://temml.org): the browser lays it out with the system math
 * font and exposes it to assistive technology, so there is no font CSS and no HTML layout to ship. Write the TeX in the
 * `value` attribute or as the element's text (a `<script type="math/tex">` child keeps the browser from parsing it);
 * `display` renders a centred block formula instead of an inline one.
 *
 * Untrusted input is safe: links, images, classes, ids and styles from TeX (`\href`, `\includegraphics`, `\class`, …)
 * are rejected, expansion and sizes are capped, and the output is built as DOM nodes, never parsed from a string. A
 * formula that does not parse shows its source in the error style and fires `math-error`. Copying a whole formula
 * puts its TeX on the clipboard as text and its MathML as HTML. On the server the TeX source renders as code until
 * the element upgrades.
 *
 * @tag c2-math
 *
 * @csspart math - The rendered MathML formula.
 * @csspart error - Shown instead of the formula when the source does not parse: the TeX source in the error style.
 *
 * @event {CustomEvent<{ message: string; position?: number }>} math-error - The source failed to parse. `position` is the offset of the problem when known.
 *
 * @cssproperty {font-family} [--c2-math--font-family=Cambria Math, STIX Two Math, STIXTwoMath-Regular, NotoSansMath-Regular, math]
 * @cssproperty {pixel} [--c2-math--font-size=1.1em] - Math fonts run small next to body text.
 * @cssproperty {color} [--c2-math--color=inherit]
 * @cssproperty {margin} [--c2-math__display--margin=12px 0] - Space around a `display` formula.
 * @cssproperty {text-align} [--c2-math__display--text-align=center]
 * @cssproperty {color} [--c2-math__error--color=rgb(211, 21, 16)]
 * @cssproperty {background} [--c2-math__error--background=rgba(211, 21, 16, 0.08)]
 * @cssproperty {font-family} [--c2-math__error--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {pixel} [--c2-math__error--font-size=0.9em]
 * @cssproperty {border-radius} [--c2-math__error--border-radius=4px]
 * @cssproperty {outline} [--c2-math__scroller__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of a display formula that overflows and scrolls.
 */
@customElement('c2-math')
export class MathFormula extends LitElement {
  static override styles = [unsafeCSS(temmlStyles), unsafeCSS(styles)]

  /** TeX source. When unset, the element's text content is used. */
  @property() value?: string

  /** Block (display) style, centred on its own line. Inline when false. */
  @property({ type: Boolean, reflect: true }) display = false

  /** Macros for this formula, e.g. `{ '\\RR': '\\mathbb{R}' }`. Page-wide ones come from `configureMath`. */
  @property({ attribute: false }) macros?: Record<string, string>

  @state() private error: string | null = null
  @state() private overflowing = false
  @state() private textSource = ''

  private renderedKey = ''
  /** Upgraded over a server-rendered shadow root: the first render must repeat the server's template to hydrate. */
  private hydrating = !isServer && !!this.shadowRoot
  private mutations?: MutationObserver
  private resize?: ResizeObserver

  /** The TeX source being rendered. */
  get text(): string {
    return this.value ?? this.textSource
  }

  /** The rendered MathML as markup, or an empty string when the source did not parse. */
  get mathml(): string {
    return this.renderRoot.querySelector('math')?.outerHTML ?? ''
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (isServer) return
    this.readText()
    this.mutations ??= new MutationObserver(() => this.readText())
    this.mutations.observe(this, { childList: true, characterData: true, subtree: true })
    this.addEventListener('copy', this.handleCopy)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.mutations?.disconnect()
    this.resize?.disconnect()
    this.removeEventListener('copy', this.handleCopy)
  }

  override render() {
    const source = this.text
    if (this.error !== null || isServer || this.hydrating) {
      return html`<code class="error" part="error" title=${this.error ?? nothing}>${source}</code>`
    }
    return html`<span class="scroller" tabindex=${this.display && this.overflowing ? '0' : nothing}><span class="math" part="math"></span></span>`
  }

  protected override updated(_changed: PropertyValues<this>): void {
    if (this.hydrating) {
      this.hydrating = false
      this.requestUpdate()
      return
    }
    const container = this.renderRoot.querySelector<HTMLElement>('.math')
    const key = JSON.stringify([this.text, this.display, this.macros, config.macros])
    if (key === this.renderedKey && (container?.firstChild || this.error !== null)) return
    this.renderedKey = key
    this.typeset(container)
  }

  private typeset(container: HTMLElement | null): void {
    const source = this.text
    try {
      // Render into a detached node first so a failure leaves the previous formula (or the error) in place.
      const target = document.createElement('span')
      temml.render(source, target, {
        displayMode: this.display,
        annotate: true,
        throwOnError: true,
        trust: false,
        strict: false,
        maxExpand: MAX_EXPAND,
        maxSize: MAX_SIZE,
        macros: { ...config.macros, ...this.macros },
      })
      if (this.error !== null) {
        // Leaving the error state re-renders the container; typeset again once it exists.
        this.renderedKey = ''
        this.error = null
        return
      }
      container?.replaceChildren(...target.childNodes)
      this.observeOverflow()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const position = typeof (cause as { position?: unknown }).position === 'number' ? (cause as { position: number }).position : undefined
      this.error = message
      this.dispatchEvent(new CustomEvent('math-error', { detail: { message, position }, bubbles: true, composed: true }))
    }
  }

  private readText(): void {
    const script = this.querySelector('script[type="math/tex"]')
    const text = stripIndent((script ?? this).textContent ?? '')
    if (text !== this.textSource) this.textSource = text
  }

  private observeOverflow(): void {
    if (!this.display) return
    const scroller = this.renderRoot.querySelector<HTMLElement>('.scroller')
    if (!scroller) return
    this.resize ??= new ResizeObserver(() => {
      const current = this.renderRoot.querySelector<HTMLElement>('.scroller')
      this.overflowing = !!current && current.scrollWidth > current.clientWidth + 1
    })
    this.resize.disconnect()
    this.resize.observe(scroller)
    const math = scroller.querySelector('math')
    if (math) this.resize.observe(math)
  }

  /** A selection inside one formula copies its TeX as text and its MathML as HTML. */
  private readonly handleCopy = (event: ClipboardEvent) => {
    const selection = document.getSelection()
    if (!selection || selection.isCollapsed || !event.clipboardData || this.error !== null) return
    const within = (node: Node | null) => !!node && (node === this || this.contains(node) || this.renderRoot.contains(node))
    if (!within(selection.anchorNode) || !within(selection.focusNode)) return
    event.clipboardData.setData('text/plain', this.text)
    if (this.mathml) event.clipboardData.setData('text/html', this.mathml)
    event.preventDefault()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-math': MathFormula
  }
}
