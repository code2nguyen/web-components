import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './float-button-action.scss?inline'

/**
 * One action of a `c2-float-button` speed dial: a small round button with a label chip beside it. The host is the
 * menu item (`role="menuitem"` through `ElementInternals`); the owning `c2-float-button` assigns the roving
 * `tabindex`, places the chip on the side that suits its `direction` and fires `action-select` when it is activated.
 *
 * @tag c2-float-button-action
 *
 * @slot - The icon (an inline `<svg>`, a `c2-feather-*` or a `c2-mat-icon` element).
 *
 * @csspart button - The round button.
 * @csspart label - The label chip beside the button.
 *
 * @cssproperty {pixel} [--c2-float-button-action__button--size=40px] - Diameter of the button.
 * @cssproperty {border-radius} [--c2-float-button-action__button--border-radius=999px]
 * @cssproperty {color} [--c2-float-button-action__button--background-color=#ffffff]
 * @cssproperty {color} [--c2-float-button-action__button__hover--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-float-button-action__button--color=#18181b] - Icon colour.
 * @cssproperty {border} [--c2-float-button-action__button--border=1px solid #e4e4e7]
 * @cssproperty {shadow} [--c2-float-button-action__button--box-shadow=0 2px 6px rgba(24, 24, 27, 0.16)]
 * @cssproperty {outline} [--c2-float-button-action__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-float-button-action__focus--outline-offset=2px]
 * @cssproperty {opacity} [--c2-float-button-action__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-float-button-action__icon--size=20px]
 *
 * @cssproperty {display} [--c2-float-button-action__label--display=block] - `none` for icon-only actions.
 * @cssproperty {color} [--c2-float-button-action__label--background-color=#ffffff]
 * @cssproperty {color} [--c2-float-button-action__label--color=#18181b]
 * @cssproperty {border} [--c2-float-button-action__label--border=1px solid #e4e4e7]
 * @cssproperty {font-size} [--c2-float-button-action__label--font-size=12px]
 * @cssproperty {font-weight} [--c2-float-button-action__label--font-weight=500]
 * @cssproperty {padding} [--c2-float-button-action__label--padding=4px 10px]
 * @cssproperty {border-radius} [--c2-float-button-action__label--border-radius=6px]
 * @cssproperty {shadow} [--c2-float-button-action__label--box-shadow=0 2px 6px rgba(24, 24, 27, 0.12)]
 * @cssproperty {inset} --c2-float-button-action__label--inset - Where the chip sits around the button. Defaults to the inline start for a vertical dial and above it for a horizontal one; set `50% auto auto calc(100% + 12px)` to put it on the right.
 * @cssproperty {transform} --c2-float-button-action__label--transform - Centres the chip on the button's axis; pair it with `--c2-float-button-action__label--inset` (`translateY(-50%)` beside, `translateX(-50%)` above).
 */
@customElement('c2-float-button-action')
export class FloatButtonAction extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Accessible name of the action, also shown in the label chip. */
  @property() label = ''

  /** Reported as `detail.value` of the owner's `action-select` event. */
  @property() value = ''

  /** A disabled action is skipped by the arrow keys and never fires `action-select`. */
  @property({ type: Boolean, reflect: true }) disabled = false

  private readonly internals = this.attachInternals()

  constructor() {
    super()
    this.internals.role = 'menuitem'
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('label')) this.internals.ariaLabel = this.label || null
    if (changed.has('disabled')) this.internals.ariaDisabled = this.disabled ? 'true' : null
  }

  override render() {
    return html`<span class="button" part="button"><slot></slot></span
      >${this.label ? html`<span class="label" part="label" aria-hidden="true">${this.label}</span>` : nothing}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-float-button-action': FloatButtonAction
  }
}
