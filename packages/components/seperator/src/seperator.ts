import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import styles from './seperator.scss?inline'

export type SeperatorOrientation = 'horizontal' | 'vertical'

/**
 * Thin rule that divides content, horizontally or vertically, with an optional label in the middle ("or", a section
 * name). It is `role="separator"` for assistive technology unless marked `decorative`. Thickness, colour and line
 * style are variables, so dashed or dotted dividers, inset list dividers and accent rules are all one variable away.
 *
 * @tag c2-seperator
 *
 * @slot - Optional label drawn between two line segments.
 *
 * @cssproperty {pixel} [--c2-seperator--thickness=1px]
 * @cssproperty {color} [--c2-seperator--color=#e4e4e7]
 * @cssproperty {border-style} [--c2-seperator--style=solid] - `dashed` or `dotted` for a broken line.
 * @cssproperty {pixel} [--c2-seperator--spacing=0px] - Margin on both sides across the line (above and below a horizontal rule).
 * @cssproperty {pixel} [--c2-seperator--inset-start=0px] - Margin before the line along its axis, e.g. to align with list text.
 * @cssproperty {pixel} [--c2-seperator--inset-end=0px] - Margin after the line along its axis.
 * @cssproperty {flex} [--c2-seperator__line-start--flex=1] - Growth of the segment before the label; `0 0 16px` pins the label near the start.
 * @cssproperty {flex} [--c2-seperator__line-end--flex=1] - Growth of the segment after the label.
 *
 * @cssproperty {pixel} [--c2-seperator__label--gap=12px] - Space between the label and the lines.
 * @cssproperty {color} [--c2-seperator__label--color=#71717a]
 * @cssproperty {font-size} [--c2-seperator__label--font-size=12px]
 * @cssproperty {font-weight} [--c2-seperator__label--font-weight=500]
 * @cssproperty {line-height} [--c2-seperator__label--line-height=1.4]
 * @cssproperty {pixel} --c2-seperator__label--letter-spacing
 * @cssproperty {text-transform} [--c2-seperator__label--text-transform=none]
 */
@customElement('c2-seperator')
export class Seperator extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Direction of the line. A vertical seperator stretches to its flex row; give it a height elsewhere. */
  @property({ reflect: true }) orientation: SeperatorOrientation = 'horizontal'

  /** Purely visual: removes the `separator` role so screen readers skip it. */
  @property({ type: Boolean, reflect: true }) decorative = false

  @state() private hasLabel = false

  /** `slotchange` does not fire for server-rendered slots, so read the label once after the first render. */
  override firstUpdated() {
    const slot = this.renderRoot.querySelector('slot')
    if (slot) this.updateLabel(slot)
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('decorative') || changed.has('orientation')) {
      if (this.decorative) {
        this.setAttribute('role', 'none')
        this.removeAttribute('aria-orientation')
      } else {
        this.setAttribute('role', 'separator')
        this.setAttribute('aria-orientation', this.orientation)
      }
    }
  }

  private handleSlotChange(event: Event) {
    this.updateLabel(event.target as HTMLSlotElement)
  }

  private updateLabel(slot: HTMLSlotElement) {
    this.hasLabel = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
  }

  override render() {
    return html`
      <div class=${classMap({ 'c2-seperator': true, 'has-label': this.hasLabel })} part="seperator">
        <span class="c2-seperator-line c2-seperator-line--start" part="line"></span>
        <span class="c2-seperator-label" part="label"><slot @slotchange=${this.handleSlotChange}></slot></span>
        <span class="c2-seperator-line c2-seperator-line--end" part="line"></span>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-seperator': Seperator
  }
}
