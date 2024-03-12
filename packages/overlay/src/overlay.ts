import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
import { isServer } from 'lit-html/is-server.js'
import { customElement, property, state } from 'lit/decorators.js'
import { computePosition, autoUpdate, flip, type Placement } from '@floating-ui/dom'

import styles from './overlay.scss?inline'
import { type StyleInfo } from 'lit/directives/style-map.js'
/**
 * @tag c2-overlay
 *
 * @slot default - Content of the overlay
 *
 * @cssproperty {pixel} - [--c2-overlay--offset=8px] - The offset position of content base on trigger component
 * @cssproperty {background} - [--c2-overlay__backdrop--background=transparent] - The background value of backdrop
 */
@customElement('c2-overlay')
export class Overlay extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Boolean, reflect: true }) open = false
  @property({ type: String, reflect: true }) placement: Placement = 'bottom-start'
  @property({ type: Boolean, attribute: 'fit-target' }) fitTarget = false

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
    this.style.minWidth = `${this.target!.offsetWidth}px`
    const position = await computePosition(this.target!, this, {
      placement: this.placement,
      middleware: [
        flip({
          crossAxis: false,
        }),
      ],
    })
    const style: StyleInfo = {
      top: `${position.y}px`,
      left: `${position.x}px`,
      'min-width': `${this.target!.offsetWidth}px`,
    }
    if (this.fitTarget) {
      style.width = `${this.target!.offsetWidth}px`
    }

    this.placement = position.placement
    await this.updateComplete
    this.overlayStyle = style
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
    if (_changedProperties.has('open') && !isServer) {
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
