import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, eventOptions } from 'lit/decorators.js'
import styles from './design-board.scss?inline'
import { DesignBoardItem } from './design-board-item/design-board-item'

export interface Viewport {
  width: number
  height: number
}

/**
 *
 * DesignBoard component is used to manage layout of design-board-item.
 *
 * The main goal of this component is to layout components by coordinations and can be zoom-in/out
 *
 * So, the scenario could be:
 * - Give a list of components
 * - Put into design board
 * - Design board auto layout these components
 * - User can move this components
 * - user can zoom-in/zoom-out
 * - Use can use undo/redo
 *
 * The purpose of DesignBoard is help user to configure components easier.
 *
 * So. Design board save state of layot on its own internal state,
 * this maybe not fiable because the sync between children and layout
 *
 */
@customElement('c2-design-board')
export class DesignBoard extends LitElement {
  static override styles = unsafeCSS(styles)

  private registeredItems: DesignBoardItem[] = []
  override render() {
    return html`
      <div class="c2-design-board" @pointerdown=${this.handlePointerDown}>
        <div class="main" @item-register=${this.handlerItemRegister} @item-unregister=${this.handlerItemUnRegister}>
          <!-- slot contains <design-board-item/> components-->
          <slot></slot>
        </div>
      </div>
    `
  }

  @eventOptions({ passive: true })
  private handlePointerDown() {
    // 1. Get item (target)
    // 2. Start handling Mouse Event on Document
  }

  private handlerItemRegister(event: Event) {
    this.registeredItems.push(event.target as DesignBoardItem)
  }

  private handlerItemUnRegister(event: Event) {
    this.registeredItems.splice(this.registeredItems.indexOf(event.target as DesignBoardItem), 1)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-design-board': DesignBoard
  }
}
