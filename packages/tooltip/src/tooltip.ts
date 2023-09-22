import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, property, queryAssignedElements } from 'lit/decorators.js'
import styles from './tooltip.scss?inline'
import { computePosition, shift, offset, arrow, autoPlacement, type Placement } from '@floating-ui/dom'

// Inspirated on https://lit.dev/tutorials/tooltip/#10

// Events to turn on/off the tooltip
const enterEvents = ['pointerenter', 'focus']
const leaveEvents = ['pointerleave', 'blur', 'keydown', 'click']

/**
 * Tooltip component
 *
 * @slot
 * @csspart
 */
@customElement('c2-tooltip')
export class Tooltip extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: String }) position: String = 'top,bottom'
  @property({ type: Number }) offset = 10
  @property({ type: Number }) delay = 300
  @property({ type: Boolean, attribute: 'hide-arrow' }) hideArrow = false
  @property({ type: String, attribute: 'target-strategy' }) targetStrategy = 'parent'

  @property({ reflect: true, type: Boolean }) showing = false
  @queryAssignedElements({ slot: 'arrow', flatten: true }) arrowElements!: Array<HTMLElement>

  private _target: HTMLElement | null = null
  private delayTimeout: NodeJS.Timeout | null = null

  get target() {
    return this._target
  }

  set target(target: HTMLElement | null) {
    this.removeListenner()
    this.clearTimeout()
    if (target) {
      enterEvents.forEach((eventName) => target.addEventListener(eventName, this.show))
      leaveEvents.forEach((eventName) => target.addEventListener(eventName, this.hide))
    }
    this._target = target
  }

  get arrowEl(): HTMLElement | null {
    if (this.hideArrow) return null
    const arrowElements = this.arrowElements
    return arrowElements.length > 0 ? arrowElements[0] : null
  }

  constructor() {
    super()
    this.addEventListener('transitionend', this.finishHide)
  }

  public override connectedCallback(): void {
    super.connectedCallback()
    if (this.targetStrategy == 'previousElement') {
      this.target ??= this.previousElementSibling as HTMLElement
    } else {
      this.target ??= this.parentElement
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeListenner()
    this.clearTimeout()
  }

  private show = () => {
    if (this.delayTimeout) {
      return
    }
    this.delayTimeout = setTimeout(() => {
      const arrowEl = this.arrowEl
      const middleware = [offset(this.offset), shift(), autoPlacement({ allowedPlacements: this.position.split(',') as Placement[] })]
      if (arrowEl) {
        middleware.push(
          arrow({
            element: arrowEl,
          })
        )
      }

      this.style.cssText = ''

      computePosition(this.target!, this, {
        strategy: 'absolute',
        middleware: middleware,
      }).then(({ x, y, middlewareData, placement }) => {
        this.style.left = x != null ? `${x}px` : ''
        this.style.top = y != null ? `${y}px` : ''

        if (arrowEl && middlewareData.arrow) {
          const { x, y } = middlewareData.arrow
          console.log(middlewareData.arrow)
          const arrowHeight = arrowEl.offsetHeight ?? arrowEl.clientHeight
          const side = placement.split('-')[0]
          const staticSide = {
            top: 'bottom',
            right: 'left',
            bottom: 'top',
            left: 'right',
          }[side] as string

          const rotateSide = {
            top: '0deg',
            right: '90deg',
            bottom: '180deg',
            left: '-90deg',
          }[side] as string

          const arrowLen = {
            top: `${-arrowHeight}px`,
            right: `${Math.ceil(-arrowHeight * 1.5)}px`,
            bottom: `${-arrowHeight}px`,
            left: `${Math.ceil(-arrowHeight * 1.5)}px`,
          }[side] as string

          Object.assign(arrowEl.style, {
            left: x != null ? `${x}px` : '',
            top: y != null ? `${y}px` : '',
            right: '',
            bottom: '',
            [staticSide]: `${arrowLen}`,
            transform: `rotate(${rotateSide})`,
          })
        }
      })
      this.showing = true
      this.delayTimeout = null
    }, this.delay)
  }

  private hide = () => {
    this.clearTimeout();
    this.showing = false
  }

  private finishHide = () => {
    if (!this.showing) {
      this.style.display = 'none'
    }
  }

  private removeListenner() {
    if (this.target) {
      enterEvents.forEach((eventName) => this.target!.removeEventListener(eventName, this.show))
      leaveEvents.forEach((eventName) => this.target!.removeEventListener(eventName, this.hide))
    }
  }

  private clearTimeout() {
    if (this.delayTimeout) {
      clearTimeout(this.delayTimeout)
      this.delayTimeout = null;
    }
  }

  override render() {
    let defaultTooltipText = ''
    if (this.target) {
      defaultTooltipText = this.target.dataset.tooltip ?? ''
    }
    return html` <div class="c2-tooltip">
      <slot>${defaultTooltipText}</slot>
      ${this.hideArrow
        ? nothing
        : html`
            <slot name="arrow">
              <svg width="10" height="5" class="arrow" viewBox="0 0 10 5" fill="currentColor" stroke-width="1">
                <path d="M5.70711 4.29289C5.31658 4.68342 4.68342 4.68342 4.29289 4.29289L0 0H10L5.70711 4.29289Z" />
              </svg>
            </slot>
          `}
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tooltip': Tooltip
  }
}
