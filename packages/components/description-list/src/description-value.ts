import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { toggleDescriptionState } from './custom-state.js'
import styles from './description-value.scss?inline'

/**
 * One value of a `c2-description-item` that has several, such as a plan's price in each of three plans. Values line
 * up in columns across the items of a list, and the list's `value-labels` names the columns. When the columns no
 * longer fit, the values stack under their label and each one shows its column name as a caption; the caption is
 * always there for assistive technology, which reads it with the value.
 *
 * @tag c2-description-value
 *
 * @slot - The value.
 *
 * A value the list's `highlight` marks carries the custom state `highlighted`, and a value of the list's
 * `selected-column` the state `selected`; both are styled through the variables below.
 *
 * @csspart caption - The column name before the value. It is shown only while the values are stacked, and visually hidden otherwise.
 * @csspart content - The wrapper around the default slot, which holds the value.
 *
 * @cssproperty {display} [--c2-description-value__caption--display=block] - `none` removes the column name, for screen readers too, so the stacked values show alone.
 * @cssproperty {pixel} [--c2-description-value__caption--width=40%] - Width of the caption beside a stacked value.
 * @cssproperty {color} [--c2-description-value__caption--color=#71717a]
 * @cssproperty {pixel} [--c2-description-value__caption--font-size=12px]
 * @cssproperty {font-weight} [--c2-description-value__caption--font-weight=600]
 *
 * @cssproperty {border-radius} [--c2-description-value__content--border-radius=4px] - Corners of a highlighted or selected value's background.
 * @cssproperty {pixel} [--c2-description-value__content--outset=4px] - How far that background reaches around the value, without moving it.
 * @cssproperty {color} [--c2-description-value__highlighted--background-color=#edf1fe]
 * @cssproperty {color} [--c2-description-value__highlighted--color=#18181b]
 * @cssproperty {font-weight} [--c2-description-value__highlighted--font-weight=600]
 * @cssproperty {color} [--c2-description-value__selected--background-color=#f4f4f5]
 */
@customElement('c2-description-value')
export class DescriptionValue extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  /** Column name, handed down by the item from its list's `value-labels`. */
  @state() private caption = ''

  /** Whether the item's values are stacked, so the caption is shown. */
  @state() private stacked = false

  /** What the list's `highlight` and `differences-only` compare, when the text is not it: `1024` for "1 TB", a date for "Mar 4". */
  @property() value?: string

  override connectedCallback() {
    super.connectedCallback()
    this.internals.role = 'definition'
  }

  /**
   * Called by the owning `c2-description-item` once this value has rendered, so server markup hydrates unchanged.
   * @internal
   */
  applyLayout(caption: string, stacked: boolean, highlighted = false, selected = false) {
    this.caption = caption
    this.stacked = stacked
    toggleDescriptionState(this.internals, 'highlighted', highlighted)
    toggleDescriptionState(this.internals, 'selected', selected)
  }

  // Written after render rather than bound in the template: the item can hand the caption over before this element
  // adopts server markup, and a binding whose value changed before hydration keeps the server's empty text.
  protected override updated(changed: PropertyValues<this>) {
    // The item compares its values, so a new comparison value has it lay them out again.
    if (changed.has('value')) this.parentElement?.closest('c2-description-item')?.requestUpdate()
    const caption = this.renderRoot.querySelector('.caption')
    if (!caption) return
    if (caption.textContent !== this.caption) caption.textContent = this.caption
    caption.classList.toggle('is-hidden', !this.stacked || !this.caption)
  }

  override render() {
    return html`
      <div class="c2-description-value">
        <span class="caption is-hidden" part="caption"></span>
        <span class="content" part="content"><slot></slot></span>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-description-value': DescriptionValue
  }
}
