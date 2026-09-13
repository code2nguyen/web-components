import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
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

  /** List stacks rows, grid fills equal columns, and mixed gives image tiles columns while file rows span the group. */
  @property({ reflect: true }) layout: 'list' | 'grid' | 'mixed' = 'list'

  /** Accessible name for the attachment collection. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = 'Attachments'

  override render() {
    return html`<div class="group" role="list" aria-label=${this.ariaLabel ?? 'Attachments'}><slot></slot></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-attachment-group': AttachmentGroup
  }
}
