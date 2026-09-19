import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './button.scss?inline'

/**
 * Action button with optional leading/trailing icons, busy state and toggle-button semantics.
 *
 * @tag c2-button
 *
 * @slot default - Button label text.
 * @slot prefix-icon - Icon shown before the label. Replaced by `running-icon` while the button is running.
 * @slot suffix-icon - Icon shown after the label.
 * @slot running-icon - Icon shown in place of the prefix icon while `running` is set. Defaults to a spinner; the slot wrapper rotates, so slotted content spins too.
 *
 * @cssproperty {pixel} [--c2-button__container--height=36px]
 * @cssproperty {width} [--c2-button__container--width=auto] - Width of the host. `100%` makes a full-width button.
 * @cssproperty {justify-content} [--c2-button__container--justify-content=center] - How the label and its icons sit in the button. `flex-start` for a row-shaped button (a list entry, a group header), `space-between` to push a trailing hint to the far edge.
 * @cssproperty {number} [--c2-button__label--flex-grow=0] - Whether the label takes the leftover width. `1` pushes a suffix icon to the far edge of a fixed-width button.
 * @cssproperty {justify-content} [--c2-button__label--justify-content=center] - How the label sits once it has grown. `flex-start` keeps the text next to a prefix icon.
 * @cssproperty {padding} [--c2-button__container--padding-left=16px]
 * @cssproperty {padding} [--c2-button__container--padding-right=16px]
 * @cssproperty {pixel} [--c2-button__container--gap=8px]
 * @cssproperty {border-radius} [--c2-button__container--border-radius=6px]
 * @cssproperty {border} [--c2-button__container--border=1px solid transparent]
 * @cssproperty {color} [--c2-button__container--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-button__container--color=#ffffff]
 * @cssproperty {pixel} [--c2-button__container--font-size=14px]
 * @cssproperty {font-weight} [--c2-button__container--font-weight=500]
 *
 * @cssproperty {color} [--c2-button__container__hover--background-color=rgb(1, 84, 184)]
 * @cssproperty {color} --c2-button__container__hover--color
 * @cssproperty {border} --c2-button__container__hover--border
 *
 * @cssproperty {color} [--c2-button__container__active--background-color=rgb(1, 70, 154)]
 *
 * @cssproperty {color} --c2-button__container__selected--background-color - Pressed state of a toggle button (see `selected`).
 * @cssproperty {color} --c2-button__container__selected--color
 * @cssproperty {border} --c2-button__container__selected--border
 *
 * @cssproperty {outline} [--c2-button__container__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-button__container__focus--outline-offset=2px]
 *
 * @cssproperty {opacity} [--c2-button__container__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-button__icon--size=18px]
 * @cssproperty {color} --c2-button__icon--color
 *
 * @cssproperty {pixel} [--c2-button__running-icon--size=18px]
 * @cssproperty {color} --c2-button__running-icon--color
 * @cssproperty {duration} [--c2-button__running-icon--animation-duration=800ms]
 */
@customElement('c2-button')
export class Button extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  /** Disables the button: it no longer receives clicks and is rendered dimmed. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Marks the button as busy: clicks are ignored and the `running-icon` slot replaces the prefix icon. */
  @property({ type: Boolean, reflect: true }) running = false

  /** Pressed state of a toggle button (`aria-pressed="true"`); styled with the `container__selected--*` variables. */
  @property({ type: Boolean, reflect: true }) selected = false

  /** Declares a toggle button: `aria-pressed` is announced as `false` while not selected. Set by `c2-button-group` in selection modes. */
  @property({ type: Boolean, reflect: true }) toggle = false

  override render() {
    return html`
      <button
        class="c2-button"
        part="button"
        ?disabled=${this.disabled || this.running}
        aria-busy=${this.running ? 'true' : nothing}
        aria-pressed=${this.selected ? 'true' : this.toggle ? 'false' : nothing}
      >
        ${
          this.running
            ? html`<span class="running-icon" part="running-icon">
                <slot name="running-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" focusable="false">
                    <path d="M21 12a9 9 0 1 1-6.22-8.56"></path>
                  </svg>
                </slot>
              </span>`
            : html`<slot name="prefix-icon" class="icon prefix-icon"></slot>`
        }
        <span class="label"><slot></slot></span>
        <slot name="suffix-icon" class="icon suffix-icon"></slot>
      </button>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-button': Button
  }
}
