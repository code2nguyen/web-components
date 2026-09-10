import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './icon-button.scss?inline'

import '@c2n/tooltip'

/**
 * A round, hoverable button that wraps a slotted icon. Renders a real `<button>` (focus is delegated to
 * it) so it is keyboard operable; set `aria-label` on the host to name it.
 *
 * @tag c2-icon-button
 *
 * @slot - The icon (an inline `<svg>`, a `c2-feather-*` or a `c2-mat-icon` element).
 *
 * @cssproperty {color} --c2-icon-button--background-color
 * @cssproperty {border-radius} [--c2-icon-button--border-radius=999px]
 * @cssproperty {border} [--c2-icon-button--border=none]
 *
 * @cssproperty {color} [--c2-icon-button__hover--background-color=rgb(230, 230, 230)]
 * @cssproperty {outline} [--c2-icon-button__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-icon-button__focus--outline-offset=2px]
 * @cssproperty {opacity} [--c2-icon-button__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-icon-button__selected--background-color=rgb(230, 230, 230)] - Pressed state of a toggle button (see `selected`).
 *
 * @cssproperty {pixel} [--c2-icon-button__icon--width=24px]
 * @cssproperty {pixel} [--c2-icon-button__icon--height=24px]
 * @cssproperty {color} --c2-icon-button__icon--color
 * @cssproperty {color} --c2-icon-button__icon__hover--color
 * @cssproperty {color} --c2-icon-button__icon__selected--color
 *
 * @cssproperty {pixel} [--c2-icon-button__state-layer--size=48px]
 */
@customElement('c2-icon-button')
export class IconButton extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  /** Tooltip text shown after a short delay; also used as the accessible name when `aria-label` is not set. */
  @property() tooltip: string | undefined = undefined

  /** Disables the button: no pointer events, no focus, reduced opacity. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Accessible name forwarded to the inner `<button>`. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Pressed state of a toggle button (`aria-pressed="true"`); styled with the `__selected--*` variables. */
  @property({ type: Boolean, reflect: true }) selected = false

  /** Declares a toggle button: `aria-pressed` is announced as `false` while not selected. Set by `c2-button-group` in selection modes. */
  @property({ type: Boolean, reflect: true }) toggle = false

  override render() {
    return html`
      <button
        class="c2-icon-button"
        part="button"
        type="button"
        ?disabled=${this.disabled}
        aria-pressed=${this.selected ? 'true' : this.toggle ? 'false' : nothing}
        aria-label=${ifDefined(this.ariaLabel ?? this.tooltip)}
      >
        <slot></slot>
        ${this.tooltip ? html`<c2-tooltip delay="800">${this.tooltip}</c2-tooltip>` : nothing}
      </button>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-icon-button': IconButton
  }
}
