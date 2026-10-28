import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/button'
import '@c2n/overlay'
import { Quantity, QUANTITY_CHANGE, QUANTITY_SYNC } from './quantity'
import { quantityPickerMessages } from './messages'
import styles from './quantity-picker.scss?inline'

export { Quantity } from './quantity'
export { quantityPickerMessages } from './messages'

// `Intl.ListFormat` is ES2021, above the library's ES2020 typings; every engine the components support has it.
const ListFormat = (
  Intl as unknown as {
    ListFormat?: new (locale: string, options: { type: 'unit'; style: 'long' }) => { format(items: string[]): string }
  }
).ListFormat

/** The picker's state, as `input` and `change` carry it. */
export interface QuantityPickerValue {
  /** Each counter's count, by its key (`name`, else its label in lower case). */
  values: Record<string, number>
  total: number
}

/** Writes the trigger's text from the counters. */
export type QuantitySummary = (counters: Quantity[], locale: string) => string

/** Events fired by {@link QuantityPicker}, keyed for `addEventListener`. */
export interface QuantityPickerEventMap {
  input: CustomEvent<QuantityPickerValue>
  change: CustomEvent<QuantityPickerValue>
}

export interface QuantityPicker {
  addEventListener: TypedAddEventListener<QuantityPicker, QuantityPickerEventMap>
  removeEventListener: TypedRemoveEventListener<QuantityPicker, QuantityPickerEventMap>
}

/**
 * The guests picker of Airbnb and Booking.com: a trigger that sums up several counts ("2 adults, 1 child") and opens a
 * panel of labelled counters, each a `c2-quantity` child with its own limits.
 *
 * The summary joins each counter's count and noun (`singular`/`plural`, chosen with `Intl.PluralRules`) with
 * `Intl.ListFormat`, leaving out counters at 0; `summary` replaces it with a function of your own, and `placeholder`
 * shows while every counter is 0. `max-total` caps the sum: at the limit every + is off and the note says so.
 * `inline` drops the trigger and the popover, for a booking panel that shows the counters directly.
 *
 * The panel is a popover under the trigger: Escape, a click outside or "Done" closes it and focus returns to the
 * trigger. Each counter's value is a spinbutton (↑ ↓ Home End), and a change is announced with the new summary.
 * `input` fires on every step and `change` when the panel closes after a change (at once when inline), both with
 * `{ values, total }`. The picker is not form-associated: read `values` or the event detail.
 *
 * @tag c2-quantity-picker
 *
 * @slot - The `c2-quantity` counters.
 * @slot chevron-icon - The trigger's chevron.
 *
 * @event {CustomEvent<{ values: Record<string, number>; total: number }>} input - Fired on every step.
 * @event {CustomEvent<{ values: Record<string, number>; total: number }>} change - Fired when the panel closes after a change, or on every step when inline.
 *
 * @csspart trigger - The button that opens the panel.
 * @csspart panel - The panel of counters.
 *
 * @slotcomponent c2-quantity
 * @internalcomponent c2-overlay
 * @internalcomponent c2-button
 *
 * @cssproperty {pixel} [--c2-quantity-picker--width=280px] - The trigger's width.
 * @cssproperty {pixel} [--c2-quantity-picker__panel--width=320px]
 * @cssproperty {padding} [--c2-quantity-picker__trigger--padding=8px 12px]
 * @cssproperty {border} [--c2-quantity-picker__trigger--border=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-quantity-picker__trigger__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-quantity-picker__trigger__open--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {border-radius} [--c2-quantity-picker__trigger--border-radius=6px]
 * @cssproperty {color} [--c2-quantity-picker__trigger--background=#ffffff]
 * @cssproperty {color} [--c2-quantity-picker__trigger--color=#18181b]
 * @cssproperty {outline} [--c2-quantity-picker__trigger__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {color} [--c2-quantity-picker__label--color=#71717a]
 * @cssproperty {font-size} [--c2-quantity-picker__label--font-size=12px]
 * @cssproperty {padding} [--c2-quantity-picker__panel--padding=8px 16px]
 * @cssproperty {border} [--c2-quantity-picker__panel--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-quantity-picker__panel--border-radius=8px]
 * @cssproperty {color} [--c2-quantity-picker__panel--background=#ffffff]
 * @cssproperty {shadow} [--c2-quantity-picker__panel--box-shadow=0 8px 24px rgba(0, 0, 0, 0.12)]
 * @cssproperty {border} [--c2-quantity-picker__divider--border=1px solid #e4e4e7] - The lines between counters.
 * @cssproperty {color} [--c2-quantity-picker__note--color=#71717a]
 * @cssproperty {font-size} [--c2-quantity-picker__note--font-size=12px]
 */
@customElement('c2-quantity-picker')
export class QuantityPicker extends LitElement {
  static override styles = unsafeCSS(styles)

  /** What is counted ("Guests"): the trigger's caption and the group's name. */
  @property() label = ''

  /** The trigger's text while every counter is 0. Default: "None". */
  @property() placeholder = ''

  /** The most the counters may add up to. */
  @property({ attribute: 'max-total', type: Number }) maxTotal = Number.POSITIVE_INFINITY

  /** Shows the counters directly, with no trigger or popover. */
  @property({ type: Boolean, reflect: true }) inline = false

  /** Turns the trigger and every counter off. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Whether the panel is open. */
  @property({ type: Boolean }) open = false

  /** Writes the trigger's text from the counters, instead of the built-in summary. */
  @property({ attribute: false }) summary?: QuantitySummary

  @state() private counters: Quantity[] = []
  /** Set after the first update; see `text`. */
  @state() private ready = false
  @state() private announcement = ''

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, quantityPickerMessages)
  private changedSinceOpen = false

  constructor() {
    super()
    this.internals.role = 'group'
    this.addEventListener(QUANTITY_CHANGE, (event) => this.handleCount(event))
    this.addEventListener(QUANTITY_SYNC, (event) => {
      event.stopPropagation()
      // A counter that upgraded after the picker looked joins it here.
      if (!this.counters.includes(event.target as Quantity)) this.collect(this.renderRoot.querySelector('.counters slot'))
      this.requestUpdate()
    })
  }

  /** Each counter's count, by its key. */
  get values(): Record<string, number> {
    return Object.fromEntries(this.counters.map((counter) => [counter.key, counter.value]))
  }

  /** The sum of the counts. */
  get total(): number {
    return this.counters.reduce((sum, counter) => sum + (Number.isFinite(counter.value) ? counter.value : 0), 0)
  }

  /** The trigger's text: the summary, or the placeholder while every counter is 0. */
  get text(): string {
    // Until the first update, the text a server render could write: a hydrated trigger must match it, or its text
    // is never written over.
    if (!this.ready) return this.placeholder || this.msg.t('none')
    if (this.summary) return this.summary(this.counters, this.msg.locale)
    const locale = this.msg.locale
    let plural: Intl.PluralRules
    let list: { format(items: string[]): string } | undefined
    try {
      plural = new Intl.PluralRules(locale)
      list = ListFormat ? new ListFormat(locale, { type: 'unit', style: 'long' }) : undefined
    } catch {
      plural = new Intl.PluralRules('en')
      list = ListFormat ? new ListFormat('en', { type: 'unit', style: 'long' }) : undefined
    }
    const parts = this.counters
      .filter((counter) => counter.value > 0)
      .map((counter) => {
        const noun = plural.select(counter.value) === 'one' ? counter.singular || counter.plural : counter.plural || counter.singular
        return `${counter.value} ${noun || counter.label.toLowerCase()}`
      })
    if (!parts.length) return this.placeholder || this.msg.t('none')
    return list ? list.format(parts) : parts.join(', ')
  }

  private get value(): QuantityPickerValue {
    return { values: this.values, total: this.total }
  }

  protected override willUpdate(_changed: PropertyValues<this>): void {
    this.internals.ariaLabel = this.label || null
    this.share()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('open') && !this.inline) {
      const overlay = this.renderRoot.querySelector<HTMLElement>('c2-overlay')
      if (overlay && this.open !== overlay.matches(':popover-open')) {
        if (this.open) overlay.showPopover()
        else overlay.hidePopover()
      }
    }
  }

  /** Tells each counter how much the total limit still lets it grow. */
  private share(): void {
    const limit = Number.isFinite(this.maxTotal) && this.maxTotal >= 0 ? this.maxTotal : Number.POSITIVE_INFINITY
    const room = limit - this.total
    for (const counter of this.counters) {
      // A counter hydrating after the picker gets its limits after its own first update (it sends a sync then).
      if (!counter.hasUpdated) continue
      counter.room = room
      counter.locked = this.disabled
    }
  }

  private handleSlotChange(event: Event): void {
    this.collect(event.target as HTMLSlotElement)
  }

  private collect(slot: HTMLSlotElement | null): void {
    if (!slot) return
    // A counter may sit in a wrapper of its own (an island of a server-rendering framework, such as Astro's).
    this.counters = slot
      .assignedElements({ flatten: true })
      .flatMap((element) => (element instanceof Quantity ? [element] : [...element.querySelectorAll('c2-quantity')]))
      .filter((element): element is Quantity => element instanceof Quantity)
  }

  protected override firstUpdated(): void {
    // Hydrated from server-rendered markup, the slot fires no slotchange: collect the counters now.
    this.collect(this.renderRoot.querySelector('.counters slot'))
    this.ready = true
  }

  private handleCount(event: Event): void {
    event.stopPropagation()
    this.changedSinceOpen = true
    this.requestUpdate()
    this.announcement = this.msg.t('changed', this.text)
    this.dispatchEvent(new CustomEvent('input', { detail: this.value, bubbles: true, composed: true }))
    if (this.inline || !this.open) this.commit()
  }

  private commit(): void {
    if (!this.changedSinceOpen) return
    this.changedSinceOpen = false
    this.dispatchEvent(new CustomEvent('change', { detail: this.value, bubbles: true, composed: true }))
  }

  private handleToggle(event: Event): void {
    // The overlay toggles once per transition, whether the reader or `open` (the Done button) started it.
    const open = (event as ToggleEvent).newState === 'open'
    this.open = open
    if (!open) {
      this.commit()
      this.renderRoot.querySelector<HTMLElement>('.trigger')?.focus()
    } else {
      // Focus the first counter's value, so the arrow keys work at once.
      requestAnimationFrame(() => this.counters[0]?.shadowRoot?.querySelector<HTMLElement>('[role=spinbutton]')?.focus())
    }
  }

  private renderNote() {
    if (!Number.isFinite(this.maxTotal)) return nothing
    const full = this.total >= this.maxTotal
    return html`<span class="note">${full ? this.msg.t('full', this.total, this.maxTotal) : this.msg.t('upTo', this.maxTotal)}</span>`
  }

  private renderCounters() {
    return html`<div class="counters"><slot @slotchange=${this.handleSlotChange}></slot></div>`
  }

  override render() {
    if (this.inline) {
      return html`<div class="panel panel--inline" part="panel">
        ${this.renderCounters()} ${Number.isFinite(this.maxTotal) ? html`<div class="footer">${this.renderNote()}</div>` : nothing}
        <span class="visually-hidden" aria-live="polite">${this.announcement}</span>
      </div>`
    }
    const text = this.text
    return html`<button
        class="trigger"
        part="trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded=${this.open ? 'true' : 'false'}
        aria-label=${this.label ? `${this.label}: ${text}` : nothing}
        popovertarget=${this.disabled ? nothing : 'panel'}
        ?disabled=${this.disabled}
      >
        ${this.label ? html`<span class="label" aria-hidden="true">${this.label}</span>` : nothing}
        <span class="value"
          ><span class="text">${text}</span
          ><slot name="chevron-icon"><svg class="chevron" viewBox="0 0 24 24" aria-hidden="true">${svg`<path d="m6 9 6 6 6-6"></path>`}</svg></slot></span
        >
      </button>
      <c2-overlay id="panel" popover placement="bottom-start" free-width @toggle=${this.handleToggle}>
        <div class="panel" part="panel" role="dialog" aria-label=${this.label || nothing}>
          ${this.renderCounters()}
          <div class="footer">
            ${this.renderNote()}
            <c2-button class="done" @click=${() => (this.open = false)}>${this.msg.t('done')}</c2-button>
          </div>
          <span class="visually-hidden" aria-live="polite">${this.announcement}</span>
        </div>
      </c2-overlay>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-quantity-picker': QuantityPicker
  }
}
