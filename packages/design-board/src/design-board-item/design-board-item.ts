import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './design-board.scss?inline'
/**
 * DesignBoard component
 *
 * @slot
 * @csspart
 */
@customElement('c2-design-board-item')
export class DesignBoardItem extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Number, attribute: true }) x: number = 0
  @property({ type: Number, attribute: true }) columnEnd: number = 0
  @property({ type: Number, attribute: true }) columnStart: number = 0
  @property({ type: Number, attribute: true }) rowStart: number = 0
  @property({ type: Number, attribute: true }) rowEnd: number = 0

  // private layoutProperties = ['columnStart', 'columnEnd', 'rowStart', 'rowEnd']

  override connectedCallback(): void {
    super.connectedCallback()
    this.updateLayout()
  }

  override render() {
    return html` <div class="c2-design-board-item"><slot></slot></div> `
  }

  private updateLayout() {
    this.style.gridColumnStart = `${this.columnStart}`
    this.style.gridColumnEnd = `${this.columnEnd}`
    this.style.gridRowStart = `${this.rowStart}`
    this.style.gridRowEnd = `${this.rowEnd}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-design-board-item': DesignBoardItem
  }
}
