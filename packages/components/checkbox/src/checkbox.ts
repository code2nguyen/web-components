import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './checkbox.scss?inline'
import { redispatchEvent } from '@c2n/core/dom-helper.js'

/**
 * A checkbox with native `<input type="checkbox">` behaviour. The visible box sits centred in a square touch target
 * (`state-layer--size`) that doubles as the hover layer; that layer is transparent unless a
 * `state-layer__hover__*--color` is set, so the default look is quiet.
 *
 * @tag c2-checkbox
 *
 * @slot checkmark - Icon shown when checked: an inline SVG, a `c2-feather-*` icon or a `c2-mat-icon`. Defaults to a check.
 * @slot mixedmark - Icon shown when indeterminate. Defaults to a dash.
 * @slot uncheckmark - Icon shown when unchecked. Empty by default.
 *
 * @event {Event} change - Re-dispatched from the inner input when the checked state changes.
 *
 * @cssproperty {pixel} [--c2-checkbox__container--height=18px]
 * @cssproperty {pixel} [--c2-checkbox__container--width=18px]
 * @cssproperty {border-radius} [--c2-checkbox__container--border-top-left-radius=4px]
 * @cssproperty {border-radius} [--c2-checkbox__container--border-top-right-radius=4px]
 * @cssproperty {border-radius} [--c2-checkbox__container--border-bottom-left-radius=4px]
 * @cssproperty {border-radius} [--c2-checkbox__container--border-bottom-right-radius=4px]
 *
 * @cssproperty {border} [--c2-checkbox__container--border-top=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-checkbox__container--border-right=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-checkbox__container--border-bottom=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-checkbox__container--border-left=1px solid #bcbcc6]
 * @cssproperty {color} [--c2-checkbox__container--background-color=transparent]
 *
 * @cssproperty {color} [--c2-checkbox__container__selected--background-color=#476ef9]
 * @cssproperty {border} [--c2-checkbox__container__selected--border-top=0px solid transparent]
 * @cssproperty {border} [--c2-checkbox__container__selected--border-right=0px solid transparent]
 * @cssproperty {border} [--c2-checkbox__container__selected--border-bottom=0px solid transparent]
 * @cssproperty {border} [--c2-checkbox__container__selected--border-left=0px solid transparent]
 *
 * @cssproperty {color} --c2-checkbox__container__selected__hover--background-color
 *
 * @cssproperty {outline} [--c2-checkbox__container__focus--outline=2px solid rgba(71, 110, 249, 0.4)]
 * @cssproperty {pixel} [--c2-checkbox__container__focus--outline-offset=2px]
 *
 * @cssproperty {opacity} [--c2-checkbox__container__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-checkbox__checkmark--size=12px]
 * @cssproperty {color} [--c2-checkbox__checkmark--color=#ffffff]
 *
 * @cssproperty {pixel} [--c2-checkbox__mixedmark--size=12px]
 * @cssproperty {color} [--c2-checkbox__mixedmark--color=#ffffff]
 *
 * @cssproperty {pixel} [--c2-checkbox__uncheckmark--size=12px]
 * @cssproperty {color} [--c2-checkbox__uncheckmark--color=#ffffff]
 *
 * @cssproperty {pixel} [--c2-checkbox__state-layer--size=32px]
 * @cssproperty {border-radius} [--c2-checkbox__state-layer--border-top-left-radius=6px]
 * @cssproperty {border-radius} [--c2-checkbox__state-layer--border-top-right-radius=6px]
 * @cssproperty {border-radius} [--c2-checkbox__state-layer--border-bottom-left-radius=6px]
 * @cssproperty {border-radius} [--c2-checkbox__state-layer--border-bottom-right-radius=6px]
 * @cssproperty {color} --c2-checkbox__state-layer__hover__unselected--color
 * @cssproperty {color} --c2-checkbox__state-layer__hover__selected--color
 */
@customElement('c2-checkbox')
export class Checkbox extends LitElement {
  @query('input') protected formElement!: HTMLInputElement

  /** Whether the checkbox is checked. */
  @property({ type: Boolean, reflect: true }) checked = false

  /** Shows the mixed state (neither checked nor unchecked), e.g. for a parent of a partially selected group. */
  @property({ type: Boolean, reflect: true }) indeterminate = false

  /** Disables the control: it no longer toggles and is rendered dimmed. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Form field name forwarded to the inner input. */
  @property({ type: String }) name = ''

  @property({ type: String, attribute: 'aria-label' })
  override ariaLabel!: string

  @property({ type: String, attribute: 'aria-labelledby' })
  ariaLabelledBy!: undefined | string

  @property({ type: String, attribute: 'aria-describedby' })
  ariaDescribedBy!: undefined | string

  override render() {
    const ariaChecked = this.indeterminate ? 'mixed' : undefined
    return html`
      <div class="c2-checkbox">
        <input
          class="c2-checkbox-input"
          type="checkbox"
          name="${ifDefined(this.name)}"
          aria-checked="${ifDefined(ariaChecked)}"
          aria-label="${ifDefined(this.ariaLabel)}"
          aria-labelledby="${ifDefined(this.ariaLabelledBy)}"
          aria-describedby="${ifDefined(this.ariaDescribedBy)}"
          ?disabled="${this.disabled}"
          .indeterminate="${this.indeterminate}"
          ?checked="${this.checked}"
          @change="${this.handleChange}"
        />
        <div class="c2-checkbox__background">
          <!-- Each mark slot sits in its own positioned wrapper, so any slotted content (an inline SVG, a c2-feather-*
               icon, a c2-mat-icon, or a framework wrapper around them) is centred, sized and faded as one unit. -->
          <span class="c2-checkbox__mark c2-checkbox__mark--check" part="checkmark">
            <slot name="checkmark">
              <svg viewBox="0 0 24 24">
                <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
            </slot>
          </span>
          <span class="c2-checkbox__mark c2-checkbox__mark--mixed" part="mixedmark">
            <slot name="mixedmark">
              <svg viewBox="0 0 24 24">
                <path fill="currentColor" d="M19 13H5v-2h14v2z" />
              </svg>
            </slot>
          </span>
          <span class="c2-checkbox__mark c2-checkbox__mark--uncheck" part="uncheckmark">
            <slot name="uncheckmark"></slot>
          </span>
        </div>
        <div class="c2-checkbox-state-layer"></div>
      </div>
    `
  }

  override focus(options?: FocusOptions | undefined): void {
    this.formElement?.focus(options)
  }

  protected override update(changedProperties: PropertyValues) {
    if (changedProperties.has('checked') && this.formElement) {
      this.formElement.checked = this.checked
    }
    super.update(changedProperties)
  }

  protected handleChange(event: Event) {
    this.checked = this.formElement.checked
    this.indeterminate = this.formElement.indeterminate
    redispatchEvent(this, event)
  }

  static override styles = unsafeCSS(styles)
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-checkbox': Checkbox
  }
}
