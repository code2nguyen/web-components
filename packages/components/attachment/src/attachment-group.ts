import { LitElement, html, unsafeCSS } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './attachment-group.scss?inline'

export type AttachmentGroupLayout = 'list' | 'grid' | 'mixed'

/**
 * Arranges related attachments as a responsive list or grid.
 *
 * @tag c2-attachment-group
 * @slot - `c2-attachment` elements.
 * @slotcomponent c2-attachment
 *
 * @cssproperty {pixel} [--c2-attachment-group--gap=8px]
 * @cssproperty {pixel} [--c2-attachment-group--min-column-width=240px]
 */
@customElement('c2-attachment-group')
export class AttachmentGroup extends LitElement {
  static override styles = unsafeCSS(styles)

  private managedItems = new Set<HTMLElement>()

  /** List stacks rows, grid fills equal columns, and mixed gives image tiles columns while file rows span the group. */
  @property({ reflect: true }) layout: 'list' | 'grid' | 'mixed' = 'list'

  /** Accessible name for the attachment collection. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = 'Attachments'

  override disconnectedCallback() {
    this.clearManagedItems()
    super.disconnectedCallback()
  }

  private clearManagedItems() {
    for (const item of this.managedItems) {
      if (item.getAttribute('role') === 'listitem') item.removeAttribute('role')
    }
    this.managedItems.clear()
  }

  private handleSlotChange(event: Event) {
    const slot = event.currentTarget as HTMLSlotElement
    const attachments = new Set(slot.assignedElements({ flatten: true }).filter((element): element is HTMLElement => element.localName === 'c2-attachment'))

    for (const item of this.managedItems) {
      if (!attachments.has(item) && item.getAttribute('role') === 'listitem') item.removeAttribute('role')
    }

    const managedItems = new Set<HTMLElement>()
    for (const attachment of attachments) {
      if (!attachment.hasAttribute('role')) {
        attachment.setAttribute('role', 'listitem')
        managedItems.add(attachment)
      } else if (this.managedItems.has(attachment) && attachment.getAttribute('role') === 'listitem') {
        managedItems.add(attachment)
      }
    }
    this.managedItems = managedItems
  }

  override render() {
    return html`<div class="group" role="list" aria-label=${this.ariaLabel ?? 'Attachments'}><slot @slotchange=${this.handleSlotChange}></slot></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-attachment-group': AttachmentGroup
  }
}
