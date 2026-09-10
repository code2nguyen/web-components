import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { isServer } from 'lit-html/is-server.js'
import { customElement, property } from 'lit/decorators.js'
import { computePosition, autoUpdate, flip, offset, shift, size, type Placement } from '@floating-ui/dom'
import styles from './overlay.scss?inline'

export type { Placement }

/**
 * Anchored popup built on the browser Popover API: the element sits in the top layer, opens and light-dismisses
 * natively (Escape, click outside) and is positioned next to its anchor with floating-ui. The anchor is found in
 * this order: the `anchor` property (an element), the `anchor` attribute (an element id in the same tree), or the
 * element whose `popovertarget` points at this overlay's `id`. The overlay only positions itself; the content brings
 * its own surface (background, border, shadow), so it fits menus, pickers and cards alike.
 *
 * The preferred `placement` may flip or shift to stay in the viewport; the placement actually used is exposed as the
 * `current-placement` attribute, and the space available on that side as `--c2-overlay--available-height` /
 * `--c2-overlay--available-width` custom properties (use them to cap a scrolling list).
 *
 * @tag c2-overlay
 *
 * @slot - Content of the overlay.
 *
 * @event {ToggleEvent} toggle - Native popover toggle: `newState` is `open` or `closed`.
 * @event {ToggleEvent} beforetoggle - Native, cancelable, fired before the state changes.
 *
 * @cssproperty {pixel} [--c2-overlay--offset-y=8px] - Distance between the anchor and the overlay along the main axis.
 * @cssproperty {pixel} [--c2-overlay--offset-x=0px] - Shift along the cross axis (towards the end for `*-start`, the start for `*-end`).
 * @cssproperty {pixel} [--c2-overlay--viewport-padding=8px] - Minimum gap kept between the overlay and the viewport edges.
 * @cssproperty {time} [--c2-overlay--transition-duration=150ms] - Open/close fade and scale; `0ms` disables it.
 * @cssproperty {color} [--c2-overlay__backdrop--background=transparent] - The `::backdrop` behind the popover.
 */
@customElement('c2-overlay')
export class Overlay extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Open state, kept in sync with the native popover (setting it shows or hides the popover). */
  @property({ type: Boolean, reflect: true }) open = false

  /** Preferred placement (floating-ui names). The one in use is reflected as `current-placement`. */
  @property({ reflect: true }) placement: Placement = 'bottom-start'

  /** Do not flip across the cross axis when there is no room (only along the main axis). */
  @property({ type: Boolean, reflect: true, attribute: 'disabled-cross-axis' }) disabledCrossAxis = false

  /** Make the overlay exactly as wide as the anchor. */
  @property({ type: Boolean, attribute: 'fit-anchor' }) fitTarget = false

  /** By default the overlay is at least as wide as its anchor; set this to size it by its content only. */
  @property({ type: Boolean, attribute: 'free-width' }) freeWidth = false

  /** Anchor element, or (attribute) the id of the anchor. Falls back to the element whose `popovertarget` is this overlay's id. */
  @property() anchor: string | HTMLElement | undefined = undefined

  private cleanupPosition: (() => void) | null = null

  constructor() {
    super()
    if (!isServer) {
      this.addEventListener('beforetoggle', this.handleBeforeToggle)
      this.addEventListener('toggle', this.handleToggle)
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    if (!isServer && !this.hasAttribute('popover')) this.setAttribute('popover', 'auto')
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.stopPositioning()
  }

  /** The resolved anchor element, if any. */
  get anchorElement(): HTMLElement | null {
    if (this.anchor instanceof HTMLElement) return this.anchor
    const root = this.getRootNode() as Document | ShadowRoot
    if (typeof this.anchor === 'string' && this.anchor) {
      return (root.querySelector?.(`#${CSS.escape(this.anchor)}`) as HTMLElement | null) ?? null
    }
    if (!this.id) return null
    // The element that opens this popover, searched upwards so a control inside a sibling subtree is found too.
    let parent: HTMLElement | null = this.parentElement
    while (parent) {
      const found = parent.querySelector<HTMLElement>(`[popovertarget="${CSS.escape(this.id)}"]`)
      if (found) return found
      parent = parent.parentElement
    }
    return (root.querySelector?.(`[popovertarget="${CSS.escape(this.id)}"]`) as HTMLElement | null) ?? null
  }

  private handleBeforeToggle = (event: Event) => {
    if ((event as ToggleEvent).newState === 'open') this.startPositioning()
    else this.stopPositioning()
  }

  private handleToggle = (event: Event) => {
    this.open = (event as ToggleEvent).newState === 'open'
  }

  private readPixels(name: string, fallback: number): number {
    const value = Number.parseFloat(getComputedStyle(this).getPropertyValue(name))
    return Number.isNaN(value) ? fallback : value
  }

  private startPositioning() {
    this.stopPositioning()
    const anchor = this.anchorElement
    if (!anchor) return
    this.cleanupPosition = autoUpdate(anchor, this, () => this.updatePosition(anchor))
  }

  private stopPositioning() {
    this.cleanupPosition?.()
    this.cleanupPosition = null
  }

  private async updatePosition(anchor: HTMLElement) {
    const mainAxis = this.readPixels('--c2-overlay--offset-y', 8)
    const crossAxis = this.readPixels('--c2-overlay--offset-x', 0)
    const padding = this.readPixels('--c2-overlay--viewport-padding', 8)

    if (this.fitTarget) this.style.width = `${anchor.offsetWidth}px`
    else this.style.removeProperty('width')
    if (!this.freeWidth && !this.fitTarget) this.style.minWidth = `${anchor.offsetWidth}px`
    else this.style.removeProperty('min-width')

    const { x, y, placement } = await computePosition(anchor, this, {
      placement: this.placement,
      middleware: [
        offset({ mainAxis, crossAxis }),
        flip({ crossAxis: !this.disabledCrossAxis, padding }),
        shift({ padding }),
        size({
          padding,
          apply: ({ availableHeight, availableWidth }) => {
            this.style.setProperty('--c2-overlay--available-height', `${Math.max(0, Math.floor(availableHeight))}px`)
            this.style.setProperty('--c2-overlay--available-width', `${Math.max(0, Math.floor(availableWidth))}px`)
          },
        }),
      ],
    })
    this.style.left = `${x}px`
    this.style.top = `${y}px`
    this.setAttribute('current-placement', placement)
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('open') && !isServer && this.isConnected) {
      const isOpen = this.matches(':popover-open')
      try {
        if (this.open && !isOpen) this.showPopover()
        else if (!this.open && isOpen) this.hidePopover()
      } catch {
        // Not a popover (attribute removed) or not yet rendered: nothing to do.
      }
    }
    if (changed.has('placement') && this.matches(':popover-open')) this.startPositioning()
  }

  override render() {
    return html`<slot></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-overlay': Overlay
  }
}
