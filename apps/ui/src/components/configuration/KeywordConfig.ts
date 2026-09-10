import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

import '@c2n/select'
import '@c2n/list-item'
import type { SelectionChangeEventDetail } from '@c2n/list'

/**
 * Select for a CSS property whose value is one of a fixed keyword set (`justify-content`, `text-transform`,
 * `object-fit`, `flex-direction`, `position`, …). These all used to fall through to a free-text field, so you had to
 * know and spell the keywords yourself.
 *
 * A current value outside the known set is kept and offered as an extra option rather than being dropped.
 */
@customElement('demo-keyword-config')
export class KeywordConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
        min-width: 0;
      }
      c2-select {
        width: 100%;
        --c2-select__button--font-size: 11.5px;
        --c2-select__button--padding: 4px 4px 4px 8px;
      }
    `,
  ]

  @property({ attribute: false }) name = ''
  @property({ attribute: false }) options: string[] = []

  @property({ attribute: false })
  set value(value: string) {
    this._value = (value ?? '').trim()
  }
  get value(): string {
    return this._value
  }
  @state() private _value = ''

  private handleChange(event: CustomEvent<SelectionChangeEventDetail>) {
    const value = event.detail.value[0]
    if (value === undefined) return
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, cancelable: true, detail: { [this.name]: value } }))
  }

  render() {
    const options = this._value && !this.options.includes(this._value) ? [this._value, ...this.options] : this.options
    return html`<c2-select .value=${this._value ? [this._value] : []} placeholder="default" required @selection-change=${this.handleChange}>
      ${options.map((option) => html`<c2-list-item value=${option}>${option}</c2-list-item>`)}
    </c2-select>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-keyword-config': KeywordConfig
  }
}
