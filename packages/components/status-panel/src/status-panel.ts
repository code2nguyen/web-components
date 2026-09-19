import { LitElement, html, isServer, unsafeCSS, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './status-panel.scss?inline'

export type StatusPanelStatus = 'neutral' | 'info' | 'success' | 'warning' | 'error'
export type StatusPanelAlign = 'center' | 'start'

/**
 * Presents a meaningful application state with optional media, supporting copy, actions and additional content. Use it
 * for empty collections, completed operations, errors, unavailable pages and other places where the user needs a clear
 * explanation and next step.
 *
 * @tag c2-status-panel
 *
 * @slot media - Illustration, icon, avatar or other visual. A status icon is shown by default.
 * @slot title - Short heading. Falls back to the `heading` attribute.
 * @slot description - Supporting explanation. Falls back to the `description` attribute.
 * @slot actions - Primary and secondary actions.
 * @slot content - Additional details, lists or controls below the actions.
 *
 * @cssproperty {length} [--c2-status-panel__container--width=100%] - Panel width.
 * @cssproperty {length} [--c2-status-panel__container--max-width=720px] - Maximum panel width.
 * @cssproperty {length} [--c2-status-panel__container--min-height=240px] - Minimum panel height.
 * @cssproperty {padding} [--c2-status-panel__container--padding=40px 24px] - Panel padding.
 * @cssproperty {length} [--c2-status-panel__container--gap=24px] - Space between the message, actions and content.
 * @cssproperty {border} [--c2-status-panel__container--border=1px solid transparent] - Panel border.
 * @cssproperty {border-radius} [--c2-status-panel__container--border-radius=14px] - Panel corner radius.
 * @cssproperty {color} [--c2-status-panel__container--background-color=transparent] - Panel background.
 * @cssproperty {length} [--c2-status-panel__media--size=64px] - Media container width and height.
 * @cssproperty {border-radius} [--c2-status-panel__media--border-radius=999px] - Media container corner radius.
 * @cssproperty {color} [--c2-status-panel__media--background-color=#f4f4f5] - Neutral media background.
 * @cssproperty {color} [--c2-status-panel__media--color=#71717a] - Neutral media colour.
 * @cssproperty {length} [--c2-status-panel__media-icon--size=32px] - Default and slotted icon size.
 * @cssproperty {color} [--c2-status-panel__media__info--background-color=#edf1fe] - Information media background.
 * @cssproperty {color} [--c2-status-panel__media__info--color=rgb(2, 101, 220)] - Information media colour.
 * @cssproperty {color} [--c2-status-panel__media__success--background-color=#ecfdf3] - Success media background.
 * @cssproperty {color} [--c2-status-panel__media__success--color=#15803d] - Success media colour.
 * @cssproperty {color} [--c2-status-panel__media__warning--background-color=#fffbeb] - Warning media background.
 * @cssproperty {color} [--c2-status-panel__media__warning--color=#b45309] - Warning media colour.
 * @cssproperty {color} [--c2-status-panel__media__error--background-color=#fef2f2] - Error media background.
 * @cssproperty {color} [--c2-status-panel__media__error--color=#b91c1c] - Error media colour.
 * @cssproperty {length} [--c2-status-panel__header--gap=6px] - Space between title and description.
 * @cssproperty {color} [--c2-status-panel__title--color=#18181b] - Title colour.
 * @cssproperty {font-size} [--c2-status-panel__title--font-size=20px] - Title font size.
 * @cssproperty {font-weight} [--c2-status-panel__title--font-weight=600] - Title font weight.
 * @cssproperty {line-height} [--c2-status-panel__title--line-height=28px] - Title line height.
 * @cssproperty {color} [--c2-status-panel__description--color=#71717a] - Description colour.
 * @cssproperty {font-size} [--c2-status-panel__description--font-size=14px] - Description font size.
 * @cssproperty {line-height} [--c2-status-panel__description--line-height=20px] - Description line height.
 * @cssproperty {length} [--c2-status-panel__description--max-width=480px] - Maximum readable description width.
 * @cssproperty {length} [--c2-status-panel__actions--gap=8px] - Space between actions.
 * @cssproperty {length} [--c2-status-panel__content--max-width=560px] - Maximum additional-content width.
 * @cssproperty {padding} [--c2-status-panel__content--padding=16px] - Additional-content padding.
 * @cssproperty {border-radius} [--c2-status-panel__content--border-radius=8px] - Additional-content corner radius.
 * @cssproperty {color} [--c2-status-panel__content--background-color=#f4f4f5] - Additional-content background.
 */
@customElement('c2-status-panel')
export class StatusPanel extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Visual tone and default media icon. */
  @property({ reflect: true }) status: StatusPanelStatus = 'neutral'

  /** Centers the composition or aligns it to the inline start. */
  @property({ reflect: true }) align: StatusPanelAlign = 'center'

  /** Plain-text title fallback. Use the `title` slot for rich content. */
  @property() heading = ''

  /** Plain-text description fallback. Use the `description` slot for rich content. */
  @property() description = ''

  /** Accessible heading level used by the title region. */
  @property({ type: Number, attribute: 'heading-level' }) headingLevel = 2

  @state() private titleSlotted = false
  @state() private descriptionSlotted = false
  @state() private actionsSlotted = false
  @state() private contentSlotted = false

  override connectedCallback() {
    super.connectedCallback()
    if (!isServer) this.syncSlotState()
  }

  private syncSlotState() {
    this.titleSlotted = this.querySelector('[slot="title"]') !== null
    this.descriptionSlotted = this.querySelector('[slot="description"]') !== null
    this.actionsSlotted = this.querySelector('[slot="actions"]') !== null
    this.contentSlotted = this.querySelector('[slot="content"]') !== null
  }

  private handleSlotChange = (event: Event) => {
    const slot = event.currentTarget as HTMLSlotElement
    const assigned = slot.assignedElements().length > 0
    if (slot.name === 'title') this.titleSlotted = assigned
    else if (slot.name === 'description') this.descriptionSlotted = assigned
    else if (slot.name === 'actions') this.actionsSlotted = assigned
    else if (slot.name === 'content') this.contentSlotted = assigned
  }

  private renderDefaultMedia(): TemplateResult {
    if (this.status === 'success') return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>`
    if (this.status === 'warning') {
      return html`<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"></path>
        <path d="M12 9v4M12 17h.01"></path>
      </svg>`
    }
    if (this.status === 'error') return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>`
    if (this.status === 'info') {
      return html`<svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 11v5M12 8h.01"></path>
      </svg>`
    }
    return html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8.5 7 4h10l3 4.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"></path>
      <path d="M4 13h4l1.5 2h5l1.5-2h4M7 4l2 4h6l2-4"></path>
    </svg>`
  }

  override render() {
    const hasTitle = Boolean(this.heading) || this.titleSlotted
    const hasDescription = Boolean(this.description) || this.descriptionSlotted

    return html`
      <div class="container">
        <div class="message">
          <div class="media"><slot name="media" @slotchange=${this.handleSlotChange}>${this.renderDefaultMedia()}</slot></div>
          <div class="header" ?hidden=${!hasTitle && !hasDescription}>
            <div class="title" role="heading" aria-level=${this.headingLevel} ?hidden=${!hasTitle}>
              <slot name="title" @slotchange=${this.handleSlotChange}>${this.heading}</slot>
            </div>
            <div class="description" ?hidden=${!hasDescription}>
              <slot name="description" @slotchange=${this.handleSlotChange}>${this.description}</slot>
            </div>
          </div>
        </div>
        <div class="content" ?hidden=${!this.contentSlotted}><slot name="content" @slotchange=${this.handleSlotChange}></slot></div>
        <div class="actions" ?hidden=${!this.actionsSlotted}><slot name="actions" @slotchange=${this.handleSlotChange}></slot></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-status-panel': StatusPanel
  }
}
