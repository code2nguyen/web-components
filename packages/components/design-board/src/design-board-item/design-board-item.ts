import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './design-board-item.scss?inline'
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
  @property({ type: Number, attribute: 'column-end' }) columnEnd: number = 0
  @property({ type: Number, attribute: 'column-start' }) columnStart: number = 0
  @property({ type: Number, attribute: 'row-start' }) rowStart: number = 0
  @property({ type: Number, attribute: 'row-end' }) rowEnd: number = 0

  // private layoutProperties = ['columnStart', 'columnEnd', 'rowStart', 'rowEnd']

  override connectedCallback(): void {
    super.connectedCallback()
    this.updateLayout()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('columnStart') || changed.has('columnEnd') || changed.has('rowStart') || changed.has('rowEnd')) this.updateLayout()
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
