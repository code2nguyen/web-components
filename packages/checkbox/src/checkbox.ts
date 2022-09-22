import { LitElement, html, unsafeCSS, PropertyValues } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './checkbox.scss?inline'
/**
 * An example element.
 *
 * @slot - This element has a slot
 * @csspart button - The button
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
          <slot name="checkmark">
            <svg class="c2-checkbox__checkmark" viewBox="0 0 24 24">
              <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
          </slot>
          <slot name="mixedmark">
            <svg class="c2-checkbox__mixedmark" c2-checkbox__mixedmark viewBox="0 0 24 24">
              <path fill="currentColor" d="M19 13H5v-2h14v2z" />
            </svg>
          </slot>
        </div>
        <div class="c2-checkbox-state-layer"></div>
      </div>
    `
  }

  protected override update(changedProperties: PropertyValues) {
    if (changedProperties.has('checked') && this.formElement) {
      this.formElement.checked = this.checked
    }
    super.update(changedProperties)
  }

  protected handleChange() {
    this.checked = this.formElement.checked
    this.indeterminate = this.formElement.indeterminate
    this.dispatchEvent(
      new Event('change', {
        bubbles: true,
        composed: true,
      })
    )
  }

  static override styles = unsafeCSS(styles)
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-checkbox': Checkbox
  }
}
