import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './icon-button.scss?inline'

import '@c2n/tooltip'

/**
 * @tag c2-icon-button
 *
 * @csspart
 */
@customElement('c2-icon-button')
export class IconButton extends LitElement {
  static override styles = unsafeCSS(styles)

  @property() tooltip: string | undefined = undefined

  override render() {
    return html`
      <div class="c2-icon-button" data-tooltip=${ifDefined(this.tooltip)}>
        <slot></slot>
        ${this.tooltip ? html`<c2-tooltip delay="800"></c2-tooltip>` : nothing}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-icon-button': IconButton
  }
}
