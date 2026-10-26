import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { computePosition, autoUpdate, flip, shift, offset, arrow, type Placement } from '@floating-ui/dom'
import { toggletipMessages } from './messages'
import styles from './toggletip.scss?inline'

export type { Placement }

/** Events fired by {@link Toggletip}, keyed for `addEventListener`. */
export interface ToggletipEventMap {
  show: Event
  hide: Event
}

export interface Toggletip {
  addEventListener: TypedAddEventListener<Toggletip, ToggletipEventMap>
  removeEventListener: TypedRemoveEventListener<Toggletip, ToggletipEventMap>
}

/**
 * A small ⓘ button that opens a help bubble on click or tap: the explanation behind a field label, a setting or a
 * column header. Unlike `c2-tooltip` the bubble can hold links and buttons, and unlike `c2-hover-card` it opens on a
 * press, so it works on touch and is meant for everyone, not as a preview for pointer users.
 *
 * The bubble's content is a live region that is filled when the bubble opens, so a screen reader announces it
 * without moving focus; Tab from the button continues into any link inside. Pressing the button again, Escape (which
 * returns focus to the button), a press outside and focus moving elsewhere close it. The button carries
 * `aria-expanded`, and its name is the `label` attribute or the translatable "More information".
 *
 * The bubble is a `popover="manual"` element in the top layer, placed beside the button by floating-ui and flipped
 * when there is no room, so a scrolling or `overflow: hidden` ancestor never clips it. It has a light surface by
 * default, so links in it keep the page's own colours.
 *
 * @tag c2-toggletip
 *
 * @slot - The help content: text, links, a short list.
 * @slot icon - Replaces the ⓘ inside the button: another icon, or a few words such as "What's this?".
 *
 * @event {Event} show - The bubble opened.
 * @event {Event} hide - The bubble closed.
 *
 * @csspart button - The button that opens and closes the bubble.
 * @csspart icon - The region wrapping the `icon` slot inside the button: the ⓘ by default.
 * @csspart panel - The bubble.
 * @csspart arrow - The arrow pointing at the button.
 * @csspart content - The live region wrapping the default slot inside the bubble.
 *
 * @cssproperty {pixel} [--c2-toggletip__button--size=24px] - Width and height of the button.
 * @cssproperty {border-radius} [--c2-toggletip__button--border-radius=999px]
 * @cssproperty {color} [--c2-toggletip__button--color=#71717a] - Colour of the ⓘ (or of slotted text).
 * @cssproperty {color} [--c2-toggletip__button--background-color=transparent]
 * @cssproperty {color} [--c2-toggletip__button__hover--color=#18181b]
 * @cssproperty {color} [--c2-toggletip__button__hover--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-toggletip__button__expanded--color=#0265dc] - Colour while the bubble is open.
 * @cssproperty {outline} [--c2-toggletip__button__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-toggletip__button__focus--outline-offset=2px]
 * @cssproperty {pixel} [--c2-toggletip__icon--size=16px]
 *
 * @cssproperty {color} [--c2-toggletip--background-color=#ffffff] - Surface of the bubble.
 * @cssproperty {color} [--c2-toggletip--color=#18181b] - Text colour in the bubble.
 * @cssproperty {border} [--c2-toggletip--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-toggletip--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-toggletip--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {font-size} [--c2-toggletip--font-size=14px]
 * @cssproperty {font-family} --c2-toggletip--font-family
 * @cssproperty {line-height} [--c2-toggletip--line-height=1.5]
 * @cssproperty {padding} [--c2-toggletip--padding-top=12px]
 * @cssproperty {padding} [--c2-toggletip--padding-right=14px]
 * @cssproperty {padding} [--c2-toggletip--padding-bottom=12px]
 * @cssproperty {padding} [--c2-toggletip--padding-left=14px]
 * @cssproperty {pixel} [--c2-toggletip--max-width=280px]
 * @cssproperty {pixel} [--c2-toggletip--offset=6px] - Distance between the button and the tip of the arrow.
 * @cssproperty {time} [--c2-toggletip--transition-duration=120ms]
 * @cssproperty {transform} [--c2-toggletip--enter-transform=scale(0.96)] - Start of the enter animation.
 * @cssproperty {pixel} [--c2-toggletip__arrow--size=10px] - Side of the arrow square; `0px` hides it.
 */
@customElement('c2-toggletip')
export class Toggletip extends LitElement {
  static override styles = unsafeCSS(styles)

  /**
   * Accessible name of the button. Defaults to the translatable "More information", unless the `icon` slot holds
   * words, which then name the button themselves.
   */
  @property() label = ''

  /** Preferred side of the button; flips when there is no room. */
  @property({ reflect: true }) placement: Placement = 'top'

  /** Visible state. Set it to open or close the bubble from code; that fires `show` / `hide` too. */
  @property({ type: Boolean, reflect: true }) open = false

  @query('.panel') private panel?: HTMLElement
  @query('.button') private button?: HTMLButtonElement
  @query('.arrow') private arrowElement?: HTMLElement

  /** Whether the `icon` slot holds words, which name the button better than a hidden label would. */
  @state() private iconHasText = false

  /**
   * Whether the live region holds the content. It is filled a frame after the bubble is shown, never in the same
   * render: a region that appears already full is not announced, one that is exposed and then filled is.
   */
  @state() private filled = false
  private fillFrame = 0

  private readonly msg = new LocalizeController(this, toggletipMessages)
  private cleanupPosition: (() => void) | null = null
  private offsetObserver: MutationObserver | null = null
  private offsetValue = ''

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.stopListening()
    this.stopPositioning()
    cancelAnimationFrame(this.fillFrame)
    // The browser hides a popover taken out of the document; keep `open` (and `aria-expanded`) in step with that.
    this.open = false
    this.filled = false
  }

  override focus(options?: FocusOptions) {
    this.button?.focus(options)
  }

  private handleIconSlotChange(event: Event) {
    const nodes = (event.target as HTMLSlotElement).assignedNodes({ flatten: true })
    // An icon's `<title>` or `<text>` is not visible wording, so an svg never counts.
    this.iconHasText = nodes.some((node) => !(node instanceof SVGElement) && !!node.textContent?.trim())
  }

  private handleButtonClick = () => {
    this.open = !this.open
  }

  private close(returnFocus: boolean) {
    if (!this.open) return
    this.open = false
    if (returnFocus) this.button?.focus()
  }

  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.open) return
    // Only the innermost layer closes: not an enclosing dialog, which would otherwise take the key as its close request.
    event.preventDefault()
    event.stopPropagation()
    this.close(true)
  }

  private handleDocumentPointerDown = (event: PointerEvent) => {
    if (event.composedPath().includes(this)) return
    this.close(false)
  }

  private handleFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null
    // No related target: the window lost focus, or the press went to something unfocusable, which pointerdown handles.
    if (!next || next === this || this.contains(next) || this.renderRoot.contains(next)) return
    this.close(false)
  }

  private startListening() {
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.addEventListener('focusout', this.handleFocusOut)
  }

  private stopListening() {
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.removeEventListener('focusout', this.handleFocusOut)
  }

  private readPixels(style: CSSStyleDeclaration, name: string, fallback: number) {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Number.isNaN(value) ? fallback : value
  }

  private startPositioning(panel: HTMLElement, anchor: HTMLElement) {
    this.stopPositioning()
    this.cleanupPosition = autoUpdate(anchor, panel, () => void this.updatePosition(panel, anchor))
    // Floating UI observes layout, but an edit to the offset (an inline style, a class) need not resize either element.
    const offsetValue = () => {
      const style = getComputedStyle(this)
      return `${style.getPropertyValue('--c2-toggletip--offset')}|${style.getPropertyValue('--c2-toggletip__arrow--size')}`
    }
    this.offsetValue = offsetValue()
    this.offsetObserver = new MutationObserver(() => {
      const next = offsetValue()
      if (next === this.offsetValue) return
      this.offsetValue = next
      void this.updatePosition(panel, anchor)
    })
    this.offsetObserver.observe(this, { attributes: true, attributeFilter: ['style', 'class'] })
  }

  private stopPositioning() {
    this.cleanupPosition?.()
    this.cleanupPosition = null
    this.offsetObserver?.disconnect()
    this.offsetObserver = null
  }

  private async updatePosition(panel: HTMLElement, anchor: HTMLElement) {
    const arrowElement = this.arrowElement
    const style = getComputedStyle(this)
    const arrowSize = arrowElement ? this.readPixels(style, '--c2-toggletip__arrow--size', 10) : 0
    const middleware = [offset(this.readPixels(style, '--c2-toggletip--offset', 6) + arrowSize / 2), flip({ padding: 8 }), shift({ padding: 8 })]
    if (arrowElement && arrowSize > 0) middleware.push(arrow({ element: arrowElement, padding: 8 }))
    const { x, y, placement, middlewareData } = await computePosition(anchor, panel, { placement: this.placement, strategy: 'fixed', middleware })
    panel.style.left = `${x}px`
    panel.style.top = `${y}px`
    panel.dataset.placement = placement
    if (arrowElement && middlewareData.arrow) {
      const side = placement.split('-')[0] as 'top' | 'right' | 'bottom' | 'left'
      const staticSide = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }[side]
      const { x: ax, y: ay } = middlewareData.arrow
      Object.assign(arrowElement.style, {
        left: ax != null ? `${ax}px` : '',
        top: ay != null ? `${ay}px` : '',
        right: '',
        bottom: '',
        [staticSide]: `${-arrowSize / 2}px`,
      })
    }
  }

  private show() {
    const panel = this.panel
    const anchor = this.button
    if (!panel || !anchor || panel.matches(':popover-open')) return
    try {
      panel.showPopover()
    } catch {
      return /* not connected yet */
    }
    this.startPositioning(panel, anchor)
    this.startListening()
    cancelAnimationFrame(this.fillFrame)
    this.fillFrame = requestAnimationFrame(() => (this.filled = this.open))
    this.dispatchEvent(new Event('show'))
  }

  private hide() {
    const panel = this.panel
    cancelAnimationFrame(this.fillFrame)
    this.filled = false
    this.stopPositioning()
    this.stopListening()
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
    if (changed.has('placement') && this.open && this.panel && this.button) void this.updatePosition(this.panel, this.button)
  }

  override render() {
    return html`
      <button
        class="button"
        part="button"
        type="button"
        aria-label=${this.label || (this.iconHasText ? nothing : this.msg.t('label'))}
        aria-expanded=${String(this.open)}
        aria-controls="panel"
        @click=${this.handleButtonClick}
        @keydown=${this.handleKeydown}
      >
        <span class="icon" part="icon">
          <slot name="icon" @slotchange=${this.handleIconSlotChange}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </slot>
        </span>
      </button>
      <div id="panel" class="panel" part="panel" popover="manual" @keydown=${this.handleKeydown}>
        <span class="arrow" part="arrow"></span>
        <!-- The live region is exposed first and filled a frame later, which is what makes it announced. -->
        <div class="content" part="content" role="status">${this.open && this.filled ? html`<slot></slot>` : nothing}</div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-toggletip': Toggletip
  }
}
