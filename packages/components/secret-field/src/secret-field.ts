import { LitElement, html, svg, nothing, unsafeCSS, type SVGTemplateResult } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/copy-button'
import '@c2n/icon-button'
import { secretFieldMessages } from './messages'
import styles from './secret-field.scss?inline'

/** Events fired by {@link SecretField}, keyed for `addEventListener`. */
export interface SecretFieldEventMap {
  'reveal-change': Event
  regenerate: Event
  copied: Event
  'copy-error': Event
}

export interface SecretField {
  addEventListener: TypedAddEventListener<SecretField, SecretFieldEventMap>
  removeEventListener: TypedRemoveEventListener<SecretField, SecretFieldEventMap>
}

/** Number of bullets drawn for the hidden part, whatever its real length, so the mask does not give the length away. */
const MASK_LENGTH = 12

/**
 * Shows a secret the app already has, such as an API key, a webhook signing secret or a recovery code, the way the
 * Stripe and OpenAI key pages do: masked by default, with a button to show it, a button to copy it and, with
 * `regenerable`, a button to ask for a new one. It is a read-only display, not an input; use `c2-password-field` for
 * a secret the user types.
 *
 * Masked, it keeps `reveal-start` leading and `reveal-end` trailing characters (`acme_live_••••••••••••4242`) and
 * draws the rest as a fixed number of bullets, so the mask does not tell the length. The visible ends never exceed
 * half of the secret: past that it is masked entirely. A screen reader hears "Starts with acme_live_, hidden, ends with
 * 4242" rather than the bullets. Copy always copies the whole value, shown or not, and announces "Copied"; the
 * `copied` event it fires carries no detail, so the secret never travels with an event.
 * Regenerate only fires `regenerate`: the app confirms (a `c2-confirm-dialog` fits), fetches the new secret and sets
 * `value`, typically with `revealed` so the new key is shown once.
 *
 * The buttons are a `c2-icon-button` toggle and a `c2-copy-button`; the `--c2-secret-field__action--*` variables
 * style all of them together. The built-in labels are English and translatable.
 *
 * @tag c2-secret-field
 *
 * @slot label - Label above the field. Falls back to the `label` attribute.
 * @slot help - Text under the field, such as "You won't be able to see this key again."
 *
 * @event {Event} reveal-change - The user showed or hid the secret; read `revealed`.
 * @event {Event} regenerate - The user asked for a new secret. Confirm it, then set `value`.
 * @event {Event} copied - The secret was copied. It has no detail: the secret does not travel with the event.
 * @event {Event} copy-error - The clipboard refused the copy.
 *
 * @csspart label - Container of the label.
 * @csspart field - The box holding the value and the buttons.
 * @csspart value - The secret, masked or shown.
 * @csspart mask - The bullets standing for the hidden part.
 * @csspart actions - The row of buttons.
 * @csspart help - Container of the `help` slot; hidden while it is empty.
 *
 * @cssproperty {pixel} [--c2-secret-field--gap=6px] - Space between the label, the field and the help text.
 * @cssproperty {pixel} [--c2-secret-field--width=100%] - Width of the host, a block by default.
 *
 * @cssproperty {color} [--c2-secret-field__label--color=#18181b]
 * @cssproperty {font-size} [--c2-secret-field__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-secret-field__label--font-weight=500]
 *
 * @cssproperty {pixel} [--c2-secret-field__field--min-height=36px]
 * @cssproperty {border} [--c2-secret-field__field--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-secret-field__field--border-radius=6px]
 * @cssproperty {color} [--c2-secret-field__field--background-color=#fafafa] - Read-only surface.
 * @cssproperty {padding} [--c2-secret-field__field--padding-left=12px]
 * @cssproperty {padding} [--c2-secret-field__field--padding-right=4px]
 *
 * @cssproperty {color} [--c2-secret-field__value--color=#18181b]
 * @cssproperty {font-family} [--c2-secret-field__value--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {font-size} [--c2-secret-field__value--font-size=14px]
 * @cssproperty {color} [--c2-secret-field__mask--color=#71717a] - Colour of the bullets.
 *
 * @cssproperty {pixel} [--c2-secret-field__action--size=28px] - Width and height of each button.
 * @cssproperty {pixel} [--c2-secret-field__action--icon-size=16px]
 * @cssproperty {border-radius} [--c2-secret-field__action--border-radius=6px]
 * @cssproperty {color} [--c2-secret-field__action--color=#71717a] - Icon colour of the buttons.
 * @cssproperty {color} [--c2-secret-field__action__hover--color=#18181b]
 * @cssproperty {color} [--c2-secret-field__action__hover--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-secret-field__action__selected--background-color=#e4e4e7] - Show button while the secret is shown.
 * @cssproperty {pixel} [--c2-secret-field__actions--gap=2px]
 *
 * @cssproperty {color} [--c2-secret-field__help--color=#71717a]
 * @cssproperty {font-size} [--c2-secret-field__help--font-size=12px]
 */
@customElement('c2-secret-field')
export class SecretField extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The secret. Copy always copies all of it. */
  @property() value = ''

  /** Label when the `label` slot is empty. Names the field for assistive technology. */
  @property() label = ''

  /** Shows the whole secret instead of the mask. The show button toggles it. */
  @property({ type: Boolean, reflect: true }) revealed = false

  /** Leading characters left visible in the mask, e.g. `10` for an `acme_live_` prefix. */
  @property({ type: Number, attribute: 'reveal-start' }) revealStart = 0

  /** Trailing characters left visible in the mask. */
  @property({ type: Number, attribute: 'reveal-end' }) revealEnd = 4

  /** Adds a regenerate button, which fires `regenerate`. */
  @property({ type: Boolean, reflect: true }) regenerable = false

  /** Leaves out the show button, for a secret that should only ever be copied. */
  @property({ type: Boolean, attribute: 'hide-reveal' }) hideReveal = false

  private readonly msg = new LocalizeController(this, secretFieldMessages)
  private readonly slotPresence = new SlotPresenceController(this, ['label', 'help'])

  /**
   * The leading and trailing characters a mask keeps. None when they would show more than half of the secret: a mask
   * that leaves one character hidden hides nothing.
   */
  private maskEnds(): [string, string] {
    const value = this.value
    const start = Math.max(0, Math.floor(this.revealStart) || 0)
    const end = Math.max(0, Math.floor(this.revealEnd) || 0)
    if ((start + end) * 2 > value.length) return ['', '']
    return [value.slice(0, start), end ? value.slice(-end) : '']
  }

  /** What a screen reader hears for the masked secret, in the page's language. */
  private spokenMask(start: string, end: string): string {
    if (start && end) return this.msg.t('hiddenBetween', start, end)
    if (start) return this.msg.t('hiddenStarting', start)
    if (end) return this.msg.t('hiddenEnding', end)
    return this.msg.t('hidden')
  }

  /** Keeps the copy button's event, which carries the copied text, inside the field; the field's own has no detail. */
  private handleCopyEvent(event: Event) {
    event.stopPropagation()
    this.dispatchEvent(new Event(event.type))
  }

  private toggleReveal() {
    this.revealed = !this.revealed
    this.dispatchEvent(new Event('reveal-change'))
  }

  private requestRegenerate() {
    this.dispatchEvent(new Event('regenerate'))
  }

  private renderValue() {
    if (!this.value) return html`<code class="value" part="value"><span class="sr-only">${this.msg.t('empty')}</span></code>`
    if (this.revealed) return html`<code class="value" part="value">${this.value}</code>`
    const [start, end] = this.maskEnds()
    const spoken = this.spokenMask(start, end)
    return html`<code class="value is-masked" part="value"
      ><span class="masked" aria-hidden="true"
        ><span class="end">${start}</span><span class="mask" part="mask">${'•'.repeat(MASK_LENGTH)}</span><span class="end">${end}</span></span
      ><span class="sr-only">${spoken}</span></code
    >`
  }

  override render() {
    const hasLabel = this.slotPresence.has('label') || !!this.label
    const hasHelp = this.slotPresence.has('help')
    return html`
      <div class="c2-secret-field">
        <div id="label" class="label" part="label" ?hidden=${!hasLabel}>
          <slot name="label" @slotchange=${this.slotPresence.handleSlotChange}>${this.label}</slot>
        </div>
        <div class="field" part="field" role="group" aria-labelledby=${hasLabel ? 'label' : nothing} aria-describedby=${hasHelp ? 'help' : nothing}>
          ${this.renderValue()}
          <div class="actions" part="actions">
            ${
              this.hideReveal
                ? nothing
                : html`<c2-icon-button
                    class="action"
                    toggle
                    ?selected=${this.revealed}
                    ?disabled=${!this.value}
                    aria-label=${this.msg.t('show')}
                    @click=${this.toggleReveal}
                  >
                    ${this.revealed ? eyeOffIcon : eyeIcon}
                  </c2-icon-button>`
            }
            <c2-copy-button
              class="action"
              .value=${this.value}
              ?disabled=${!this.value}
              reveal="always"
              label=${this.msg.t('copy')}
              copied-label=${this.msg.t('copied')}
              @copied=${this.handleCopyEvent}
              @copy-error=${this.handleCopyEvent}
            ></c2-copy-button>
            ${
              this.regenerable
                ? html`<c2-icon-button class="action" aria-label=${this.msg.t('regenerate')} @click=${this.requestRegenerate}
                    >${regenerateIcon}</c2-icon-button
                  >`
                : nothing
            }
          </div>
        </div>
        <div id="help" class="help" part="help" ?hidden=${!hasHelp}>
          <slot name="help" @slotchange=${this.slotPresence.handleSlotChange}></slot>
        </div>
      </div>
    `
  }
}

// The shapes go through `svg`, not `html`: Lit creates an `html` template's elements in the HTML namespace.
const icon = (content: SVGTemplateResult) =>
  html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${content}
  </svg>`

const eyeIcon = icon(svg`<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />`)
const eyeOffIcon = icon(
  svg`<path
      d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
    /><line x1="1" y1="1" x2="23" y2="23" />`,
)
const regenerateIcon = icon(
  svg`<polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path
      d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
    />`,
)

declare global {
  interface HTMLElementTagNameMap {
    'c2-secret-field': SecretField
  }
}
