import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './checkbox.scss?inline'
import { redispatchEvent } from '@c2n/wc-utils/dom-helper.js'

/**
 * @tag c2-checkbox
 *
 * @event {Event} change
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
 *
 * @cssproperty {color} [--c2-checkbox__container__selected--background-color=#476ef9]
 * @cssproperty {border} [--c2-checkbox__container__selected--border-top=0px solid transparent]
 * @cssproperty {border} [--c2-checkbox__container__selected--border-right=0px solid transparent]
 * @cssproperty {border} [--c2-checkbox__container__selected--border-bottom=0px solid transparent]
 * @cssproperty {border} [--c2-checkbox__container__selected--border-left=0px solid transparent]
 
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
 * @cssproperty {pixel} [--c2-checkbox__touchable--size=48px]
 *
 * @cssproperty {border-radius} [--c2-checkbox__state-layer--border-top-left-radius=999px]
 * @cssproperty {border-radius} [--c2-checkbox__state-layer--border-top-right-radius=999px]
 * @cssproperty {border-radius} [--c2-checkbox__state-layer--border-bottom-left-radius=999px]
 * @cssproperty {border-radius} [--c2-checkbox__state-layer--border-bottom-right-radius=999px]
 *
 * @cssproperty {pixel} [--c2-checkbox__state-layer--size=40px]
 * @cssproperty {color} [--c2-checkbox__state-layer__hover__unselected--color=#bcbcc6]
 * @cssproperty {color} [--c2-checkbox__state-layer__hover__selected--color=#476ef9]
 *
 */
@customElement('c2-checkbox')
export class Checkbox extends LitElement {
  @query('input') protected formElement!: HTMLInputElement

  @property({ type: Boolean, reflect: true }) checked = false

  @property({ type: Boolean, reflect: true }) indeterminate = false

  @property({ type: Boolean, reflect: true }) disabled = false

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
          <!-- check state -->
          <slot name="checkmark">
            <svg class="c2-checkbox__checkmark" viewBox="0 0 24 24">
              <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
          </slot>
          <!-- indeterminate state -->
          <slot name="mixedmark">
            <svg class="c2-checkbox__mixedmark" c2-checkbox__mixedmark viewBox="0 0 24 24">
              <path fill="currentColor" d="M19 13H5v-2h14v2z" />
            </svg>
          </slot>
          <!-- unchecked state -->
          <slot name="uncheckmark"> </slot>
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
