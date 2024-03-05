import { LitElement, html, unsafeCSS, isServer, type PropertyValueMap } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { computePosition, autoUpdate, flip, offset } from '@floating-ui/dom'

import styles from './overlay.scss?inline'
import { type StyleInfo } from 'lit/directives/style-map.js'
/**
 * @tag c2-overlay
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-overlay')
export class Overlay extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Boolean, reflect: true }) open = false

  @property() positioning: 'absolute' | 'fixed' = 'absolute'

  @property({ type: Number }) offset = 8

  private _target: HTMLElement | null | undefined = null

  private cleanupSynPosition: (() => void) | null = null

  @state()
  private overlayStyle: StyleInfo = {}

  get target(): HTMLElement | null {
    if (!this._target) {
      this._target = this.findTargetElement()
    }

    return this._target
  }

  constructor() {
    super()
    if (!isServer) {
      this.addEventListener('beforetoggle', this.handleBeforeToggle)
      this.addEventListener('toggle', this.handleToggle)
    }
  }

  handleBeforeToggle(event: Event) {
    if (!this.target) {
      event.preventDefault()
      return
    }
    this.syncPosition()
  }

  private updatePosition = async () => {
    const position = await computePosition(this.target!, this, {
      placement: 'bottom-start',
      middleware: [offset(this.offset), flip()],
    })
    console.log(position)
    this.overlayStyle = {
      top: `${position.y}px`,
      left: `${position.x}px`,
    }
  }

  private syncPosition() {
    if (this.cleanupSynPosition) {
      this.cleanupSynPosition()
    }

    this.cleanupSynPosition = autoUpdate(this.target!, this, this.updatePosition)
  }

  private handleToggle(event: Event) {
    this.open = (event as ToggleEvent).newState == 'open'
  }

  private findTargetElement() {
    let parent = this.parentElement
    let found: HTMLElement | null = null
    while (parent && !found) {
      found = parent.querySelector(`[popovertarget = "${this.id}"]`)
      parent = parent.parentElement
    }
    return found
  }

  protected override willUpdate(_changedProperties: PropertyValueMap<this>): void {
    if (_changedProperties.has('open')) {
      if (this.open) {
        this.showPopover()
      } else {
        this.hidePopover()
      }
    }
  }
  override render() {
    this.setAttribute(
      'style',
      Object.keys(this.overlayStyle).reduce((result, styleName) => {
        result += `${styleName}: ${this.overlayStyle[styleName]};`
        return result
      }, ''),
    )
    return html`<slot></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-overlay': Overlay
  }
}
