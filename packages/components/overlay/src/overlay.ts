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
 * @cssproperty {pixel} [--c2-overlay--offset-y=8px] - The offset position of content base on trigger component
 * @cssproperty {pixel} [--c2-overlay--offset-x=0px] - The offset position of content base on trigger component
 * @cssproperty {color} [--c2-overlay__backdrop--background=transparent] - The background value of backdrop
 */
@customElement('c2-overlay')
export class Overlay extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: Boolean, reflect: true }) open = false
  @property({ type: String, reflect: true }) placement: Placement = 'bottom-start'
  @property({ type: Boolean, reflect: true, attribute: 'disabled-cross-axis' }) disabledCrossAxis = false
  @property({ type: Boolean, attribute: 'fit-anchor' }) fitTarget = false

  private _anchor: HTMLElement | null | undefined = null

  private cleanupSynPosition: (() => void) | null = null

  @state()
  private overlayStyle: StyleInfo = {}

  get anchor(): HTMLElement | null {
    if (!this._anchor) {
      this._anchor = this.findAnchorElement()
    }

    return this._anchor
  }

  constructor() {
    super()
    if (!isServer) {
      this.addEventListener('beforetoggle', this.handleBeforeToggle)
      this.addEventListener('toggle', this.handleToggle)
    }
  }

  handleBeforeToggle(event: Event) {
    if (!this.anchor) {
      event.preventDefault()
      return
    }
    this.syncPosition()
  }

  private updatePosition = async () => {
    this.style.minWidth = `${this.anchor!.offsetWidth}px`
    const position = await computePosition(this.anchor!, this, {
      placement: this.placement,
      middleware: [
        flip({
          crossAxis: !this.disabledCrossAxis,
        }),
      ],
    })
    const style: StyleInfo = {
      top: `${position.y}px`,
      left: `${position.x}px`,
      'min-width': `${this.anchor!.offsetWidth}px`,
    }
    if (this.fitTarget) {
      style.width = `${this.anchor!.offsetWidth}px`
    }

    this.placement = position.placement
    await this.updateComplete
    this.overlayStyle = style
  }

  private syncPosition() {
    if (this.cleanupSynPosition) {
      this.cleanupSynPosition()
    }

    this.cleanupSynPosition = autoUpdate(this.anchor!, this, this.updatePosition)
  }

  private handleToggle(event: Event) {
    this.open = (event as ToggleEvent).newState == 'open'
  }

  private findAnchorElement(): HTMLElement | null {
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
