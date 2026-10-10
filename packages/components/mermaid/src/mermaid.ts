import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { MermaidConfig } from 'mermaid'
import styles from './mermaid.scss?inline'
import { sanitizeSvg } from './sanitize-svg'

/** Events fired by {@link Mermaid}, keyed for `addEventListener`. */
export interface MermaidEventMap {
  'mermaid-render': CustomEvent<{ type: string }>
  'mermaid-error': CustomEvent<{ message: string }>
}

export interface Mermaid {
  addEventListener: TypedAddEventListener<Mermaid, MermaidEventMap>
  removeEventListener: TypedRemoveEventListener<Mermaid, MermaidEventMap>
}

type MermaidApi = (typeof import('mermaid'))['default']

let mermaidModule: Promise<MermaidApi> | undefined
/** Mermaid is large: it loads on the first diagram of the page, never with the element. */
function loadMermaid(): Promise<MermaidApi> {
  return (mermaidModule ??= import('mermaid').then((module) => module.default))
}

/**
 * `mermaid.initialize` is global, so two diagrams with different colours must not interleave: every render waits for
 * the previous one, then initializes with its own theme.
 */
let queue: Promise<unknown> = Promise.resolve()
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job)
  queue = run.catch(() => undefined)
  return run
}

/** Settings a diagram's `%%{init}%%` directive must never change. */
const SECURE_KEYS = [
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'suppressErrorRendering',
  'maxEdges',
  'htmlLabels',
  'theme',
  'themeVariables',
  'fontFamily',
  'flowchart',
  'look',
]

/** Probe properties that carry each theme colour, so `light-dark()` and `var()` chains resolve to concrete colours. */
const PROBE_COLORS = {
  primaryTextColor: 'color',
  primaryColor: 'background-color',
  primaryBorderColor: 'border-top-color',
  secondaryColor: 'border-right-color',
  tertiaryColor: 'border-bottom-color',
  lineColor: 'border-left-color',
  noteBkgColor: 'outline-color',
  background: 'text-decoration-color',
} as const

let diagramCount = 0

function stripIndent(text: string): string {
  const lines = text.replace(/^\s*\n|\n\s*$/g, '').split('\n')
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => /^\s*/.exec(line)![0].length))
  return lines.map((line) => line.slice(Number.isFinite(indent) ? indent : 0)).join('\n')
}

/**
 * A [Mermaid](https://mermaid.js.org) diagram (flowchart, sequence, class, state, ER, gantt, pie, …) drawn from its
 * text source, with colours taken from `--c2-mermaid…` variables that map onto the `@c2n/theme` tokens, so diagrams
 * follow light and dark mode and re-render when those colours change. Mermaid itself is loaded on the first diagram of
 * the page, not with the element.
 *
 * The source is treated as untrusted: Mermaid runs at `securityLevel: 'strict'` with plain-text labels, a diagram's
 * `%%{init}%%` directive cannot change those settings or the theme, and the returned SVG is parsed and stripped of
 * scripts, foreign objects, event handlers, links and external `url()`/`href` references before it is shown. A source
 * that does not parse shows its text and the message, and fires `mermaid-error`. Until the diagram is drawn (and on
 * the server) the source shows as code.
 *
 * @tag c2-mermaid
 *
 * @csspart diagram - Container of the rendered SVG; scrolls horizontally when the diagram is wider than the element.
 * @csspart source - The Mermaid source shown as code before the diagram is drawn, and next to the message when it fails.
 * @csspart error - The parse or render error message.
 *
 * @event {CustomEvent<{ type: string }>} mermaid-render - A diagram was drawn; `type` is Mermaid's diagram type (`flowchart-v2`, `sequence`, …).
 * @event {CustomEvent<{ message: string }>} mermaid-error - The source failed to parse or render.
 *
 * @cssproperty {font-family} [--c2-mermaid--font-family=inherit]
 * @cssproperty {pixel} [--c2-mermaid--font-size=14px]
 * @cssproperty {color} [--c2-mermaid--background=transparent] - Diagram background passed to Mermaid.
 * @cssproperty {padding} [--c2-mermaid--padding=0]
 * @cssproperty {border} [--c2-mermaid--border=0 solid transparent]
 * @cssproperty {border-radius} [--c2-mermaid--border-radius=0]
 * @cssproperty {color} [--c2-mermaid__node--background=#edf1fe]
 * @cssproperty {color} [--c2-mermaid__node--color=#18181b]
 * @cssproperty {color} [--c2-mermaid__node--border-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-mermaid__secondary--background=#f4f4f5] - Secondary fills (alternate nodes, sections, actors).
 * @cssproperty {color} [--c2-mermaid__tertiary--background=#ffffff] - Tertiary fills (clusters, subgraphs).
 * @cssproperty {color} [--c2-mermaid__edge--color=#71717a] - Edges and arrows.
 * @cssproperty {color} [--c2-mermaid__note--background=#fef9c3]
 * @cssproperty {color} [--c2-mermaid__source--color=#71717a] - Source text shown before the diagram is drawn.
 * @cssproperty {font-family} [--c2-mermaid__source--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {pixel} [--c2-mermaid__source--font-size=12px]
 * @cssproperty {color} [--c2-mermaid__error--color=rgb(211, 21, 16)]
 * @cssproperty {outline} [--c2-mermaid__diagram__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of a diagram that overflows and scrolls.
 */
@customElement('c2-mermaid')
export class Mermaid extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Mermaid source. When unset, the slotted `<script type="text/mermaid">` (or the element's text) is used. */
  @property() value?: string

  /** Accessible name of the diagram. Defaults to the diagram's `accTitle`, then "Diagram". */
  @property() label?: string

  @state() private textSource = ''
  @state() private status: 'pending' | 'rendered' | 'error' = 'pending'
  @state() private error = ''
  @state() private overflowing = false

  private svg: SVGSVGElement | null = null
  private renderToken = 0
  private frame = 0
  private renderedKey = ''
  private mutations?: MutationObserver
  private resize?: ResizeObserver

  /** The Mermaid source being rendered. */
  get text(): string {
    return this.value ?? this.textSource
  }

  /** The rendered SVG element, for export. `null` before the diagram is drawn or when it failed. */
  get svgElement(): SVGSVGElement | null {
    return this.svg
  }

  /** Draws the diagram again, for instance after a theme change the element cannot observe. */
  refresh(): void {
    this.renderedKey = ''
    this.schedule()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (isServer) return
    this.readText()
    this.mutations ??= new MutationObserver(() => this.readText())
    this.mutations.observe(this, { childList: true, characterData: true, subtree: true })
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.mutations?.disconnect()
    this.resize?.disconnect()
    cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  override render() {
    const source = this.text
    return html`<span class="probe" aria-hidden="true" @transitionend=${this.handleThemeChange}></span>
      ${this.status === 'rendered' ? nothing : html`<pre class="source" part="source">${source}</pre>`}
      ${this.status === 'error' ? html`<p class="error" part="error">${this.error}</p>` : nothing}
      <div class="diagram" part="diagram" tabindex=${this.overflowing ? '0' : nothing} ?hidden=${this.status !== 'rendered'}></div>`
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has('value') || changed.has('textSource') || changed.has('label') || !this.renderedKey) this.schedule()
  }

  private readText(): void {
    const script = this.querySelector('script[type="text/mermaid"]')
    const text = stripIndent((script ?? this).textContent ?? '')
    if (text !== this.textSource) this.textSource = text
  }

  private readonly handleThemeChange = (event: TransitionEvent) => {
    if (event.target !== event.currentTarget) return
    this.refresh()
  }

  private schedule(): void {
    if (isServer || this.frame || !this.isConnected) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      void this.draw()
    })
  }

  private themeVariables(): Record<string, string> {
    const probe = this.renderRoot.querySelector<HTMLElement>('.probe')
    const variables: Record<string, string> = {}
    if (!probe) return variables
    const computed = getComputedStyle(probe)
    for (const [key, cssProperty] of Object.entries(PROBE_COLORS)) variables[key] = computed.getPropertyValue(cssProperty)
    variables.fontFamily = computed.fontFamily
    variables.fontSize = computed.fontSize
    variables.nodeTextColor = variables.primaryTextColor
    variables.textColor = variables.primaryTextColor
    variables.noteTextColor = variables.primaryTextColor
    return variables
  }

  private async draw(): Promise<void> {
    const source = this.text.trim()
    const themeVariables = this.themeVariables()
    const key = JSON.stringify([source, themeVariables, this.label])
    if (key === this.renderedKey) return
    this.renderedKey = key
    const token = ++this.renderToken
    if (!source) {
      this.status = 'pending'
      return
    }
    try {
      const mermaid = await loadMermaid()
      const id = `c2-mermaid-${++diagramCount}`
      const result = await enqueue(async () => {
        const config: MermaidConfig = {
          startOnLoad: false,
          securityLevel: 'strict',
          htmlLabels: false,
          suppressErrorRendering: true,
          theme: 'base',
          themeVariables,
          fontFamily: themeVariables.fontFamily,
          secure: SECURE_KEYS,
        }
        mermaid.initialize(config)
        return mermaid.render(id, source)
      })
      if (token !== this.renderToken) return
      const svg = sanitizeSvg(result.svg)
      if (!svg) throw new Error('Mermaid returned no diagram')
      if (this.label) svg.setAttribute('aria-label', this.label)
      else if (!svg.querySelector(':scope > title')) svg.setAttribute('aria-label', 'Diagram')
      this.status = 'rendered'
      await this.updateComplete
      const container = this.renderRoot.querySelector<HTMLElement>('.diagram')
      container?.replaceChildren(svg)
      this.svg = svg
      this.observeOverflow(container)
      this.dispatchEvent(new CustomEvent('mermaid-render', { detail: { type: result.diagramType }, bubbles: true, composed: true }))
    } catch (cause) {
      if (token !== this.renderToken) return
      const message = cause instanceof Error ? cause.message : String(cause)
      this.svg = null
      this.status = 'error'
      this.error = message
      this.dispatchEvent(new CustomEvent('mermaid-error', { detail: { message }, bubbles: true, composed: true }))
    }
  }

  private observeOverflow(container: HTMLElement | null): void {
    if (!container) return
    this.resize ??= new ResizeObserver(() => {
      const current = this.renderRoot.querySelector<HTMLElement>('.diagram')
      this.overflowing = !!current && current.scrollWidth > current.clientWidth + 1
    })
    this.resize.disconnect()
    this.resize.observe(container)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-mermaid': Mermaid
  }
}
