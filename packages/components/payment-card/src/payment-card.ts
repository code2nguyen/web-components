import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/button'
import '@c2n/copy-button'
import { paymentCardMessages } from './messages'
import styles from './payment-card.scss?inline'

export { paymentCardMessages } from './messages'

/** The details an app hands the card once the reader asked to see them. */
export interface PaymentCardDetails {
  /** The full card number; spaces are ignored. */
  number: string
  /** The expiry as printed on the card ("08/29"). */
  expiry: string
  /** The security code, when the app shows it. */
  cvc?: string
}

/** A field of the card a copy button copies. */
export type PaymentCardField = 'number' | 'expiry' | 'cvc'

/** Events fired by {@link PaymentCard}, keyed for `addEventListener`. */
export interface PaymentCardEventMap {
  'reveal-request': CustomEvent<void>
  'field-copy': CustomEvent<{ field: PaymentCardField }>
}

export interface PaymentCard {
  addEventListener: TypedAddEventListener<PaymentCard, PaymentCardEventMap>
  removeEventListener: TypedRemoveEventListener<PaymentCard, PaymentCardEventMap>
}

/** Groups a card number the way it is embossed: 4-6-5 for a 15-digit number (American Express), fours otherwise. */
export function groupCardNumber(number: string): string[] {
  const digits = number.replace(/\D/g, '')
  if (digits.length === 15) return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10)]
  return digits.match(/.{1,4}/g) ?? []
}

/**
 * A company card the way Brex, Mercury and Ramp show one: the card face, masked until the reader asks to see it, then
 * the number, expiry and security code, each with a copy button.
 *
 * The full number never sits in an attribute. The masked face is described by `label`, `holder` and `last4`; "Show
 * details" fires `reveal-request`, and the app fetches the details (behind a re-authentication, usually) and sets
 * the `details` property to `{ number, expiry, cvc }`. Until then the button runs and the number line is a skeleton;
 * `revealFailed()` returns to the masked face. The card masks itself again after `hide-after` seconds, when the page
 * is hidden, and through `hide()`, each time dropping `details` from memory.
 *
 * `frozen` greys the face, adds a "Frozen" badge and turns reveal off. The face is designed dark, so its colours stay
 * in both themes; restyle it through its variables (`--c2-payment-card__face--background` takes any gradient), and
 * hide the chip, the expiry row or the button row through their display variables for a compact card in a list.
 *
 * @tag c2-payment-card
 *
 * @slot brand - The card network's or issuer's logo, top right. The app supplies its own licensed artwork.
 * @slot badge - Replaces the "Frozen" badge of a frozen card.
 * @slot actions - More buttons beside "Show details" ("Freeze", "Report lost").
 *
 * @event {CustomEvent<void>} reveal-request - Fired when the reader asks to see the details: fetch them and set `details`, or call `revealFailed()`. Does not bubble.
 * @event {CustomEvent<{ field: 'number' | 'expiry' | 'cvc' }>} field-copy - Fired after a field was copied (named apart from the native clipboard `copy`). Does not bubble.
 *
 * @csspart face - The card face.
 * @csspart number - The number line.
 * @csspart actions - The row of buttons under the face.
 *
 * @internalcomponent c2-button
 * @internalcomponent c2-copy-button
 *
 * @cssproperty {pixel} [--c2-payment-card--width=340px]
 * @cssproperty {number} [--c2-payment-card__face--aspect-ratio=1.586] - The ISO card proportion.
 * @cssproperty {color} [--c2-payment-card__face--background=radial-gradient(120% 140% at 0% 0%, #3f3f46 0%, #18181b 60%)] - A colour or a gradient.
 * @cssproperty {color} [--c2-payment-card__face--color=#ffffff]
 * @cssproperty {padding} [--c2-payment-card__face--padding=20px]
 * @cssproperty {border-radius} [--c2-payment-card__face--border-radius=14px]
 * @cssproperty {shadow} [--c2-payment-card__face--box-shadow=0 8px 24px rgba(0, 0, 0, 0.18)]
 * @cssproperty {font-size} [--c2-payment-card__number--font-size=20px]
 * @cssproperty {font-size} [--c2-payment-card__label--font-size=13px]
 * @cssproperty {font-size} [--c2-payment-card__caption--font-size=10px] - The field captions (CARDHOLDER, EXPIRES).
 * @cssproperty {font-size} [--c2-payment-card__value--font-size=14px]
 * @cssproperty {display} [--c2-payment-card__chip--display=block] - `none` drops the chip.
 * @cssproperty {color} [--c2-payment-card__chip--background=linear-gradient(135deg, #e7c66b, #b8913a)]
 * @cssproperty {display} [--c2-payment-card__fields--display=flex] - `none` drops the expiry and security code row, for a compact card.
 * @cssproperty {display} [--c2-payment-card__actions--display=flex] - `none` drops the button row.
 * @cssproperty {color} [--c2-payment-card__copy--color=rgba(255, 255, 255, 0.8)] - The copy icons on the face.
 * @cssproperty {color} [--c2-payment-card__skeleton--background=rgba(255, 255, 255, 0.18)]
 * @cssproperty {color} [--c2-payment-card__badge--background=rgba(255, 255, 255, 0.16)]
 * @cssproperty {string} [--c2-payment-card__frozen--filter=grayscale(1) brightness(0.9)] - The filter on a frozen face.
 * @cssproperty {pixel} [--c2-payment-card--gap=10px] - Space between the face and the button row.
 */
@customElement('c2-payment-card')
export class PaymentCard extends LitElement {
  static override styles = unsafeCSS(styles)

  /** What the card is for ("Marketing team · Virtual"), top left; also its accessible name. */
  @property() label = ''

  /** The cardholder's name. */
  @property() holder = ''

  /** The last four digits, shown on the masked face. */
  @property() last4 = ''

  /** The details to show. Set it, as a property only, after `reveal-request`; `hide()` clears it. */
  @property({ attribute: false }) details: PaymentCardDetails | null = null

  /** Seconds the details stay shown before the card masks itself again. 0 keeps them until `hide()`. */
  @property({ attribute: 'hide-after', type: Number }) hideAfter = 60

  /** A frozen card: greyed, badged, and its details cannot be shown. */
  @property({ type: Boolean, reflect: true }) frozen = false

  @state() private loading = false
  /** A reveal was cancelled while loading; its late details must not show. */
  private cancelled = false
  @state() private announcement = ''

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, paymentCardMessages)
  private hideTimer: ReturnType<typeof setTimeout> | undefined

  constructor() {
    super()
    this.internals.role = 'group'
  }

  /** Whether the details are shown. */
  get revealed(): boolean {
    return this.details !== null
  }

  /** Asks for the details, as the button does: fires `reveal-request` and shows the loading state. */
  reveal(): void {
    if (this.frozen || this.loading || this.revealed) return
    this.cancelled = false
    this.loading = true
    this.dispatchEvent(new CustomEvent('reveal-request'))
  }

  /** Masks the card again and drops the details from memory. */
  hide(): void {
    const was = this.revealed
    // A reveal still loading is cancelled: the details it brings later are dropped.
    if (this.loading) this.cancelled = true
    this.loading = false
    this.details = null
    if (was) this.announcement = this.msg.t('hidden')
  }

  /** Ends a reveal that could not complete (the app could not fetch the details): back to the masked face. */
  revealFailed(): void {
    this.loading = false
  }

  override connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('visibilitychange', this.handleVisibility)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    document.removeEventListener('visibilitychange', this.handleVisibility)
    clearTimeout(this.hideTimer)
    // Details do not outlive the card on the page.
    this.details = null
    this.loading = false
  }

  /** A hidden tab is a card nobody watches: mask it, and cancel a reveal still loading. */
  private readonly handleVisibility = () => {
    if (document.visibilityState === 'hidden' && (this.revealed || this.loading)) this.hide()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.internals.ariaLabel = this.label || this.msg.t('card')
    if (changed.has('frozen') && this.frozen && (this.revealed || this.loading)) this.hide()
    if (changed.has('details')) {
      clearTimeout(this.hideTimer)
      // Details for a cancelled reveal, a frozen card or a hidden page are not shown.
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      if (this.details && (this.cancelled || this.frozen || hidden)) {
        this.cancelled = false
        this.details = null
      }
      if (this.details) {
        this.loading = false
        this.announcement = this.msg.t('shown')
        const seconds = Number.isFinite(this.hideAfter) ? this.hideAfter : 60
        if (seconds > 0) this.hideTimer = setTimeout(() => this.hide(), seconds * 1000)
      }
    }
  }

  private copied(field: PaymentCardField): void {
    this.dispatchEvent(new CustomEvent('field-copy', { detail: { field } }))
  }

  private renderCopy(field: PaymentCardField, value: string, label: string) {
    // The copy button's own events carry the copied text and bubble out of this shadow root: the number and the code
    // stop here, and only `field-copy`, with the field's name, leaves the card.
    return html`<c2-copy-button
      class="copy"
      reveal="always"
      .value=${value}
      label=${label}
      @copied=${(event: Event) => {
        event.stopPropagation()
        this.copied(field)
      }}
      @copy-error=${(event: Event) => event.stopPropagation()}
    ></c2-copy-button>`
  }

  private renderNumber() {
    if (this.loading) return html`<span class="skeleton" role="img" aria-label=${this.msg.t('loading')}></span>`
    const details = this.details
    if (details) {
      const digits = details.number.replace(/\D/g, '')
      return html`<span class="digits" aria-hidden="true">${groupCardNumber(digits).join(' ')}</span
        ><span class="visually-hidden">${this.msg.t('number', digits)}</span>${this.renderCopy('number', digits, this.msg.t('copyNumber'))}`
    }
    const last4 = this.last4.replace(/\D/g, '').slice(-4)
    return html`<span class="digits" aria-hidden="true">•••• •••• •••• ${last4 || '••••'}</span
      >${last4 ? html`<span class="visually-hidden">${this.msg.t('endingIn', last4)}</span>` : nothing}`
  }

  override render() {
    const details = this.details
    return html`<div class="card">
      <div class="face" part="face">
        <div class="top">
          ${this.frozen ? html`<span class="badge"><slot name="badge">${this.msg.t('frozen')}</slot></span>` : nothing}
          <span class="label">${this.label}</span>
          <span class="brand"><slot name="brand"></slot></span>
        </div>
        <div><span class="chip" aria-hidden="true"></span></div>
        <div class="bottom">
          <div class="number" part="number">${this.renderNumber()}</div>
          <div class="fields">
            ${this.holder ? html`<div class="field"><span class="caption">${this.msg.t('holder')}</span><span class="value">${this.holder}</span></div>` : nothing}
            <div class="field field--detail">
              <span class="caption">${this.msg.t('expires')}</span>
              <span class="value"
                >${
                  details
                    ? html`${details.expiry}${this.renderCopy('expiry', details.expiry, this.msg.t('copyExpiry'))}`
                    : html`<span aria-hidden="true">••/••</span>`
                }</span
              >
            </div>
            ${
              details?.cvc || !details
                ? html`<div class="field field--detail">
                    <span class="caption">${this.msg.t('cvc')}</span>
                    <span class="value"
                      >${
                        details?.cvc
                          ? html`${details.cvc}${this.renderCopy('cvc', details.cvc, this.msg.t('copyCvc'))}`
                          : html`<span aria-hidden="true">•••</span>`
                      }</span
                    >
                  </div>`
                : nothing
            }
          </div>
        </div>
      </div>
      <div class="actions" part="actions">
        <c2-button
          class="toggle"
          ?running=${this.loading}
          ?disabled=${this.frozen && !this.revealed}
          @click=${() => (this.revealed ? this.hide() : this.reveal())}
          >${this.msg.t(this.revealed ? 'hide' : 'show')}</c2-button
        >
        <slot name="actions"></slot>
      </div>
      <span class="visually-hidden announce" aria-live="polite">${this.announcement}</span>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-payment-card': PaymentCard
  }
}
