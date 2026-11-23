import { LitElement, html, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { computePosition, autoUpdate, flip, offset, shift, size, type Placement } from '@floating-ui/dom'
import styles from './overlay.scss?inline'

export type { Placement }

/** Events fired by {@link Overlay}, keyed for `addEventListener`. */
export interface OverlayEventMap {
  toggle: ToggleEvent
  beforetoggle: ToggleEvent
}

export interface Overlay {
  addEventListener: TypedAddEventListener<Overlay, OverlayEventMap>
  removeEventListener: TypedRemoveEventListener<Overlay, OverlayEventMap>
}

/** A native button, or an element that forwards commands to the button in its shadow root (`c2-button`, which has `commandFor`). */
const isInvoker = (element: Element) => element instanceof HTMLButtonElement || ('commandFor' in element && !!element.shadowRoot?.querySelector('button'))

const POSITIONING_VARIABLES = ['--c2-overlay--offset-y', '--c2-overlay--offset-x', '--c2-overlay--viewport-padding']

/**
 * Anchored popup built on the browser Popover API: the element sits in the top layer, opens and light-dismisses
 * natively (Escape, click outside) and is positioned next to its anchor with floating-ui. The anchor is found in
 * this order: the `anchor` property (an element), the `anchor` attribute (an element id in the same tree), or the
 * element whose `popovertarget` or `commandfor` points at this overlay's `id`. A `commandfor` trigger (a native button
 * or a `c2-button`) with `command="show-popover"`, `"hide-popover"` or `"toggle-popover"` opens and closes it through
 * the browser's invoker commands; the overlay keeps a `c2-button` `toggle-popover` trigger's `aria-expanded` in step
 * (from its first open on, never on upgrade, so a server-rendered page hydrates cleanly). The overlay only positions
 * itself; the content brings its own surface (background, border, shadow), so it fits menus, pickers and cards alike.
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
  @property({ reflect: true })
  placement:
    'top' | 'top-start' | 'top-end' | 'right' | 'right-start' | 'right-end' | 'bottom' | 'bottom-start' | 'bottom-end' | 'left' | 'left-start' | 'left-end' =
    'bottom-start'

  /** Distance in pixels from the anchor along the placement direction. Falls back to `--c2-overlay--offset-y`. */
  @property({ type: Number }) offset: number | undefined = undefined

  /** Shift in pixels perpendicular to the placement direction. Falls back to `--c2-overlay--offset-x`. */
  @property({ type: Number, attribute: 'cross-offset' }) crossOffset: number | undefined = undefined

  /** Do not flip across the cross axis when there is no room (only along the main axis). */
  @property({ type: Boolean, reflect: true, attribute: 'disabled-cross-axis' }) disabledCrossAxis = false

  /** Make the overlay exactly as wide as the anchor. */
  @property({ type: Boolean, attribute: 'fit-anchor' }) fitTarget = false

  /** By default the overlay is at least as wide as its anchor; set this to size it by its content only. */
  @property({ type: Boolean, attribute: 'free-width' }) freeWidth = false

  /** Anchor element, or (attribute) the id of the anchor. Falls back to the element that opens it: a `popovertarget` or `commandfor` (`toggle-popover`/`show-popover`) trigger naming this overlay's id, outside the overlay. */
  @property() anchor: string | HTMLElement | undefined = undefined

  private cleanupPosition: (() => void) | null = null
  /** A repositioning waiting for the next frame. */
  private positionFrame = 0
  /** Bumped when positioning starts or stops: a computation begun before then no longer applies. */
  private positionGeneration = 0
  private positioningStyleObserver: MutationObserver | null = null
  private positioningStyleValues = ''

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
    // Removed from the page, the popover is hidden without a `toggle` event: give the triggers back their own state.
    for (const trigger of this.expandedTriggers) this.setExpanded(trigger, this.authoredExpanded.get(trigger) == null ? null : 'false')
    this.expandedTriggers.clear()
    this.authoredExpanded.clear()
  }

  /** Triggers `syncTriggers` gave an expanded state, so it can take it back. */
  private expandedTriggers = new Set<HTMLElement>()
  /** Whether each of those triggers had an `ariaExpanded` before; when the overlay lets go, it gets "false" or none. */
  private authoredExpanded = new Map<HTMLElement, string | null>()

  /**
   * `aria-expanded` of the `c2-button` `toggle-popover` triggers naming this overlay, as a `popovertarget` button gets
   * natively. It takes it as a property it hands to its inner button, so nothing lands on its host. A native button
   * gets it from the browser.
   */
  private syncTriggers() {
    const root = this.getRootNode() as ParentNode
    const triggers = new Set<HTMLElement>()
    if (this.id && root.querySelectorAll)
      for (const trigger of root.querySelectorAll<HTMLElement>(`[commandfor="${CSS.escape(this.id)}"][command="toggle-popover" i]`))
        if (!(trigger instanceof HTMLButtonElement) && isInvoker(trigger) && customElements.get(trigger.localName)) triggers.add(trigger)
    for (const trigger of this.expandedTriggers)
      if (!triggers.has(trigger)) {
        this.setExpanded(trigger, this.authoredExpanded.get(trigger) == null ? null : 'false')
        this.authoredExpanded.delete(trigger)
      }
    // The popover's own state, which `open` may not have caught up with yet.
    const expanded = String(this.matches(':popover-open'))
    for (const trigger of triggers) {
      if (!this.authoredExpanded.has(trigger)) this.authoredExpanded.set(trigger, trigger.ariaExpanded)
      this.setExpanded(trigger, expanded)
    }
    this.expandedTriggers = triggers
  }

  private setExpanded(trigger: HTMLElement, expanded: string | null) {
    if (trigger.ariaExpanded === expanded) return
    // modern-web-ignore: aria-attribute-on-other-element a c2-button takes this as a property it hands to its inner button; nothing lands on its host
    trigger.ariaExpanded = expanded
  }

  /** The resolved anchor element, if any. */
  get anchorElement(): HTMLElement | null {
    if (this.anchor instanceof HTMLElement) return this.anchor
    const root = this.getRootNode() as Document | ShadowRoot
    if (typeof this.anchor === 'string' && this.anchor) {
      return (root.querySelector?.(`#${CSS.escape(this.anchor)}`) as HTMLElement | null) ?? null
    }
    if (!this.id) return null
    const id = CSS.escape(this.id)
    // A trigger that opens it: not a `hide-popover` button, and never one inside the overlay (its own Close button).
    const invoker = `[popovertarget="${id}"]:not([popovertargetaction="hide" i]), [commandfor="${id}"]:is([command="toggle-popover" i], [command="show-popover" i])`
    // Only an element that can open it: a `commandfor` element must be an invoker (`c2-icon-button` forwards no command).
    const outside = (scope: ParentNode) =>
      [...scope.querySelectorAll<HTMLElement>(invoker)].find(
        (element) => !this.contains(element) && (!element.hasAttribute('commandfor') || isInvoker(element)),
      ) ?? null
    // The element that opens this popover, searched upwards so a control inside a sibling subtree is found too.
    let parent: HTMLElement | null = this.parentElement
    while (parent) {
      const found = outside(parent)
      if (found) return found
      parent = parent.parentElement
    }
    return outside(root)
  }

  private handleBeforeToggle = (event: Event) => {
    if ((event as ToggleEvent).newState === 'open') this.startPositioning()
    else this.stopPositioning()
  }

  private handleToggle = (event: Event) => {
    this.open = (event as ToggleEvent).newState === 'open'
    this.syncTriggers()
  }

  private readPixels(name: string, fallback: number): number {
    const value = Number.parseFloat(getComputedStyle(this).getPropertyValue(name))
    return Number.isNaN(value) ? fallback : value
  }

  private startPositioning() {
    this.stopPositioning()
    this.positionGeneration++
    const anchor = this.anchorElement
    if (!anchor) return
    // Placed at once when it opens; after that, a change Floating UI reports (it watches both elements' sizes) is
    // followed on the next frame. Placing it changes the room it has, and content that wraps (a row with a line of
    // description) then changes its size again: answered in the same observer callback, that is a resize loop.
    let placed = false
    this.cleanupPosition = autoUpdate(anchor, this, () => {
      if (!placed) {
        placed = true
        void this.updatePosition(anchor)
        return
      }
      if (this.positionFrame) return
      this.positionFrame = requestAnimationFrame(() => {
        this.positionFrame = 0
        void this.updatePosition(anchor)
      })
    })
    // Floating UI observes layout, but an edit to a positioning variable (an inline style, a class) need not resize
    // either element. Positioning writes the host's own style too, so only a change in the variables repositions.
    const positioningValues = () => {
      const style = getComputedStyle(this)
      return POSITIONING_VARIABLES.map((name) => style.getPropertyValue(name)).join('|')
    }
    this.positioningStyleValues = positioningValues()
    this.positioningStyleObserver = new MutationObserver(() => {
      const next = positioningValues()
      if (next === this.positioningStyleValues) return
      this.positioningStyleValues = next
      void this.updatePosition(anchor)
    })
    this.positioningStyleObserver.observe(this, { attributes: true, attributeFilter: ['style', 'class'] })
  }

  private stopPositioning() {
    this.positionGeneration++
    this.cleanupPosition?.()
    this.cleanupPosition = null
    cancelAnimationFrame(this.positionFrame)
    this.positionFrame = 0
    this.positioningStyleObserver?.disconnect()
    this.positioningStyleObserver = null
  }

  private async updatePosition(anchor: HTMLElement) {
    const generation = this.positionGeneration
    const mainAxis = Number.isFinite(this.offset) ? this.offset! : this.readPixels('--c2-overlay--offset-y', 8)
    const crossAxis = Number.isFinite(this.crossOffset) ? this.crossOffset! : this.readPixels('--c2-overlay--offset-x', 0)
    const padding = this.readPixels('--c2-overlay--viewport-padding', 8)

    // The host is the popover itself, the top-layer box floating-ui sizes and places. These writes happen only while it
    // is open (never in a server render), and `current-placement` and the available-size variables are documented API.
    // modern-web-ignore: host-style-write the host is the open top-layer box floating-ui sizes to its anchor
    this.style.width = this.fitTarget ? `${anchor.offsetWidth}px` : ''
    // modern-web-ignore: host-style-write the host is the open top-layer box floating-ui sizes to its anchor
    this.style.minWidth = !this.freeWidth && !this.fitTarget ? `${anchor.offsetWidth}px` : ''

    const result = computePosition(anchor, this, {
      placement: this.placement,
      middleware: [
        offset({ mainAxis, crossAxis }),
        flip({ crossAxis: !this.disabledCrossAxis, padding }),
        shift({ padding }),
        size({
          padding,
          apply: ({ availableHeight, availableWidth }) => {
            if (generation !== this.positionGeneration) return
            // modern-web-ignore: host-style-write documented output variable, read on the host by authors to cap content
            this.style.setProperty('--c2-overlay--available-height', `${Math.max(0, Math.floor(availableHeight))}px`)
            // modern-web-ignore: host-style-write documented output variable, read on the host by authors to cap content
            this.style.setProperty('--c2-overlay--available-width', `${Math.max(0, Math.floor(availableWidth))}px`)
          },
        }),
      ],
    })
    const { x, y, placement } = await result
    // Closed, or started again with new options, while this was being computed: a newer placement owns the styles.
    if (generation !== this.positionGeneration) return
    // modern-web-ignore: host-style-write the host is the open top-layer box floating-ui places
    this.style.left = `${x}px`
    // modern-web-ignore: host-style-write the host is the open top-layer box floating-ui places
    this.style.top = `${y}px`
    // modern-web-ignore: host-attribute-write documented `current-placement` output authors style against, written only while open
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
    if ((changed.has('placement') || changed.has('offset') || changed.has('crossOffset')) && this.matches(':popover-open')) this.startPositioning()
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
