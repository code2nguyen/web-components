import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import '@c2n/details'
import type { Details } from '@c2n/details'
import { provide } from '@lit/context'
import { accordionContext, type AccordionContext } from '@c2n/details/details-context.js'
import styles from './accordion.scss?inline'

/**
 * A connected disclosure surface with shared borders, outside corners and animated panels.
 * Opening a panel closes its siblings unless `multiple` is set.
 *
 * @tag c2-accordion
 *
 * @slot - Direct `c2-details` children to coordinate.
 * @cssproperty {pixel} [--c2-accordion--gap=0px] - Space between panels. Zero joins their borders and corners; a positive gap separates them into cards.
 * @cssproperty {pixel} [--c2-accordion--border-width=1px] - Width of the outer frame and shared panel dividers.
 * @cssproperty {color} [--c2-accordion--border-color=#d5d5d5] - Color of the outer frame and shared panel dividers.
 * @cssproperty {border-radius} [--c2-accordion--border-radius=8px] - Outside corner radius. With a positive gap, applies to every panel.
 * @cssproperty {time} [--c2-accordion--transition-duration=300ms] - Panel and chevron animation duration. Set to 0ms for instant toggling; respects reduced motion.
 * @slotcomponent c2-details
 */
@customElement('c2-accordion')
export class Accordion extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Allows several panels to remain expanded. All panels may be closed in either mode. */
  @property({ type: Boolean, reflect: true }) multiple = false

  @provide({ context: accordionContext })
  protected accordion: AccordionContext = {
    expandedChanged: (panel) => {
      if (this.isConnected && this.panels.includes(panel) && panel.expanded) this.closeOthers(panel)
    },
  }

  private get panels(): Details[] {
    return (this.renderRoot.querySelector('slot')?.assignedElements() ?? []).filter((element): element is Details => element.localName === 'c2-details')
  }

  override connectedCallback() {
    super.connectedCallback()
    if (this.hasUpdated) this.syncPanels()
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('multiple')) this.syncPanels()
  }

  private syncPanels() {
    if (!this.isConnected) return
    this.closeOthers(this.panels.find((panel) => panel.expanded))
  }

  private closeOthers(expandedPanel?: Details) {
    if (this.multiple) return
    for (const panel of this.panels) {
      if (panel !== expandedPanel && panel.expanded) panel.expanded = false
    }
  }

  override render() {
    return html`
      <div class="c2-accordion">
        <slot @slotchange=${this.syncPanels}></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-accordion': Accordion
  }
}
