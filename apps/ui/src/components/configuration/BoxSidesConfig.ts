import { LitElement, html, css, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

import '@c2n/text-field'
import '@c2n/icon-button'
import '@c2n/feather-icons/icons/link.js'
import '@c2n/feather-icons/icons/link-2.js'
import type { TextField } from '@c2n/text-field'
import { collapseBoxShorthand, expandBoxShorthand, parseLength } from '../../utils/css-value.ts'

type BoxKind = 'padding' | 'margin' | 'radius'

/** Field order and glyph per kind. Padding/margin go top-right-bottom-left; radius goes clockwise from top-left. */
const SIDE_LABELS: Record<BoxKind, string[]> = {
  padding: ['Top', 'Right', 'Bottom', 'Left'],
  margin: ['Top', 'Right', 'Bottom', 'Left'],
  radius: ['Top left', 'Top right', 'Bottom right', 'Bottom left'],
}

/**
 * The four sides of a box property (padding, margin) or the four corners of `border-radius`.
 *
 * Replaces the old `demo-padding-config` / `demo-border-radius-config` pair, which shared three bugs: the side
 * glyphs were hardcoded to `fill="#e6e1e3"` (invisible on the light theme), any non-px unit became `NaNpx`
 * (`Number('0.5rem')`), and a 2- or 3-value shorthand (`4px 8px`) was read as if it were a single value.
 */
@customElement('demo-box-sides-config')
export class BoxSidesConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .sides {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
        align-items: center;
        gap: 4px;
        min-width: 0;
      }
      c2-text-field {
        min-width: 0;
        --c2-text-field--font-family: var(--site-font-mono);
        --c2-text-field--font-size: 11.5px;
        --c2-text-field--padding-left: 4px;
        --c2-text-field--padding-right: 2px;
        --c2-text-field--gap: 2px;
      }
      /* The side glyph is drawn in CSS from the field's own text colour, so it follows the theme. */
      .glyph {
        flex: none;
        display: block;
        width: 11px;
        height: 11px;
        border: 1px solid currentColor;
        border-radius: 1px;
        opacity: 0.35;
      }
      .glyph[data-side='0'] {
        border-top-width: 3px;
      }
      .glyph[data-side='1'] {
        border-right-width: 3px;
      }
      .glyph[data-side='2'] {
        border-bottom-width: 3px;
      }
      .glyph[data-side='3'] {
        border-left-width: 3px;
      }
      .glyph[data-corner='0'] {
        border-top-left-radius: 6px;
        border-top-width: 2px;
        border-left-width: 2px;
      }
      .glyph[data-corner='1'] {
        border-top-right-radius: 6px;
        border-top-width: 2px;
        border-right-width: 2px;
      }
      .glyph[data-corner='2'] {
        border-bottom-right-radius: 6px;
        border-bottom-width: 2px;
        border-right-width: 2px;
      }
      .glyph[data-corner='3'] {
        border-bottom-left-radius: 6px;
        border-bottom-width: 2px;
        border-left-width: 2px;
      }
      .link {
        flex: none;
        --c2-icon-button__state-layer--size: 22px;
        --c2-icon-button__icon--width: 12px;
        --c2-icon-button__icon--height: 12px;
        --c2-icon-button--border-radius: 5px;
        --c2-icon-button__icon--color: var(--site-color-on-surface-muted);
        --c2-icon-button__icon__hover--color: var(--site-color-on-surface);
        --c2-icon-button__hover--background-color: var(--site-color-surface-container-2);
      }
      .link[aria-pressed='true'] {
        --c2-icon-button__icon--color: var(--site-color-primary);
      }
      .raw {
        --c2-text-field--padding-left: 8px;
      }
    `,
  ]

  @property() kind: BoxKind = 'padding'
  /** One variable per side, or a single variable holding the shorthand. */
  @property({ attribute: false }) names: string | string[] = ''
  @property({ attribute: false }) values: string | string[] | undefined = ''

  /** While linked, editing one field writes the same value to all four. */
  @state() private linked = false

  private get sides(): [string, string, string, string] | null {
    if (Array.isArray(this.values)) {
      const filled = [0, 1, 2, 3].map((index) => (this.values as string[])[index] ?? '0') as [string, string, string, string]
      return filled
    }
    return expandBoxShorthand(this.values ?? '')
  }

  /**
   * Keeps the unit the value already had when the user types a bare number: typing `8` into a `0.5rem` field
   * yields `8rem`, not `8px`, and an unparseable entry is passed through untouched.
   */
  private normalizeSide(raw: string, previous: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return '0'
    const typed = parseLength(trimmed)
    if (!typed) return trimmed
    if (typed.unit) return trimmed
    if (typed.value === 0) return '0'
    const previousUnit = parseLength(previous)?.unit
    return `${typed.value}${previousUnit || 'px'}`
  }

  private emit(sides: [string, string, string, string]) {
    const detail: Record<string, string> = {}
    if (Array.isArray(this.names)) {
      this.names.forEach((name, index) => (detail[name] = sides[index] ?? '0'))
    } else {
      detail[this.names] = collapseBoxShorthand(sides)
    }
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, cancelable: true, detail }))
  }

  private handleSideInput(event: Event & { target: TextField }) {
    const current = this.sides
    if (!current) return
    const index = Number(event.target.dataset.index)
    const next = this.normalizeSide(event.target.value, current[index])
    // A new array every time: mutating `current[index]` left Lit with the same reference and skipped the re-render.
    const sides = [...current] as [string, string, string, string]
    if (this.linked) sides.fill(next)
    else sides[index] = next
    this.emit(sides)
  }

  private handleRawInput(event: Event & { target: TextField }) {
    const name = Array.isArray(this.names) ? this.names[0] : this.names
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, cancelable: true, detail: { [name]: event.target.value.trim() } }))
  }

  render() {
    const sides = this.sides
    // `calc(…)`, `var(…)` or a 5-token value: no side fields can represent it, so edit it as text.
    if (!sides) {
      const value = typeof this.values === 'string' ? this.values : ''
      return html`<c2-text-field class="raw" spellcheck="false" .value=${value} @input=${this.handleRawInput}></c2-text-field>`
    }
    const labels = SIDE_LABELS[this.kind]
    const cornerAttr = this.kind === 'radius'
    return html`<div class="sides">
      ${sides.map(
        (value, index) => html`
          <c2-text-field
            spellcheck="false"
            data-index=${index}
            aria-label=${labels[index]}
            title=${labels[index]}
            .value=${value}
            @input=${this.handleSideInput}
          >
            <span
              slot="prefix-icon"
              class="glyph"
              data-side=${cornerAttr ? nothing : index}
              data-corner=${cornerAttr ? index : nothing}
              aria-hidden="true"
            ></span>
          </c2-text-field>
        `,
      )}
      <c2-icon-button
        class="link"
        aria-pressed=${String(this.linked)}
        aria-label=${this.linked ? 'Edit each side separately' : 'Edit all sides together'}
        tooltip=${this.linked ? 'Sides linked' : 'Link all sides'}
        @click=${() => (this.linked = !this.linked)}
      >
        ${this.linked ? html`<c2-feather-link></c2-feather-link>` : html`<c2-feather-link-2></c2-feather-link-2>`}
      </c2-icon-button>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-box-sides-config': BoxSidesConfig
  }
}
