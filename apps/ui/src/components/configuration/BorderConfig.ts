import { LitElement, html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

import '@c2n/text-field'
import '@c2n/select'
import '@c2n/list-item'
import './ColorConfig.ts'
import type { TextField } from '@c2n/text-field'
import type { SelectionChangeEventDetail } from '@c2n/list'
import { BORDER_STYLES, formatBorder, parseBorder, parseLength, type BorderValue } from '../../utils/css-value.ts'

/**
 * `border` / `outline` control: width, style and colour as three linked fields.
 *
 * The style is a real field now. The previous version always re-emitted `<n>px solid <color>`, so opening the
 * inspector on a `border: none` or `border: 1px dashed …` and touching anything turned it into a solid border (or
 * `0px solid transparent`). A value the trio cannot represent (`var(--c2-theme--border)`) stays in a text field.
 */
@customElement('demo-border-config')
export class BorderConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .border-config {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
        min-width: 0;
      }
      .width {
        flex: none;
        width: 52px;
        --c2-text-field--font-family: var(--site-font-mono);
        --c2-text-field--font-size: 11.5px;
        --c2-text-field--padding-left: 6px;
        --c2-text-field--padding-right: 4px;
      }
      .style {
        flex: none;
        width: 82px;
        --c2-select__button--font-size: 11.5px;
        --c2-select__button--padding: 4px 4px 4px 8px;
      }
      demo-color-config {
        flex: 1;
        min-width: 0;
      }
      .raw {
        flex: 1;
        min-width: 0;
        --c2-text-field--font-family: var(--site-font-mono);
        --c2-text-field--font-size: 11.5px;
      }
    `,
  ]

  @property({ attribute: false }) name = ''
  @property({ attribute: false }) hiddenColor = ''

  @property({ attribute: false })
  set value(value: string) {
    this._value = (value ?? '').trim()
  }
  get value(): string {
    return this._value
  }
  @state() private _value = ''

  private get parsed(): BorderValue | null {
    return parseBorder(this._value)
  }

  private emit(value: string, hiddenColor = this.hiddenColor) {
    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        cancelable: true,
        detail: { [this.name]: value, [`hideValue${this.name}`]: hiddenColor },
      }),
    )
  }

  private commit(patch: Partial<BorderValue>, hiddenColor?: string) {
    const current = this.parsed
    if (!current) return
    this.emit(formatBorder({ ...current, ...patch }), hiddenColor)
  }

  private handleWidthInput(event: Event & { target: TextField }) {
    const raw = event.target.value.trim()
    // Accept any length the browser accepts, plus a bare number (treated as px, as in the rest of the panel).
    const length = parseLength(raw)
    const width = length ? (length.unit ? raw : `${length.value}px`) : raw
    if (!width) return
    const current = this.parsed
    // Giving a border a width when it had none only makes sense together with a visible style.
    this.commit({ width, style: current?.style === 'none' ? 'solid' : current?.style })
  }

  private handleStyleChange(event: CustomEvent<SelectionChangeEventDetail>) {
    const style = event.detail.value[0]
    if (!style) return
    const current = this.parsed
    // Turning a `none` border into a real one needs a width; 1px is the useful default.
    const width = style !== 'none' && (!current?.width || current.width === '0') ? '1px' : current?.width
    this.commit({ style, width })
  }

  private handleColorChange(event: CustomEvent<Record<string, string>>) {
    event.stopPropagation()
    this.commit({ color: event.detail[this.name] || 'currentColor' }, event.detail[`hideValue${this.name}`] ?? '')
  }

  private handleRawInput(event: Event & { target: TextField }) {
    this.emit(event.target.value.trim(), '')
  }

  render() {
    const border = this.parsed
    if (!border) {
      return html`<div class="border-config">
        <c2-text-field class="raw" spellcheck="false" .value=${this._value} @input=${this.handleRawInput}></c2-text-field>
      </div>`
    }
    const isNone = border.style === 'none'
    return html`<div class="border-config">
      <c2-text-field class="width" spellcheck="false" .value=${isNone ? '' : border.width} placeholder="0" @input=${this.handleWidthInput}></c2-text-field>
      <c2-select class="style" .value=${[border.style]} required @selection-change=${this.handleStyleChange}>
        ${BORDER_STYLES.map((style) => html`<c2-list-item value=${style}>${style}</c2-list-item>`)}
      </c2-select>
      ${
        isNone
          ? ''
          : html`<demo-color-config
              .name=${this.name}
              .value=${border.color}
              .hiddenColor=${this.hiddenColor}
              @change=${this.handleColorChange}
            ></demo-color-config>`
      }
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-border-config': BorderConfig
  }
}
