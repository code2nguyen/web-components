import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { live } from 'lit/directives/live.js'
import { repeat } from 'lit/directives/repeat.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/text-field'
import '@c2n/button'
import '@c2n/chip'
import '@c2n/link-button'
import { promoCodeFieldMessages } from './messages'
import styles from './promo-code-field.scss?inline'

export { promoCodeFieldMessages } from './messages'

/** An applied code, and the saving to show beside it ("−$12.00", "Free shipping"). */
export interface PromoCode {
  code: string
  label?: string
}

/** What `validate` answers: the accepted code (the server's spelling wins) or why it was refused. */
export type PromoCodeResult = PromoCode | { error: string }

/** Checks a code with the app's server. */
export type PromoCodeValidator = (code: string) => PromoCodeResult | Promise<PromoCodeResult>

/** Events fired by {@link PromoCodeField}, keyed for `addEventListener`. */
export interface PromoCodeFieldEventMap {
  apply: CustomEvent<PromoCode>
  remove: CustomEvent<{ code: string }>
  reject: CustomEvent<{ code: string; error: string }>
}

export interface PromoCodeField {
  addEventListener: TypedAddEventListener<PromoCodeField, PromoCodeFieldEventMap>
  removeEventListener: TypedRemoveEventListener<PromoCodeField, PromoCodeFieldEventMap>
}

/**
 * The promo code field of a checkout (Shopify, Uber Eats, Amazon): type a code, apply it, see it accepted or refused,
 * and keep each applied code as a removable token with its saving.
 *
 * The app checks codes through `validate`, an async function that answers `{ code, label }` for an accepted code or
 * `{ error }` for a refused one; while it runs the field is read-only and the Apply button runs. Without `validate`
 * every code is accepted. `codes` holds the applied codes (set it to restore them), `max` how many may apply (1 by
 * default; at the limit the field gives way to the tokens), and `collapsed` starts it as an "Add a promo code" link.
 * Codes are upper-cased unless `case-sensitive`, and a code already applied is refused without asking the server.
 *
 * Enter applies. Accepting and removing a code is announced; a refusal shows under the field, which it describes.
 *
 * @tag c2-promo-code-field
 *
 * @event {CustomEvent<{ code: string; label?: string }>} apply - Fired when a code was accepted. Does not bubble.
 * @event {CustomEvent<{ code: string }>} remove - Fired when the reader removed an applied code. Does not bubble.
 * @event {CustomEvent<{ code: string; error: string }>} reject - Fired when a code was refused. Does not bubble.
 *
 * @csspart codes - The row of applied codes.
 *
 * @internalcomponent c2-text-field
 * @internalcomponent c2-button
 * @internalcomponent c2-chip
 * @internalcomponent c2-link-button
 *
 * @cssproperty {pixel} [--c2-promo-code-field--gap=8px] - Space between the field row and the tokens.
 * @cssproperty {pixel} [--c2-promo-code-field__row--gap=8px] - Space between the field and the Apply button.
 * @cssproperty {pixel} [--c2-promo-code-field__codes--gap=6px]
 * @cssproperty {color} [--c2-promo-code-field__saving--color=#71717a] - The saving beside a code.
 * @cssproperty {font-weight} [--c2-promo-code-field__code--font-weight=600]
 * @cssproperty {string} [--c2-promo-code-field__code--letter-spacing=0.02em]
 */
@customElement('c2-promo-code-field')
export class PromoCodeField extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The applied codes. */
  @property({ converter: jsonPropertyConverter }) codes: PromoCode[] = []

  /** How many codes may apply at once. 0 means no limit. */
  @property({ type: Number }) max = 1

  /** Starts as an "Add a promo code" link that opens the field. */
  @property({ type: Boolean }) collapsed = false

  /** Keeps the case the reader typed instead of upper-casing codes. */
  @property({ type: Boolean, attribute: 'case-sensitive' }) caseSensitive = false

  /** The field's accessible name and placeholder. Default: "Promo code". */
  @property() label = ''

  @property({ type: Boolean, reflect: true }) disabled = false

  /** Checks a code with the app's server; see the class description. Without it every code is accepted. */
  @property({ attribute: false }) validate?: PromoCodeValidator

  @state() private draft = ''
  @state() private pending = false
  @state() private error = ''
  @state() private opened = false
  @state() private announcement = ''

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, promoCodeFieldMessages)

  constructor() {
    super()
    this.internals.role = 'group'
  }

  /** Whether another code may still apply. */
  private get room(): boolean {
    return !(this.max > 0) || this.codes.length < this.max
  }

  protected override willUpdate(_changed: PropertyValues<this>): void {
    this.internals.ariaLabel = this.label || this.msg.t('label')
  }

  private canonical(code: string): string {
    const trimmed = code.trim()
    return this.caseSensitive ? trimmed : trimmed.toUpperCase()
  }

  /** Applies the typed code, as the Apply button and Enter do. */
  async apply(): Promise<void> {
    const code = this.canonical(this.draft)
    if (!code || this.pending || this.disabled || !this.room) return
    if (this.codes.some((applied) => this.canonical(applied.code) === code)) {
      this.refuse(code, this.msg.t('alreadyApplied', code))
      return
    }
    this.error = ''
    let result: PromoCodeResult
    if (this.validate) {
      this.pending = true
      try {
        result = await this.validate(code)
      } catch {
        result = { error: this.msg.t('failed') }
      } finally {
        this.pending = false
      }
    } else result = { code }
    if ('error' in result) {
      this.refuse(code, result.error || this.msg.t('failed'))
      return
    }
    const accepted: PromoCode = { code: result.code || code, ...(result.label ? { label: result.label } : {}) }
    this.codes = [...this.codes, accepted]
    this.draft = ''
    this.announcement = accepted.label ? this.msg.t('appliedWith', accepted.code, accepted.label) : this.msg.t('applied', accepted.code)
    this.dispatchEvent(new CustomEvent('apply', { detail: accepted }))
    await this.updateComplete
    // With room for another code the field stays; at the limit it is gone, and focus goes to the token.
    this.focusAfterChange()
  }

  private refuse(code: string, error: string): void {
    this.error = error
    this.dispatchEvent(new CustomEvent('reject', { detail: { code, error } }))
  }

  private removeCode(code: string): void {
    this.codes = this.codes.filter((applied) => applied.code !== code)
    this.announcement = this.msg.t('removed', code)
    this.dispatchEvent(new CustomEvent('remove', { detail: { code } }))
    this.updateComplete.then(() => this.focusAfterChange())
  }

  private focusAfterChange(): void {
    const field = this.renderRoot.querySelector<HTMLElement>('c2-text-field')
    const chip = this.renderRoot.querySelector<HTMLElement>('c2-chip')
    ;(field ?? chip)?.focus()
  }

  private handleInput(event: Event): void {
    event.stopPropagation()
    this.draft = (event.target as HTMLElement & { value: string }).value
    if (this.error) this.error = ''
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) return
    event.preventDefault()
    void this.apply()
  }

  /** The field's own `input`, `change` and field enrolment are not the component's. */
  private stopInner(event: Event): void {
    event.stopPropagation()
  }

  private open(): void {
    this.opened = true
    this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('c2-text-field')?.focus())
  }

  private renderField() {
    if (!this.room) return nothing
    if (this.collapsed && !this.opened && !this.codes.length) {
      return html`<c2-link-button class="add" ?disabled=${this.disabled} @click=${this.open}>${this.msg.t('add')}</c2-link-button>`
    }
    const label = this.label || this.msg.t('label')
    return html`<div class="row" @c2-field-connect=${this.stopInner} @change=${this.stopInner}>
      <c2-text-field
        class="field"
        aria-label=${label}
        placeholder=${label}
        autocomplete="off"
        .value=${live(this.draft)}
        ?readonly=${this.pending}
        ?disabled=${this.disabled}
        ?error=${!!this.error}
        error-text=${this.error || nothing}
        @input=${this.handleInput}
        @keydown=${this.handleKeydown}
      ></c2-text-field>
      <c2-button class="apply" ?running=${this.pending} ?disabled=${this.disabled || !this.canonical(this.draft)} @click=${() => this.apply()}
        >${this.msg.t('apply')}</c2-button
      >
    </div>`
  }

  override render() {
    return html`<div class="promo">
      ${this.renderField()}
      ${
        this.codes.length
          ? html`<div class="codes" part="codes" role="list" aria-label=${this.msg.t('codes')}>
              ${repeat(
                this.codes,
                (applied) => applied.code,
                (applied) =>
                  html`<c2-chip
                    role="listitem"
                    removable
                    ?disabled=${this.disabled}
                    value=${applied.code}
                    remove-label=${this.msg.t('remove', applied.code)}
                    @remove=${(event: Event) => {
                    // The chip's own remove bubbles out of this shadow root: the field fires its own instead.
                    event.stopPropagation()
                    this.removeCode(applied.code)
                  }}
                    ><span class="code">${applied.code}</span>${applied.label ? html`<span class="saving">${applied.label}</span>` : nothing}</c2-chip
                  >`,
              )}
            </div>`
          : nothing
      }
      <span class="visually-hidden announce" aria-live="polite">${this.announcement}</span>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-promo-code-field': PromoCodeField
  }
}
