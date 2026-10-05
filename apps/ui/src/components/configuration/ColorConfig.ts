import { LitElement, html, css, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { TinyColor } from '@ctrl/tinycolor'
import type { ColorSelectChangeEventDetail } from '@c2n/components/color-select'

import '@c2n/components/text-field'
import '@c2n/components/color-select'
import '@c2n/components/icon-button'
import '@c2n/feather-icons/icons/eye.js'
import '@c2n/feather-icons/icons/eye-off.js'
import type { TextField } from '@c2n/components/text-field'
import { formatAlpha, formatLightDark, parseAlpha, parseLightDark } from '../../utils/css-value.ts'

/**
 * Colour control: swatch + hex + alpha, with an eye button that hides the colour (`transparent`) while remembering it.
 *
 * The swatch is always present, so every colour row is pickable (see `render`). What the picker cannot *represent* —
 * an unset value, `currentColor`, `var(--token)`, a gradient — stays verbatim in the text field beside it instead of
 * being coerced to `#000000`. Editing commits on `input` (per keystroke, once the text parses) rather than only on
 * blur, and the alpha field shows `44%`, not `43.921568627450981%`.
 *
 * A `light-dark(<light>, <dark>)` value (how a gallery card gives a variant colour its dark-theme shade) shows as two
 * swatches, light then dark, each editing its own half.
 */
@customElement('demo-color-config')
export class ColorConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .color-config {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
        min-width: 0;
      }
      /* Swatch + hex + alpha read as one field: the swatch sits inside the hex input's padding. */
      .group {
        display: flex;
        align-items: center;
        position: relative;
        min-width: 0;
        border-radius: 6px;
        border: 1px solid transparent;
        transition: border-color 120ms var(--site-ease, ease);
      }
      .group:hover,
      .group:focus-within {
        border-color: var(--site-color-outline);
      }
      .group.is-hidden .hex,
      .group.is-hidden .alpha {
        opacity: 0.5;
      }
      c2-color-select {
        position: absolute;
        left: 7px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 1;
        --c2-color-select--width: 13px;
        --c2-color-select--height: 13px;
        --c2-color-select--border-top-left-radius: 3px;
        --c2-color-select--border-top-right-radius: 3px;
        --c2-color-select--border-bottom-left-radius: 3px;
        --c2-color-select--border-bottom-right-radius: 3px;
        --c2-color-select--border-top: 1px solid var(--site-color-outline-variant);
        --c2-color-select--border-right: 1px solid var(--site-color-outline-variant);
        --c2-color-select--border-bottom: 1px solid var(--site-color-outline-variant);
        --c2-color-select--border-left: 1px solid var(--site-color-outline-variant);
      }
      c2-text-field {
        --c2-text-field--border-top: none;
        --c2-text-field--border-right: none;
        --c2-text-field--border-bottom: none;
        --c2-text-field--border-left: none;
        --c2-text-field__hover--border-top: none;
        --c2-text-field__hover--border-right: none;
        --c2-text-field__hover--border-bottom: none;
        --c2-text-field__hover--border-left: none;
        --c2-text-field__focus--outline: 0 solid transparent;
        --c2-text-field--background: transparent;
        --c2-text-field--font-family: var(--site-font-mono);
        --c2-text-field--font-size: 11.5px;
      }
      .hex {
        width: 86px;
        --c2-text-field--padding-left: 26px;
        --c2-text-field--padding-right: 2px;
      }
      /* A value no picker can show (unset, var(), gradient, keyword) is editable as text, but still beside the
         swatch — so it keeps the same left inset the hex field uses to clear it. */
      .raw {
        flex: 1;
        min-width: 0;
        width: auto;
        --c2-text-field--padding-left: 26px;
      }
      .pair {
        display: flex;
        gap: 2px;
        min-width: 0;
      }
      .pair .hex {
        width: 78px;
      }
      .alpha {
        width: 48px;
        --c2-text-field--padding-left: 4px;
        --c2-text-field--padding-right: 4px;
      }
      .toggle {
        flex: none;
        --c2-icon-button__state-layer--size: 22px;
        --c2-icon-button__icon--width: 12px;
        --c2-icon-button__icon--height: 12px;
        --c2-icon-button--border-radius: 5px;
        --c2-icon-button__icon--color: var(--site-color-on-surface-muted);
        --c2-icon-button__icon__hover--color: var(--site-color-on-surface);
        --c2-icon-button__hover--background-color: var(--site-color-surface-container-2);
      }
    `,
  ]

  @property({ attribute: false }) name = ''
  /** Colour remembered while the value is hidden, so the eye button can put it back. */
  @property({ attribute: false }) hiddenColor = ''
  /** Set for a `background` / `color` property whose hidden state should be `transparent` rather than empty. */
  @property({ type: Boolean }) transparentWhenHidden = false

  @property({ attribute: false })
  set value(value: string) {
    this._value = (value ?? '').trim()
  }
  get value(): string {
    return this._value
  }
  @state() private _value = ''

  private get hiddenName() {
    return `hideValue${this.name}`
  }

  /** A colour the swatch can show, or `null` for keywords / `var()` / gradients / multi-token values. */
  private get pickable(): TinyColor | null {
    const value = this.isHidden ? this.hiddenColor : this._value
    if (!value) return null
    const color = new TinyColor(value)
    return color.isValid ? color : null
  }

  private get isHidden(): boolean {
    return !!this.hiddenColor
  }

  private emit(value: string, hiddenColor: string) {
    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        cancelable: true,
        detail: { [this.name]: value, [this.hiddenName]: hiddenColor },
      }),
    )
  }

  private commitColor(color: TinyColor) {
    // `toRgbString()` keeps the alpha channel; `toHexString()` would silently drop it.
    const value = color.getAlpha() < 1 ? color.toRgbString() : color.toHexString()
    if (this.isHidden) this.emit(this.hiddenValue(), value)
    else this.emit(value, '')
  }

  private hiddenValue() {
    return this.transparentWhenHidden ? 'transparent' : ''
  }

  private handleSwatchChange(event: CustomEvent<ColorSelectChangeEventDetail>) {
    const { h, s, v, a } = event.detail
    // An unset property shows a transparent (checkerboard) swatch, so the picker opens at alpha 0. Picking a hue
    // there would commit an invisible `rgba(r, g, b, 0)`; the first pick on an unset property means "use this
    // colour", so it lands fully opaque. Alpha stays under the user's control from then on.
    const alpha = !this.pickable && a === 0 ? 1 : a
    this.commitColor(new TinyColor({ h, s, v, a: alpha }))
  }

  private handleHexInput(event: Event & { target: TextField }) {
    const raw = event.target.value.trim()
    const color = new TinyColor(raw)
    // Typing an unfinished hex (`#ab`) must not clobber the value; wait until it parses.
    if (!color.isValid) return
    const current = this.pickable
    if (current) color.setAlpha(current.getAlpha())
    this.commitColor(color)
  }

  private handleRawInput(event: Event & { target: TextField }) {
    this.emit(event.target.value.trim(), '')
  }

  private handleAlphaInput(event: Event & { target: TextField }) {
    const alpha = parseAlpha(event.target.value)
    if (alpha === null) return
    const color = this.pickable?.clone() ?? new TinyColor('#000000')
    color.setAlpha(alpha)
    this.commitColor(color)
  }

  private handleToggle() {
    if (this.isHidden) {
      // Restore: the remembered colour becomes the value again.
      this.emit(this.hiddenColor, '')
    } else {
      const color = this.pickable
      this.emit(this.hiddenValue(), color ? color.toRgbString() : this._value)
    }
  }

  /** One half of a `light-dark()` pair: its own swatch and hex field, the other half kept as written. */
  private renderPairHalf(halves: [string, string], index: 0 | 1) {
    const color = new TinyColor(halves[index])
    const label = index === 0 ? 'Light theme colour' : 'Dark theme colour'
    const commit = (next: TinyColor) => {
      const value = next.getAlpha() < 1 ? next.toRgbString() : next.toHexString()
      const updated: [string, string] = [...halves]
      updated[index] = value
      // A hidden pair is edited in place of the remembered colour, as the single-colour control does.
      if (this.isHidden) this.emit(this.hiddenValue(), formatLightDark(updated[0], updated[1]))
      else this.emit(formatLightDark(updated[0], updated[1]), '')
    }
    return html`<div class="group ${this.isHidden ? 'is-hidden' : ''}">
      <c2-color-select
        placement="bottom-end"
        title=${label}
        .color=${color.isValid ? color.toRgbString() : 'transparent'}
        @change=${(event: CustomEvent<ColorSelectChangeEventDetail>) => {
          const { h, s, v, a } = event.detail
          commit(new TinyColor({ h, s, v, a }))
        }}
      ></c2-color-select>
      <c2-text-field
        class="hex"
        spellcheck="false"
        aria-label=${label}
        .value=${color.isValid ? (color.getAlpha() < 1 ? color.toHex8String() : color.toHexString()) : halves[index]}
        @input=${(event: Event & { target: TextField }) => {
          const raw = event.target.value.trim()
          const next = new TinyColor(raw)
          if (!next.isValid) return
          // A plain six-digit hex keeps the half's alpha; only a value that spells its own alpha replaces it.
          if (!/^#(?:[0-9a-f]{4}|[0-9a-f]{8})$|^(?:rgba|hsla)\(/i.test(raw) && color.isValid) next.setAlpha(color.getAlpha())
          commit(next)
        }}
      ></c2-text-field>
    </div>`
  }

  private renderPair(halves: [string, string]) {
    return html`<div class="color-config">
      <div class="pair">${this.renderPairHalf(halves, 0)}${this.renderPairHalf(halves, 1)}</div>
      <c2-icon-button
        class="toggle"
        aria-label=${this.isHidden ? 'Show this colour' : 'Hide this colour'}
        tooltip=${this.isHidden ? 'Show colour' : 'Hide colour'}
        @click=${() => (this.isHidden ? this.emit(this.hiddenColor, '') : this.emit(this.hiddenValue(), this._value))}
      >
        ${this.isHidden ? html`<c2-feather-eye-off></c2-feather-eye-off>` : html`<c2-feather-eye></c2-feather-eye>`}
      </c2-icon-button>
    </div>`
  }

  /**
   * The swatch is always offered, even with nothing set.
   *
   * 31% of the library's colour variables ship without a default, and `inherit` / `currentColor` / `var(…)` cannot be
   * parsed into a colour either. Hiding the picker on those left a bare text field, so the one thing you opened the
   * row to do — pick a colour — was the one thing you could not. Passing `transparent` makes `c2-color-select` show
   * its checkerboard, which reads as "unset" rather than as black.
   */
  render() {
    const pair = parseLightDark(this.isHidden ? this.hiddenColor : this._value)
    if (pair && pair.every((half) => new TinyColor(half).isValid)) return this.renderPair(pair)
    const color = this.pickable
    return html`<div class="color-config">
      <div class="group ${this.isHidden ? 'is-hidden' : ''}">
        <c2-color-select
          placement="bottom-end"
          title=${color ? 'Change colour' : 'Pick a colour'}
          .color=${color ? color.toRgbString() : 'transparent'}
          @change=${this.handleSwatchChange}
        ></c2-color-select>
        ${
          color
            ? html`
                <c2-text-field class="hex" spellcheck="false" .value=${color.toHexString()} @input=${this.handleHexInput}></c2-text-field>
                <c2-text-field class="alpha" .value=${formatAlpha(color.getAlpha())} @input=${this.handleAlphaInput}></c2-text-field>
              `
            : html`<c2-text-field class="raw" spellcheck="false" placeholder="unset" .value=${this._value} @input=${this.handleRawInput}></c2-text-field>`
        }
      </div>
      ${
        color
          ? html`<c2-icon-button
              class="toggle"
              aria-label=${this.isHidden ? 'Show this colour' : 'Hide this colour'}
              tooltip=${this.isHidden ? 'Show colour' : 'Hide colour'}
              @click=${this.handleToggle}
            >
              ${this.isHidden ? html`<c2-feather-eye-off></c2-feather-eye-off>` : html`<c2-feather-eye></c2-feather-eye>`}
            </c2-icon-button>`
          : nothing
      }
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-color-config': ColorConfig
  }
}
