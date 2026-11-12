import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { computePosition, autoUpdate, autoPlacement, flip, shift, offset, arrow, type Placement } from '@floating-ui/dom'
import styles from './tooltip.scss?inline'

export type { Placement }

let uid = 0

/** The focusable element inside a target's shadow root (a `delegatesFocus` button, an inner input). */
const INNER_CONTROL = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

/** Events fired by {@link Tooltip}, keyed for `addEventListener`. */
export interface TooltipEventMap {
  show: Event
  hide: Event
}

export interface Tooltip {
  addEventListener: TypedAddEventListener<Tooltip, TooltipEventMap>
  removeEventListener: TypedRemoveEventListener<Tooltip, TooltipEventMap>
}

/**
 * Contextual hint shown when its target is hovered or focused. Drop it inside the element it describes (the parent is
 * the target), point it at another element with `for="<id>"`, or use `target-strategy="previousElement"`. The text is
 * the slotted content, or the target's `data-tooltip` attribute when the slot is empty.
 *
 * The tooltip is a `popover="manual"` element: it renders in the top layer, so it is never clipped by scrolling or
 * `overflow: hidden` ancestors and the target is left untouched. floating-ui keeps it beside the target and flips it
 * when there is no room; the side in use is reflected as `current-placement`. It has `role="tooltip"` and describes
 * its target (the focusable control inside a `c2-*` target's shadow root) through `ariaDescribedByElements`, unless its
 * text repeats the target's accessible name. The pointer can move onto the bubble: it stays open while the target or
 * the bubble is hovered or the target has focus, and closes a short grace period (`hide-delay`) after both are left.
 * Escape anywhere on the page and pressing on the target hide it.
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

  // Semantics live on ElementInternals, not host attributes: an attribute the element writes on itself is one the
  // server never rendered, and React reports it as a hydration mismatch. An author-set attribute still wins.
  private readonly internals = this.attachInternals()

  /** Preferred side; flips when there is no room. */
  @property({ reflect: true }) placement: Placement = 'top'

  /**
   * Legacy: comma-separated list of allowed placements (`"top,bottom"`). When set, the best of those is chosen
   * automatically instead of `placement`.
   */
  @property() position: string | undefined = undefined

  /** Delay before showing, in milliseconds. */
  @property({ type: Number }) delay = 300

  /**
   * Grace period before hiding, in milliseconds, once the pointer has left both the target and the bubble (and the
   * target lost focus). It is what lets the pointer cross the gap onto the bubble.
   */
  @property({ type: Number, attribute: 'hide-delay' }) hideDelay = 120

  /** Hides the arrow that points towards the target. */
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
  private positioningStyleObserver: MutationObserver | null = null
  private positioningStyleValues = ''
  private hovered = false
  private bubbleHovered = false
  private focused = false
  /** The element whose description currently includes this tooltip, and its `aria-describedby` before that. */
  private described: HTMLElement | null = null
  private describedBefore: string | null = null
  private ownsId = false

  /** The element the tooltip describes. Assignable. */
  get target(): HTMLElement | null {
    return this._target
  }

  set target(target: HTMLElement | null) {
    if (target === this._target) return
    this.detachTarget()
    this._target = target
    if (target) {
      target.addEventListener('pointerenter', this.handlePointerEnter)
      target.addEventListener('pointerleave', this.handlePointerLeave)
      target.addEventListener('focus', this.handleFocus)
      target.addEventListener('blur', this.handleBlur)
      target.addEventListener('pointerdown', this.handlePress)
      target.addEventListener('keydown', this.handleKeydown)
      this.syncDescription()
      // A custom-element target renders its focusable control later: describe that control once it exists.
      if (target.localName.includes('-')) {
        void customElements
          .whenDefined(target.localName)
          .then(() => (target as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete)
          .then(() => {
            if (this._target === target) this.syncDescription()
          })
      }
    }
    this.syncTargetText()
  }

  /** The element that takes the description: the target, or the focusable control in its open shadow root. */
  private describedControl(target: HTMLElement): HTMLElement {
    return target.shadowRoot?.querySelector<HTMLElement>(INNER_CONTROL) ?? target
  }

  private descriptionText() {
    return normalize(this.textContent) || normalize(this._target?.dataset.tooltip)
  }

  /**
   * Links this tooltip as the description of its target, or unlinks it when its text only repeats the target's
   * accessible name (an icon button named by its tooltip would be read twice). Element references cross shadow
   * boundaries and write no id on the tooltip; browsers without ARIA element reflection get the id path instead.
   */
  private syncDescription() {
    const target = this._target
    const references = 'ariaDescribedByElements' in Element.prototype
    const control = target ? this.describedControl(target) : null
    const name = normalize(control?.getAttribute('aria-label') ?? control?.ariaLabel)
    // An id cannot reach across a shadow boundary, so the id fallback describes the target itself.
    const next = control && !(name && name === this.descriptionText()) ? (references ? control : target) : null
    // The control's own template may rewrite `aria-describedby` (a field turning invalid), which drops the element
    // reference set on top of it: link again rather than assume the earlier link still holds.
    if (next === this.described && (!next || !references || next.ariaDescribedByElements?.includes(this))) return
    this.unlinkDescription()
    if (!next) return
    this.described = next
    this.describedBefore = next.getAttribute('aria-describedby')
    if (references) {
      next.ariaDescribedByElements = [...(next.ariaDescribedByElements ?? []).filter((element) => element !== this), this]
      return
    }
    if (!this.id) {
      this.id = `c2-tooltip-${++uid}`
      this.ownsId = true
    }
    const ids = (this.describedBefore ?? '').split(/\s+/).filter(Boolean)
    // modern-web-ignore: aria-attribute-on-other-element fallback for engines without ariaDescribedByElements
    if (!ids.includes(this.id)) next.setAttribute('aria-describedby', [...ids, this.id].join(' '))
  }

  private unlinkDescription() {
    const element = this.described
    if (!element) return
    const before = this.describedBefore
    this.described = this.describedBefore = null
    if ('ariaDescribedByElements' in Element.prototype) {
      // Setting element references leaves the attribute empty. Anything else means the element's owner wrote it
      // since (and so already dropped this reference): leave its value alone rather than restore a stale one.
      if (element.getAttribute('aria-describedby') === '') {
        const rest = (element.ariaDescribedByElements ?? []).filter((other) => other !== this)
        // Restoring the id list also clears the element references set on top of it.
        // modern-web-ignore: aria-attribute-on-other-element puts back the value it had before the link
        if (before) element.setAttribute('aria-describedby', before)
        else element.ariaDescribedByElements = rest.length ? rest : null
      }
    } else {
      const ids = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== this.id)
      // modern-web-ignore: aria-attribute-on-other-element fallback for engines without ariaDescribedByElements
      if (ids.length) element.setAttribute('aria-describedby', ids.join(' '))
      else element.removeAttribute('aria-describedby')
    }
    if (this.ownsId) {
      // modern-web-ignore: host-attribute-write removes only the id the fallback path generated above
      this.removeAttribute('id')
      this.ownsId = false
    }
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
    this.internals.role = 'tooltip'
    this.addEventListener('pointerenter', this.handleBubbleEnter)
    this.addEventListener('pointerleave', this.handleBubbleLeave)
    this.resolveTarget()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('pointerenter', this.handleBubbleEnter)
    this.removeEventListener('pointerleave', this.handleBubbleLeave)
    this.detachTarget()
    this.clearTimers()
    this.stopPositioning()
    document.removeEventListener('keydown', this.handleKeydown)
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
    target.removeEventListener('pointerenter', this.handlePointerEnter)
    target.removeEventListener('pointerleave', this.handlePointerLeave)
    target.removeEventListener('focus', this.handleFocus)
    target.removeEventListener('blur', this.handleBlur)
    target.removeEventListener('pointerdown', this.handlePress)
    target.removeEventListener('keydown', this.handleKeydown)
    this.unlinkDescription()
    this.hovered = this.focused = this.bubbleHovered = false
    this._target = null
  }

  private handlePointerEnter = () => {
    this.hovered = true
    this.handleEnter()
  }

  private handlePointerLeave = () => {
    this.hovered = false
    this.handleLeave()
  }

  private handleFocus = () => {
    this.focused = true
    this.handleEnter()
  }

  private handleBlur = () => {
    this.focused = false
    this.handleLeave()
  }

  private handleBubbleEnter = () => {
    if (!this.open) return
    this.bubbleHovered = true
    clearTimeout(this.hideTimer)
  }

  private handleBubbleLeave = () => {
    this.bubbleHovered = false
    this.handleLeave()
  }

  /** Pressing on the target dismisses the tooltip at once, like Escape. */
  private handlePress = () => {
    this.clearTimers()
    this.open = false
  }

  private handleEnter = () => {
    clearTimeout(this.hideTimer)
    this.syncDescription()
    if (this.open || this.showTimer) return
    this.showTimer = setTimeout(() => {
      this.showTimer = undefined
      this.open = true
    }, this.delay)
  }

  /** Hides once nothing holds the tooltip open: neither the target nor the bubble is hovered, and the target lost focus. */
  private handleLeave = () => {
    if (this.hovered || this.focused || this.bubbleHovered) return
    clearTimeout(this.showTimer)
    this.showTimer = undefined
    if (!this.open) return
    clearTimeout(this.hideTimer)
    if (this.hideDelay > 0) this.hideTimer = setTimeout(() => (this.open = false), this.hideDelay)
    else this.open = false
  }

  /** Escape dismisses the open tooltip wherever focus is (WCAG 1.4.13): listened on the document while open. */
  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.open) return
    // This Escape is spent closing the tooltip: an enclosing dialog or popover must not close on it too.
    event.preventDefault()
    this.clearTimers()
    this.open = false
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
    const positioningValues = () => {
      const style = getComputedStyle(this)
      return `${style.getPropertyValue('--c2-tooltip--offset')}|${style.getPropertyValue('--c2-tooltip__arrow--size')}`
    }
    this.positioningStyleValues = positioningValues()
    // Floating UI observes layout, but an inspector edit to a positioning variable need not resize either element.
    this.positioningStyleObserver = new MutationObserver(() => {
      const next = positioningValues()
      if (next === this.positioningStyleValues) return
      this.positioningStyleValues = next
      void this.updatePosition(target)
    })
    this.positioningStyleObserver.observe(this, { attributes: true, attributeFilter: ['style', 'class'] })
  }

  private stopPositioning() {
    this.cleanupPosition?.()
    this.cleanupPosition = null
    this.positioningStyleObserver?.disconnect()
    this.positioningStyleObserver = null
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
    // The host is the popover itself, the top-layer box floating-ui places; this runs only while it is shown (never in a
    // server render), and `current-placement` is documented API authors style against.
    // modern-web-ignore: host-style-write the host is the shown top-layer box floating-ui places
    this.style.left = `${x}px`
    // modern-web-ignore: host-style-write the host is the shown top-layer box floating-ui places
    this.style.top = `${y}px`
    // modern-web-ignore: host-attribute-write documented `current-placement` output, written only while shown
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
        document.addEventListener('keydown', this.handleKeydown)
        this.dispatchEvent(new Event('show', { bubbles: true, composed: true }))
      } else if (!this.open && shown) {
        document.removeEventListener('keydown', this.handleKeydown)
        this.bubbleHovered = false
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
