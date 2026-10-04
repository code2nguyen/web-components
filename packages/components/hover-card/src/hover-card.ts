import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { isServer } from 'lit-html/is-server.js'
import { query } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { computePosition, autoUpdate, flip, shift, offset, type Placement } from '@floating-ui/dom'
import styles from './hover-card.scss?inline'

export type { Placement }

/** Events fired by {@link HoverCard}, keyed for `addEventListener`. */
export interface HoverCardEventMap {
  show: Event
  hide: Event
}

export interface HoverCard {
  addEventListener: TypedAddEventListener<HoverCard, HoverCardEventMap>
  removeEventListener: TypedRemoveEventListener<HoverCard, HoverCardEventMap>
}

/**
 * Preview card shown when a sighted user hovers or focuses a trigger: a profile behind a mention, the summary behind a
 * link. The trigger goes in the `trigger` slot and the card content in the default slot.
 *
 * Unlike `c2-tooltip`, the card is interactive: the pointer can travel from the trigger into the card and it stays
 * open, and it can hold links and buttons, which follow the trigger in the tab order. It opens after `open-delay`
 * milliseconds and closes `close-delay` milliseconds after the pointer has left both the trigger and the card, when
 * focus leaves them, or at once on Escape. Touch input does not open it, since a tap is meant for the trigger itself.
 *
 * The card is a `popover="manual"` element in the top layer, so it is never clipped by scrolling or `overflow: hidden`
 * ancestors. floating-ui keeps it beside the trigger and flips `placement` when there is no room. The content is
 * supplementary: do not put anything there that is not also reachable another way.
 *
 * @tag c2-hover-card
 *
 * @slot trigger - The element that opens the card, typically a link or a mention.
 * @slot - Card content.
 *
 * @event {Event} show - Fired when the card opens.
 * @event {Event} hide - Fired when the card closes.
 *
 * @cssproperty {background-color} [--c2-hover-card--background-color=#ffffff]
 * @cssproperty {color} [--c2-hover-card--color=#18181b]
 * @cssproperty {border} [--c2-hover-card--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-hover-card--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-hover-card--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {font-size} [--c2-hover-card--font-size=14px]
 * @cssproperty {font-family} --c2-hover-card--font-family
 * @cssproperty {line-height} [--c2-hover-card--line-height=1.5]
 *
 * @cssproperty {padding} [--c2-hover-card--padding-top=16px]
 * @cssproperty {padding} [--c2-hover-card--padding-right=16px]
 * @cssproperty {padding} [--c2-hover-card--padding-bottom=16px]
 * @cssproperty {padding} [--c2-hover-card--padding-left=16px]
 *
 * @cssproperty {pixel} [--c2-hover-card--width=320px]
 * @cssproperty {pixel} [--c2-hover-card--offset=8px] - Distance between the trigger and the card.
 * @cssproperty {time} [--c2-hover-card--transition-duration=150ms]
 * @cssproperty {transform} [--c2-hover-card--enter-transform=scale(0.96)] - Start of the enter animation.
 */
@customElement('c2-hover-card')
export class HoverCard extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Preferred side of the trigger; flips when there is no room. */
  @property({ reflect: true }) placement: Placement = 'bottom'

  /** Delay before opening, in milliseconds. */
  @property({ type: Number, attribute: 'open-delay' }) openDelay = 700

  /** Delay before closing once the pointer or focus has left, in milliseconds. */
  @property({ type: Number, attribute: 'close-delay' }) closeDelay = 300

  /** Keeps the card from opening on hover or focus; `open` still works. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Visible state. Set it to open or close the card programmatically. */
  @property({ type: Boolean, reflect: true }) open = false

  @query('.c2-hover-card') private panel?: HTMLElement

  private openTimer: ReturnType<typeof setTimeout> | undefined
  private closeTimer: ReturnType<typeof setTimeout> | undefined
  private cleanupPosition: (() => void) | null = null
  private offsetObserver: MutationObserver | null = null
  private offsetValue = ''
  private returningFocus = false

  override connectedCallback() {
    super.connectedCallback()
    if (isServer) return
    // The card is rendered inside the host, so the pointer moving from the trigger into it never leaves the host.
    this.addEventListener('pointerenter', this.handlePointerEnter)
    this.addEventListener('pointerleave', this.handlePointerLeave)
    this.addEventListener('focusin', this.handleFocusIn)
    this.addEventListener('focusout', this.handleFocusOut)
    this.addEventListener('keydown', this.handleKeydown)
    if (this.open && this.hasUpdated) this.show()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('pointerenter', this.handlePointerEnter)
    this.removeEventListener('pointerleave', this.handlePointerLeave)
    this.removeEventListener('focusin', this.handleFocusIn)
    this.removeEventListener('focusout', this.handleFocusOut)
    this.removeEventListener('keydown', this.handleKeydown)
    this.clearTimers()
    this.stopPositioning()
  }

  private handlePointerEnter = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    this.scheduleOpen()
  }

  private handlePointerLeave = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    // Keep the card while focus is inside it: a keyboard user reading it should not lose it to a stray mouse move.
    if (this.matches(':focus-within')) return
    this.scheduleClose()
  }

  private handleFocusIn = () => {
    if (this.returningFocus) return
    this.scheduleOpen()
  }

  private handleFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null
    if (next && (next === this || this.contains(next))) return
    if (this.matches(':hover')) return
    this.scheduleClose()
  }

  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.open) return
    event.stopPropagation()
    const focusInCard = [...this.children].some((child) => child.slot !== 'trigger' && child.contains(document.activeElement))
    this.clearTimers()
    this.open = false
    if (focusInCard) this.focusTrigger()
  }

  private focusTrigger() {
    const trigger = this.querySelector<HTMLElement>(':scope > [slot="trigger"]')
    // Focus coming back from Escape must not reopen the card the user just dismissed.
    this.returningFocus = true
    trigger?.focus()
    this.returningFocus = false
  }

  private scheduleOpen() {
    clearTimeout(this.closeTimer)
    this.closeTimer = undefined
    if (this.disabled || this.open || this.openTimer) return
    this.openTimer = setTimeout(() => {
      this.openTimer = undefined
      this.open = true
    }, this.openDelay)
  }

  private scheduleClose() {
    clearTimeout(this.openTimer)
    this.openTimer = undefined
    if (!this.open || this.closeTimer) return
    this.closeTimer = setTimeout(() => {
      this.closeTimer = undefined
      this.open = false
    }, this.closeDelay)
  }

  private clearTimers() {
    clearTimeout(this.openTimer)
    clearTimeout(this.closeTimer)
    this.openTimer = this.closeTimer = undefined
  }

  private readPixels(name: string, fallback: number) {
    const value = Number.parseFloat(getComputedStyle(this).getPropertyValue(name))
    return Number.isNaN(value) ? fallback : value
  }

  private startPositioning(panel: HTMLElement) {
    this.stopPositioning()
    this.cleanupPosition = autoUpdate(this, panel, () => void this.updatePosition(panel))
    // Floating UI observes layout, but an edit to the offset (an inline style, a class) need not resize either element.
    const offsetValue = () => getComputedStyle(this).getPropertyValue('--c2-hover-card--offset')
    this.offsetValue = offsetValue()
    this.offsetObserver = new MutationObserver(() => {
      const next = offsetValue()
      if (next === this.offsetValue) return
      this.offsetValue = next
      void this.updatePosition(panel)
    })
    this.offsetObserver.observe(this, { attributes: true, attributeFilter: ['style', 'class'] })
  }

  private stopPositioning() {
    this.cleanupPosition?.()
    this.cleanupPosition = null
    this.offsetObserver?.disconnect()
    this.offsetObserver = null
  }

  private async updatePosition(panel: HTMLElement) {
    const { x, y, placement } = await computePosition(this, panel, {
      placement: this.placement,
      strategy: 'fixed',
      middleware: [offset(this.readPixels('--c2-hover-card--offset', 8)), flip({ padding: 8 }), shift({ padding: 8 })],
    })
    panel.style.left = `${x}px`
    panel.style.top = `${y}px`
    panel.dataset.placement = placement
  }

  private show() {
    const panel = this.panel
    if (!panel || panel.matches(':popover-open')) return
    try {
      panel.showPopover()
    } catch {
      return /* not connected yet */
    }
    this.startPositioning(panel)
    this.dispatchEvent(new Event('show'))
  }

  private hide() {
    const panel = this.panel
    this.stopPositioning()
    if (!panel?.matches(':popover-open')) return
    try {
      panel.hidePopover()
    } catch {
      /* already hidden */
    }
    this.dispatchEvent(new Event('hide'))
  }

  override updated(changed: PropertyValues<this>) {
    if (isServer) return
    if (changed.has('open')) {
      if (this.open) this.show()
      else this.hide()
    }
    if (changed.has('placement') && this.open && this.panel) void this.updatePosition(this.panel)
    if (changed.has('disabled') && this.disabled) {
      clearTimeout(this.openTimer)
      this.openTimer = undefined
    }
  }

  override render() {
    return html`
      <slot name="trigger"></slot>
      <div class="c2-hover-card" popover="manual">
        <slot></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-hover-card': HoverCard
  }
}
