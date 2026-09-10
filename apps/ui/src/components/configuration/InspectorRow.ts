import { LitElement, html, css, nothing } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import '@c2n/label'
import '@c2n/icon-button'
import '@c2n/tooltip'
import '@c2n/feather-icons/icons/rotate-ccw.js'
import '@c2n/feather-icons/icons/info.js'

/**
 * One property row of the inspector: label on the left, control slotted on the right.
 *
 * Every row goes through here so the whole panel shares a single label column, a single "this differs from the
 * authored example" affordance and a single revert button. Previously each control drew (or, for padding, border and
 * border-radius, silently omitted) its own label, which is why those rows arrived as anonymous number boxes.
 */
@customElement('demo-inspector-row')
export class InspectorRow extends LitElement {
  static styles = [
    css`
      :host {
        display: grid;
        grid-template-columns: var(--row-label-width, 88px) minmax(0, 1fr);
        align-items: center;
        gap: 8px;
        min-height: 28px;
        padding: 0 4px 0 12px;
      }
      :host([stacked]) {
        grid-template-columns: minmax(0, 1fr);
        align-items: stretch;
        gap: 4px;
      }
      .label {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
      }
      c2-label {
        --c2-label__container--font-size: 11.5px;
        --c2-label__container--font-weight: 400;
        --c2-label__container--color: var(--site-color-on-surface-variant);
        --c2-label__container--text-transform: capitalize;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* The dot is the only "changed" signal in the row, so it must survive a hover over the revert button. */
      .dot {
        flex: none;
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: var(--site-color-primary);
      }
      .control {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
        min-width: 0;
      }
      .revert {
        flex: none;
        --c2-icon-button__state-layer--size: 22px;
        --c2-icon-button__icon--width: 12px;
        --c2-icon-button__icon--height: 12px;
        --c2-icon-button--border-radius: 5px;
        --c2-icon-button__icon--color: var(--site-color-on-surface-muted);
        --c2-icon-button__icon__hover--color: var(--site-color-primary);
        --c2-icon-button__hover--background-color: var(--site-color-surface-container-2);
        /* Hidden until the row is hovered or focused so the column does not read as a wall of icons. */
        opacity: 0;
        transition: opacity 120ms var(--site-ease, ease);
      }
      :host(:hover) .revert,
      :host(:focus-within) .revert {
        opacity: 1;
      }
      .info {
        flex: none;
        display: inline-flex;
        color: var(--site-color-on-surface-muted);
        width: 11px;
        height: 11px;
      }
      .info c2-feather-info {
        --c2-feather-icon--size: 11px;
      }
    `,
  ]

  @property() label = ''
  /** Manifest description, shown as a tooltip on an info glyph beside the label. */
  @property() description = ''
  /** The value differs from the authored example: show the dot and enable the revert button. */
  @property({ type: Boolean, reflect: true }) changed = false
  /** Full-width control under the label instead of beside it (used by the box-sides and font controls). */
  @property({ type: Boolean, reflect: true }) stacked = false

  private handleRevert() {
    this.dispatchEvent(new CustomEvent('revert', { bubbles: true, cancelable: true }))
  }

  render() {
    return html`
      <div class="label">
        <c2-label title=${this.label}>${this.label}</c2-label>
        ${this.changed ? html`<span class="dot" aria-hidden="true"></span>` : nothing}
        ${
          this.description
            ? html`<span class="info" tabindex="0" role="note">
                <c2-feather-info></c2-feather-info>
                <c2-tooltip placement="left">${this.description}</c2-tooltip>
              </span>`
            : nothing
        }
      </div>
      <div class="control">
        <slot></slot>
        ${
          this.changed
            ? html`<c2-icon-button
                class="revert"
                aria-label="Revert ${this.label} to the authored value"
                tooltip="Revert to authored value"
                @click=${this.handleRevert}
              >
                <c2-feather-rotate-ccw></c2-feather-rotate-ccw>
              </c2-icon-button>`
            : nothing
        }
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-inspector-row': InspectorRow
  }
}
