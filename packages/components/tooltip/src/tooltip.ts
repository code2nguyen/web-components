import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { isServer } from 'lit-html/is-server.js'
import { customElement, property, query, state } from 'lit/decorators.js'
import { computePosition, autoUpdate, autoPlacement, flip, shift, offset, arrow, type Placement } from '@floating-ui/dom'
import styles from './tooltip.scss?inline'

export type { Placement }

const ENTER_EVENTS = ['pointerenter', 'focus'] as const
const LEAVE_EVENTS = ['pointerleave', 'blur', 'pointerdown'] as const

let uid = 0

/**
 * Contextual hint shown when its target is hovered or focused. Drop it inside the element it describes (the parent is
 * the target), point it at another element with `for="<id>"`, or use `target-strategy="previousElement"`. The text is
 * the slotted content, or the target's `data-tooltip` attribute when the slot is empty.
 *
 * The tooltip is a `popover="manual"` element: it renders in the top layer, so it is never clipped by scrolling or
 * `overflow: hidden` ancestors and the target is left untouched. floating-ui keeps it beside the target and flips it
 * when there is no room; the side in use is reflected as `current-placement`. It has `role="tooltip"` and the target
 * gets `aria-describedby`, so assistive technology reads it. Escape, pressing on the target, blur and leaving hide it.
 *
 * @tag c2-tooltip
 *
 * @slot - Tooltip content. Falls back to the target's `data-tooltip`.
 *
 * @event {Event} show - Fired when the tooltip becomes visible.
 * @event {Event} hide - Fired when it starts hiding.
 *
 * @cssproperty {background-color} [--c2-tooltip--background-color=#18181b]
 * @cssproperty {color} [--c2-tooltip--color=#fafafa]
 * @cssproperty {border-radius} [--c2-tooltip--border-radius=6px]
 * @cssproperty {box-shadow} [--c2-tooltip--box-shadow=0 4px 12px rgba(0, 0, 0, 0.15)]
 * @cssproperty {border} --c2-tooltip--border
 * @cssproperty {font-size} [--c2-tooltip--font-size=12px]
 * @cssproperty {font-weight} [--c2-tooltip--font-weight=500]
 * @cssproperty {font-style} --c2-tooltip--font-style
 * @cssproperty {font-family} --c2-tooltip--font-family
 * @cssproperty {line-height} [--c2-tooltip--line-height=1.4]
 *
 * @cssproperty {padding} [--c2-tooltip--padding-top=5px]
 * @cssproperty {padding} [--c2-tooltip--padding-right=8px]
 * @cssproperty {padding} [--c2-tooltip--padding-bottom=5px]
 * @cssproperty {padding} [--c2-tooltip--padding-left=8px]
 *
 * @cssproperty {pixel} [--c2-tooltip--max-width=240px]
 * @cssproperty {pixel} [--c2-tooltip--offset=8px] - Distance between the target and the tooltip (arrow included).
 * @cssproperty {pixel} [--c2-tooltip__arrow--size=8px] - Side of the arrow square; `0px` hides it like `hide-arrow`.
 * @cssproperty {time} [--c2-tooltip--transition-duration=120ms]
 * @cssproperty {transform} [--c2-tooltip--enter-transform=scale(0.92)] - Start of the enter animation.
 */
@customElement('c2-tooltip')
export class Tooltip extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Preferred side; flips when there is no room. */
  @property({ reflect: true }) placement: Placement = 'top'

  /**
   * Legacy: comma-separated list of allowed placements (`"top,bottom"`). When set, the best of those is chosen
   * automatically instead of `placement`.
   */
  @property() position: string | undefined = undefined

  /** Delay before showing, in milliseconds. */
  @property({ type: Number }) delay = 300

  /** Delay before hiding, in milliseconds. */
  @property({ type: Number, attribute: 'hide-delay' }) hideDelay = 0

  @property({ type: Boolean, reflect: true, attribute: 'hide-arrow' }) hideArrow = false

  /** `parent` (default) or `previousElement`; ignored when `for` is set. */
  @property({ attribute: 'target-strategy' }) targetStrategy: 'parent' | 'previousElement' = 'parent'

  /** Id of the target element (same document or shadow root). */
  @property() for: string | undefined = undefined

  /** Visible state. Set it to show or hide the tooltip programmatically. */
  @property({ type: Boolean, reflect: true }) open = false

  /** @deprecated Use `open`. */
  get showing() {
    return this.open
  }

  @state() private targetText = ''

  @query('.c2-tooltip__arrow') private arrowElement?: HTMLElement

  private _target: HTMLElement | null = null
  private showTimer: ReturnType<typeof setTimeout> | undefined
  private hideTimer: ReturnType<typeof setTimeout> | undefined
  private cleanupPosition: (() => void) | null = null

  /** The element the tooltip describes. Assignable. */
  get target(): HTMLElement | null {
    return this._target
  }

  set target(target: HTMLElement | null) {
    if (target === this._target) return
    this.detachTarget()
    this._target = target
    if (target) {
      for (const name of ENTER_EVENTS) target.addEventListener(name, this.handleEnter)
      for (const name of LEAVE_EVENTS) target.addEventListener(name, this.handleLeave)
      target.addEventListener('keydown', this.handleTargetKeydown)
      if (!this.id) this.id = `c2-tooltip-${++uid}`
      const described = (target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
      if (!described.includes(this.id)) target.setAttribute('aria-describedby', [...described, this.id].join(' '))
    }
    this.syncTargetText()
  }

  /**
   * `targetText` is only the slot's fallback content, and the target is resolved from the live DOM, so it is
   * necessarily unknown when the element is server-rendered. Assigning it before the first update would be lost:
   * hydration adopts the server-rendered markup as-is and records the new value as already committed, so the
   * bubble would stay empty forever. Wait for that first update before touching it.
   */
  private syncTargetText() {
    const text = this._target?.dataset.tooltip ?? ''
    if (text === this.targetText) return
    if (this.hasUpdated) this.targetText = text
    else void this.updateComplete.then(() => (this.targetText = text))
  }

  override connectedCallback() {
    super.connectedCallback()
    if (isServer) return
    if (!this.hasAttribute('popover')) this.setAttribute('popover', 'manual')
    this.setAttribute('role', 'tooltip')
    this.resolveTarget()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.detachTarget()
    this.clearTimers()
    this.stopPositioning()
  }

  private resolveTarget() {
    if (this.for) {
      const root = this.getRootNode() as Document | ShadowRoot
      this.target = (root.querySelector?.(`#${CSS.escape(this.for)}`) as HTMLElement | null) ?? null
      return
    }
    if (this._target) return
    if (this.targetStrategy === 'previousElement') {
      this.target = this.previousElementSibling as HTMLElement | null
    } else {
      // Inside an Astro island the wrapper is not the target, the island's parent is.
      const parent = this.parentElement
      this.target = parent?.tagName === 'ASTRO-ISLAND' ? parent.parentElement : parent
    }
  }

  private detachTarget() {
    const target = this._target
    if (!target) return
    for (const name of ENTER_EVENTS) target.removeEventListener(name, this.handleEnter)
    for (const name of LEAVE_EVENTS) target.removeEventListener(name, this.handleLeave)
    target.removeEventListener('keydown', this.handleTargetKeydown)
    const described = (target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== this.id)
    if (described.length) target.setAttribute('aria-describedby', described.join(' '))
    else target.removeAttribute('aria-describedby')
    this._target = null
  }

  private handleEnter = () => {
    clearTimeout(this.hideTimer)
    if (this.open || this.showTimer) return
    this.showTimer = setTimeout(() => {
      this.showTimer = undefined
      this.open = true
    }, this.delay)
  }

  private handleLeave = () => {
    clearTimeout(this.showTimer)
    this.showTimer = undefined
    if (!this.open) return
    if (this.hideDelay > 0) {
      clearTimeout(this.hideTimer)
      this.hideTimer = setTimeout(() => (this.open = false), this.hideDelay)
    } else {
      this.open = false
    }
  }

  private handleTargetKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.open) this.open = false
  }

  private clearTimers() {
    clearTimeout(this.showTimer)
    clearTimeout(this.hideTimer)
    this.showTimer = this.hideTimer = undefined
  }

  private readPixels(name: string, fallback: number) {
    const value = Number.parseFloat(getComputedStyle(this).getPropertyValue(name))
    return Number.isNaN(value) ? fallback : value
  }

  private startPositioning() {
    this.stopPositioning()
    const target = this._target
    if (!target) return
    this.cleanupPosition = autoUpdate(target, this, () => this.updatePosition(target))
  }

  private stopPositioning() {
    this.cleanupPosition?.()
    this.cleanupPosition = null
  }

  private async updatePosition(target: HTMLElement) {
    const arrowEl = this.hideArrow ? undefined : this.arrowElement
    const arrowSize = arrowEl ? this.readPixels('--c2-tooltip__arrow--size', 8) : 0
    const gap = this.readPixels('--c2-tooltip--offset', 8)
    const allowed = this.position
      ?.split(',')
      .map((p) => p.trim())
      .filter(Boolean) as Placement[] | undefined

    const middleware = [
      offset(gap + arrowSize / 2),
      allowed?.length ? autoPlacement({ allowedPlacements: allowed }) : flip({ padding: 8 }),
      shift({ padding: 8 }),
    ]
    if (arrowEl) middleware.push(arrow({ element: arrowEl, padding: 6 }))

    const { x, y, placement, middlewareData } = await computePosition(target, this, {
      placement: allowed?.length ? undefined : this.placement,
      strategy: 'fixed',
      middleware,
    })
    this.style.left = `${x}px`
    this.style.top = `${y}px`
    this.setAttribute('current-placement', placement)

    if (arrowEl && middlewareData.arrow) {
      const side = placement.split('-')[0] as 'top' | 'right' | 'bottom' | 'left'
      const staticSide = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }[side]
      const { x: ax, y: ay } = middlewareData.arrow
      Object.assign(arrowEl.style, {
        left: ax != null ? `${ax}px` : '',
        top: ay != null ? `${ay}px` : '',
        right: '',
        bottom: '',
        [staticSide]: `${-arrowSize / 2}px`,
      })
    }
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('for') || changed.has('targetStrategy')) this.resolveTarget()
    if (changed.has('open') && !isServer) {
      const shown = this.matches(':popover-open')
      if (this.open && !shown) {
        if (this._target?.dataset.tooltip) this.targetText = this._target.dataset.tooltip
        try {
          this.showPopover()
        } catch {
          /* not connected yet */
        }
        this.startPositioning()
        this.dispatchEvent(new Event('show', { bubbles: true, composed: true }))
      } else if (!this.open && shown) {
        this.stopPositioning()
        try {
          this.hidePopover()
        } catch {
          /* already hidden */
        }
        this.dispatchEvent(new Event('hide', { bubbles: true, composed: true }))
      }
    }
  }

  override render() {
    return html`
      <div class="c2-tooltip">
        <slot>${this.targetText}</slot>
        ${this.hideArrow ? nothing : html`<span class="c2-tooltip__arrow"></span>`}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tooltip': Tooltip
  }
}
