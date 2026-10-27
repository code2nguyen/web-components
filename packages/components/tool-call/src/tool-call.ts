import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController, redispatchEvent } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { toolCallMessages } from './messages'
import styles from './tool-call.scss?inline'

/** Where the call is: queued or still receiving its input, running, finished, failed, or stopped before it finished. */
export type ToolCallState = 'pending' | 'running' | 'success' | 'error' | 'cancelled'

const STATES: readonly ToolCallState[] = ['pending', 'running', 'success', 'error', 'cancelled']

/** Events fired by {@link ToolCall}, keyed for `addEventListener`. */
export interface ToolCallEventMap {
  toggle: ToggleEvent
}

export interface ToolCall {
  addEventListener: TypedAddEventListener<ToolCall, ToolCallEventMap>
  removeEventListener: TypedRemoveEventListener<ToolCall, ToolCallEventMap>
}

/**
 * Reads `input` and `output` from an attribute as JSON when it holds an object or an array, and keeps any other text as
 * it is: a tool's output is often plain text, and one that prints `null` or `7` must show that, not a parsed value.
 */
const valueConverter = {
  fromAttribute: (value: string | null): unknown => {
    if (value === null) return undefined
    if (!/^\s*[[{]/.test(value)) return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  },
  toAttribute: (value: unknown): string | null => (value === undefined ? null : typeof value === 'string' ? value : JSON.stringify(value)),
}

/** A value as the call shows it: text as it is, anything else as indented JSON. */
export function formatToolValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    // A value that cannot be stringified (a cycle, a BigInt) is still shown, as its own text.
    return String(value)
  }
}

const ICONS: Record<ToolCallState, ReturnType<typeof svg>> = {
  pending: svg`<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2.7" />`,
  running: svg`<circle class="spin-track" cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" /><path class="spin-arc" d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />`,
  success: svg`<circle cx="8" cy="8" r="6.5" fill="currentColor" /><path d="M5 8.2l2 2 4-4.2" fill="none" stroke="var(--_on-status)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`,
  error: svg`<circle cx="8" cy="8" r="6.5" fill="currentColor" /><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" fill="none" stroke="var(--_on-status)" stroke-width="1.5" stroke-linecap="round" />`,
  cancelled: svg`<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M4 12L12 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />`,
}

/**
 * One step an AI agent took with a tool, as a collapsible card: the tool's name and what it did on one line, its
 * state, and, when opened, the input it was called with and the output it returned. Like the steps in Claude and
 * ChatGPT, or the Tool element of the Vercel AI SDK.
 *
 * `state` moves the card through `pending` (queued, or its input still streaming in), `running`, `success`, `error`
 * and `cancelled`, each with its own mark and a translatable word, so the colour is never the only signal. `input` and
 * `output` take any value, as a property or as JSON in the attribute: text shows as it is and anything else as indented
 * JSON, in a box that scrolls past `--c2-tool-call__code--max-height`. The `input` and `output` slots replace them with
 * richer content, such as a `c2-json-viewer` or rendered Markdown. A failed call shows `error-text` in place of the
 * output.
 *
 * The card is a native `<details>`, so the header is a button that opens and closes it from the keyboard and a screen
 * reader hears its expanded state. Content in the `actions` slot sits under the header and stays visible while the card
 * is closed: the place for Approve and Deny when a call waits on the user.
 *
 * @tag c2-tool-call
 *
 * @slot icon - The tool's own icon, before its name.
 * @slot description - Replaces `description`, the one line on what the call did.
 * @slot input - Replaces the formatted `input`.
 * @slot output - Replaces the formatted `output` (and `error-text`).
 * @slot actions - Controls under the header, visible while the card is closed, such as Approve and Deny.
 *
 * @event {ToggleEvent} toggle - Re-dispatched from the native details after the card opens or closes (`newState` is `open` or `closed`).
 *
 * @csspart card - The card's box, a native `<details>`.
 * @csspart header - The clickable header row, a native `<summary>`.
 * @csspart status - The state's mark.
 * @csspart name - The tool's name.
 * @csspart description - Component-owned region in the header that holds the `description` slot; without assigned content it shows the `description` text as its fallback. It sets the colour and the single-line truncation the slotted text inherits.
 * @csspart meta - The duration and the state's word.
 * @csspart chevron - The open/closed arrow.
 * @csspart actions - Component-owned row under the header that holds the `actions` slot. It has no fallback: the row is hidden until content is assigned, then lays the assigned controls out in a wrapping row.
 * @csspart body - What opening the card reveals: the input and the output.
 * @csspart section - Component-owned region of the input or the output: its heading, then the `input` or `output` slot. Without assigned content the slot shows its fallback, the formatted value (or `error-text`) in the `code` box; assigned content takes that place under the heading.
 * @csspart section-label - The heading of a section.
 * @csspart code - The box a formatted input or output is shown in.
 *
 * @cssproperty {pixel} [--c2-tool-call--width=100%] - Width of the card; the host is a block.
 * @cssproperty {color} [--c2-tool-call--background-color=#ffffff]
 * @cssproperty {border} [--c2-tool-call--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-tool-call--border-radius=8px]
 * @cssproperty {color} [--c2-tool-call--color=#18181b]
 * @cssproperty {font-size} [--c2-tool-call--font-size=14px]
 *
 * @cssproperty {padding} [--c2-tool-call__header--padding=8px 12px]
 * @cssproperty {pixel} [--c2-tool-call__header--gap=8px] - Space between the marks and the texts in the header.
 * @cssproperty {color} [--c2-tool-call__header__hover--background-color=#fafafa]
 * @cssproperty {outline} [--c2-tool-call__header__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {font-family} [--c2-tool-call__name--font-family=ui-monospace, SFMono-Regular, Menlo, monospace] - The tool's name is an identifier, so it is set in monospace.
 * @cssproperty {font-weight} [--c2-tool-call__name--font-weight=600]
 * @cssproperty {color} [--c2-tool-call__description--color=#71717a]
 * @cssproperty {color} [--c2-tool-call__meta--color=#71717a]
 * @cssproperty {font-size} [--c2-tool-call__meta--font-size=12px]
 *
 * @cssproperty {pixel} [--c2-tool-call__status--size=16px]
 * @cssproperty {color} [--c2-tool-call__status__pending--color=#a1a1aa]
 * @cssproperty {color} [--c2-tool-call__status__running--color=#0265dc]
 * @cssproperty {color} [--c2-tool-call__status__success--color=#16a34a]
 * @cssproperty {color} [--c2-tool-call__status__error--color=#dc2626]
 * @cssproperty {color} [--c2-tool-call__status__cancelled--color=#71717a]
 * @cssproperty {color} [--c2-tool-call__status-mark--color=#ffffff] - The check and the cross drawn on the filled success and error marks.
 * @cssproperty {time} [--c2-tool-call__status--animation-duration=900ms] - One turn of the running mark.
 *
 * @cssproperty {padding} [--c2-tool-call__body--padding=0 12px 12px]
 * @cssproperty {pixel} [--c2-tool-call__body--gap=12px] - Space between the input and the output.
 * @cssproperty {padding} [--c2-tool-call__actions--padding=0 12px 12px]
 * @cssproperty {color} [--c2-tool-call__section-label--color=#71717a]
 * @cssproperty {font-size} [--c2-tool-call__section-label--font-size=12px]
 * @cssproperty {font-weight} [--c2-tool-call__section-label--font-weight=500]
 * @cssproperty {color} [--c2-tool-call__code--background-color=#fafafa]
 * @cssproperty {border} [--c2-tool-call__code--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-tool-call__code--border-radius=6px]
 * @cssproperty {padding} [--c2-tool-call__code--padding=8px 10px]
 * @cssproperty {font-family} [--c2-tool-call__code--font-family=ui-monospace, SFMono-Regular, Menlo, monospace]
 * @cssproperty {font-size} [--c2-tool-call__code--font-size=12px]
 * @cssproperty {pixel} [--c2-tool-call__code--max-height=240px] - Tallest an input or output box gets before it scrolls.
 * @cssproperty {color} [--c2-tool-call__error--color=#dc2626] - Colour of `error-text`.
 */
@customElement('c2-tool-call')
export class ToolCall extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The tool's name, such as `search_web`; shown in monospace. */
  @property() name = ''

  /** One line on what the call did or is doing, such as "Searched the web for lit ssr". */
  @property() description = ''

  /** Where the call is. Each state has its own mark and word. */
  @property({ reflect: true }) state: ToolCallState = 'running'

  /** What the tool was called with. Text shows as it is; anything else as indented JSON. JSON in the attribute is parsed. */
  @property({ converter: valueConverter }) input: unknown = undefined

  /** What the tool returned, shown like `input`. */
  @property({ converter: valueConverter }) output: unknown = undefined

  /** The failure shown in place of the output while `state` is `error`. */
  @property({ attribute: 'error-text' }) errorText = ''

  /** How long the call took, in milliseconds. Shown in the header when set. */
  @property({ type: Number }) duration?: number

  /** Whether the card is open, showing the input and the output. */
  @property({ type: Boolean, reflect: true }) open = false

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, toolCallMessages)
  private readonly slotPresence = new SlotPresenceController(this, ['icon', 'description', 'input', 'output', 'actions'])

  private resizeObserver?: ResizeObserver

  private get currentState(): ToolCallState {
    return STATES.includes(this.state) ? this.state : 'running'
  }

  protected override updated(_changed: PropertyValues): void {
    const state = this.currentState
    for (const name of STATES) {
      if (name === state) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }
    this.markScrollable()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.resizeObserver ??= new ResizeObserver(() => this.markScrollable())
    this.resizeObserver.observe(this)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
  }

  /** A box that scrolls has to be reachable from the keyboard to be read; one that does not is left out of the tab order. */
  private markScrollable(): void {
    for (const code of this.renderRoot.querySelectorAll<HTMLElement>('.code')) {
      const scrolls = code.scrollHeight > code.clientHeight + 1
      if (scrolls && code.tabIndex !== 0) code.tabIndex = 0
      else if (!scrolls && code.hasAttribute('tabindex')) code.removeAttribute('tabindex')
    }
  }

  private formatDuration(ms: number): string {
    const locale = this.msg.locale
    try {
      if (ms < 1000) return new Intl.NumberFormat(locale, { style: 'unit', unit: 'millisecond', unitDisplay: 'narrow', maximumFractionDigits: 0 }).format(ms)
      return new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', unitDisplay: 'narrow', maximumFractionDigits: 1 }).format(ms / 1000)
    } catch {
      return `${Math.round(ms)} ms`
    }
  }

  override render() {
    const state = this.currentState
    const hasDescription = this.slotPresence.has('description') || !!this.description
    const duration = typeof this.duration === 'number' && Number.isFinite(this.duration) && this.duration >= 0 ? this.formatDuration(this.duration) : ''
    return html`
      <details class="card" part="card" ?open=${this.open} @toggle=${this.handleToggle}>
        <summary class="header" part="header">
          <svg class="status status--${state}" part="status" viewBox="0 0 16 16" aria-hidden="true">${ICONS[state]}</svg>
          <span class="icon" ?hidden=${!this.slotPresence.has('icon')}><slot name="icon" @slotchange=${this.slotPresence.handleSlotChange}></slot></span>
          <span class="texts">
            <span class="name" part="name">${this.name || this.msg.t('tool')}</span>
            <span class="description" part="description" ?hidden=${!hasDescription}
              ><slot name="description" @slotchange=${this.slotPresence.handleSlotChange}>${this.description}</slot></span
            >
          </span>
          <span class="meta" part="meta">
            ${duration ? html`<span class="duration">${duration}</span>` : nothing}
            <span class="state-label">${this.msg.t(state)}</span>
          </span>
          <svg class="chevron" part="chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </summary>
        <div class="body" part="body" ?hidden=${!this.hasInput() && !this.hasOutput(state)}>${this.renderInput()}${this.renderOutput(state)}</div>
      </details>
      <div class="actions" part="actions" ?hidden=${!this.slotPresence.has('actions')}>
        <slot name="actions" @slotchange=${this.slotPresence.handleSlotChange}></slot>
      </div>
    `
  }

  private hasInput(): boolean {
    return this.slotPresence.has('input') || !!formatToolValue(this.input)
  }

  private outputText(state: ToolCallState): string {
    return state === 'error' ? this.errorText || formatToolValue(this.output) : formatToolValue(this.output)
  }

  private hasOutput(state: ToolCallState): boolean {
    return this.slotPresence.has('output') || !!this.outputText(state)
  }

  private renderInput() {
    const text = formatToolValue(this.input)
    return html`<section class="section" part="section" ?hidden=${!this.hasInput()} aria-label=${this.msg.t('input')}>
      <div class="section-label" part="section-label" aria-hidden="true">${this.msg.t('input')}</div>
      <slot name="input" @slotchange=${this.slotPresence.handleSlotChange}>${text ? html`<pre class="code" part="code">${text}</pre>` : nothing}</slot>
    </section>`
  }

  private renderOutput(state: ToolCallState) {
    const failed = state === 'error'
    const text = this.outputText(state)
    const label = this.msg.t(failed ? 'errorLabel' : 'output')
    return html`<section class="section ${failed ? 'section--error' : ''}" part="section" ?hidden=${!this.hasOutput(state)} aria-label=${label}>
      <div class="section-label" part="section-label" aria-hidden="true">${label}</div>
      <slot name="output" @slotchange=${this.slotPresence.handleSlotChange}>${text ? html`<pre class="code" part="code">${text}</pre>` : nothing}</slot>
    </section>`
  }

  private handleToggle(event: Event): void {
    const details = event.currentTarget as HTMLDetailsElement
    // The browser also fires toggle for an `open` the card was rendered with or given; only a change the reader made
    // leaves the property behind, and only that is announced.
    if (details.open === this.open) return
    this.open = details.open
    redispatchEvent(this, event)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tool-call': ToolCall
  }
}
