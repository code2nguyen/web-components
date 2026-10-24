import { LitElement, html, isServer, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { BottomNavItem } from './bottom-nav-item'
import { bottomNavMessages } from './messages'
import styles from './bottom-nav.scss?inline'

import './bottom-nav-item'

export type { BottomNavItem } from './bottom-nav-item'
export { bottomNavMessages } from './messages'

/** Which item labels are visible. Hidden labels stay the items' accessible names. */
export type BottomNavLabelVisibility = 'labeled' | 'auto' | 'selected' | 'unlabeled'

export interface BottomNavItemSelectEventDetail {
  /** The value of the activated item. */
  value: string
  /** The bar's value before the activation. */
  previous: string
  /** The activated item. */
  item: BottomNavItem
}

export interface BottomNavReselectEventDetail {
  /** The value of the current item, activated again. */
  value: string
  /** The activated item. */
  item: BottomNavItem
}

/** Events fired by {@link BottomNav}, keyed for `addEventListener`. */
export interface BottomNavEventMap {
  'item-select': CustomEvent<BottomNavItemSelectEventDetail>
  change: Event
  reselect: CustomEvent<BottomNavReselectEventDetail>
}

export interface BottomNav {
  addEventListener: TypedAddEventListener<BottomNav, BottomNavEventMap>
  removeEventListener: TypedRemoveEventListener<BottomNav, BottomNavEventMap>
}

/** Scroll travel in one direction, in pixels, before `hide-on-scroll` sends the bar away or brings it back. */
const SCROLL_TRAVEL = 24

const ITEM_TAG = 'c2-bottom-nav-item'

/**
 * The mobile tab bar: three to five `c2-bottom-nav-item` destinations along the bottom of the screen, each an icon
 * over a short label with an optional count or dot badge. It is a navigation landmark (named "Main" unless the host
 * has an `aria-label`) of plain links or buttons, the current one announced with `aria-current="page"`; not a tab
 * list, so every item is a normal tab stop.
 *
 * Set `value` to the value of the item being shown, or mark that item `current`. Activating another item fires a
 * cancelable `item-select` (cancelling it also stops the link, for an unsaved-changes guard), then updates `value`
 * and fires `change`. Activating the current item again fires `reselect`, the place to scroll back to the top.
 *
 * The host is `position: sticky` to the bottom by default, so as the last element of the page it stays on screen
 * without covering the end of the content, and the bar is padded by `env(safe-area-inset-bottom)` for the home
 * indicator. With `hide-on-scroll` it slides away while the page scrolls down and returns on scroll up, at the top
 * or when focus moves into it. Every look (Material indicator, translucent glass, floating dock, top line) is a set
 * of CSS variables.
 *
 * @tag c2-bottom-nav
 *
 * @slot default - The `c2-bottom-nav-item` elements, three to five of them.
 *
 * @csspart bar - The visible bar: background, border, radius, safe-area padding. It slides away with `hide-on-scroll`.
 *
 * @event {CustomEvent<BottomNavItemSelectEventDetail>} item-select - An item other than the current one was activated. Cancelable: cancelling keeps `value` and stops a link from navigating.
 * @event {Event} change - `value` changed because an item was activated.
 * @event {CustomEvent<BottomNavReselectEventDetail>} reselect - The current item was activated again.
 *
 * @cssproperty {position} [--c2-bottom-nav--position=sticky] - `fixed` pins it to the viewport wherever it sits in the page.
 * @cssproperty {number} [--c2-bottom-nav--z-index=10]
 * @cssproperty {background} [--c2-bottom-nav--background=#ffffff] - A translucent colour with `backdrop-filter` gives the glass look.
 * @cssproperty {border} [--c2-bottom-nav--border-top=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-bottom-nav--border-radius=0px]
 * @cssproperty {box-shadow} [--c2-bottom-nav--box-shadow=none]
 * @cssproperty {backdrop-filter} [--c2-bottom-nav--backdrop-filter=none] - Such as `blur(18px) saturate(1.6)` over a translucent background.
 * @cssproperty {margin} [--c2-bottom-nav--margin=0px] - Lifts the bar off the screen edges for a floating dock.
 * @cssproperty {pixel} [--c2-bottom-nav--max-width=none]
 * @cssproperty {pixel} [--c2-bottom-nav--min-height=64px]
 * @cssproperty {padding} [--c2-bottom-nav--padding-top=0px]
 * @cssproperty {padding} [--c2-bottom-nav--padding-right=0px]
 * @cssproperty {padding} [--c2-bottom-nav--padding-bottom=env(safe-area-inset-bottom, 0px)] - Keeps the items clear of the home indicator.
 * @cssproperty {padding} [--c2-bottom-nav--padding-left=0px]
 * @cssproperty {pixel} [--c2-bottom-nav--gap=0px] - Space between items.
 * @cssproperty {transform} [--c2-bottom-nav__away--transform=translateY(calc(100% + 32px))] - Where `hide-on-scroll` moves the bar.
 * @cssproperty {time} [--c2-bottom-nav__away--transition-duration=0.2s] - Length of that slide; reduced motion drops it.
 *
 * @slotcomponent c2-bottom-nav-item
 */
@customElement('c2-bottom-nav')
export class BottomNav extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Value of the current item. Empty: the item marked `current` decides, and `value` reads it back. */
  @property() value = ''

  /** Which labels show: all (`labeled`), all up to three items and the current one from four (`auto`), the current one (`selected`) or none (`unlabeled`). */
  @property({ attribute: 'label-visibility' }) labelVisibility: BottomNavLabelVisibility = 'labeled'

  /** Slides the bar away while the page scrolls down and brings it back on scroll up, at the top or on focus. */
  @property({ type: Boolean, attribute: 'hide-on-scroll' }) hideOnScroll = false

  /** Id of the element whose scrolling `hide-on-scroll` follows, looked up in the bar's document or shadow root. Empty: the window. */
  @property({ attribute: 'scroll-target' }) scrollTarget = ''

  @state() private away = false

  private readonly internals = isServer ? undefined : this.attachInternals()

  private readonly msg = new LocalizeController(this, bottomNavMessages)

  private scroller: Window | HTMLElement | null = null
  private lastScrollTop = 0
  private travel = 0

  /** Whether `hide-on-scroll` has currently moved the bar out of view. Also exposed as `:state(scrolled-away)`. */
  get scrolledAway(): boolean {
    return this.away
  }

  /** The bar's `c2-bottom-nav-item` elements, in order. */
  get items(): BottomNavItem[] {
    return BottomNav.collectItems(this)
  }

  /**
   * The nearest `c2-bottom-nav-item` descendants of `root`, looking through anything that is not one. An item is not
   * always a literal child: Astro wraps every island in a `display: contents` `<astro-island>`, and an app may wrap
   * items in a router link component.
   */
  private static collectItems(root: ParentNode): BottomNavItem[] {
    const found: BottomNavItem[] = []
    for (const child of root.children) {
      if (child.localName === ITEM_TAG) found.push(child as BottomNavItem)
      else found.push(...BottomNav.collectItems(child))
    }
    return found
  }

  constructor() {
    super()
    if (!isServer) {
      this.addEventListener('click', this.handleClick)
      this.addEventListener('focusin', () => this.setAway(false))
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    if (this.internals) this.internals.role = 'navigation'
    if (this.hasUpdated) this.listenToScroll()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.stopListeningToScroll()
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    super.willUpdate(changed)
    // Recomputed on every update, which the localize controller requests when the language changes.
    if (this.internals) this.internals.ariaLabel = this.msg.t('navigationLabel')
    if (changed.has('value')) this.adoptMarkedValue()
  }

  protected override updated(changed: PropertyValues<this>) {
    super.updated(changed)
    if (changed.has('value') || changed.has('labelVisibility')) this.syncItems()
    if (changed.has('hideOnScroll') || changed.has('scrollTarget')) this.listenToScroll()
  }

  /** Without a `value`, the item the author marked `current` provides it. */
  private adoptMarkedValue() {
    if (this.value) return
    const marked = this.items.find((item) => item.current)
    if (marked) this.value = marked.effectiveValue
  }

  private syncItems() {
    const items = this.items
    // Items load in their own module (an island each, on the docs site) and may not be upgraded yet.
    if (!customElements.get(ITEM_TAG) && items.length) {
      void customElements.whenDefined(ITEM_TAG).then(() => {
        this.adoptMarkedValue()
        this.syncItems()
      })
      return
    }
    for (const item of items) {
      const current = !!this.value && item.effectiveValue === this.value
      const labelHidden = this.labelHiddenFor(current, items.length)
      if (item.current !== current || item.labelHidden !== labelHidden) this.assign(item, { current, labelHidden })
    }
  }

  private labelHiddenFor(current: boolean, count: number): boolean {
    switch (this.labelVisibility) {
      case 'unlabeled':
        return true
      case 'selected':
        return !current
      case 'auto':
        return count > 3 && !current
      default:
        return false
    }
  }

  /**
   * A server-rendered item hydrates after the bar, and a property written before that would make its first client
   * render differ from the server's, so wait for its first update.
   */
  private assign(item: BottomNavItem, values: Pick<BottomNavItem, 'current' | 'labelHidden'>) {
    if (item.shadowRoot && !item.hasUpdated) void item.updateComplete.then(() => Object.assign(item, values))
    else Object.assign(item, values)
  }

  private handleSlotChange() {
    this.adoptMarkedValue()
    this.syncItems()
  }

  private readonly handleClick = (event: MouseEvent) => {
    if (event.defaultPrevented) return
    const item = event.composedPath().find((node): node is BottomNavItem => node instanceof Element && node.localName === ITEM_TAG)
    if (!item || !this.items.includes(item)) return
    // A modified click on a link opens it elsewhere and leaves this page where it is.
    if (item.href && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return
    const value = item.effectiveValue
    const previous = this.value
    if (value === previous) {
      this.dispatchEvent(new CustomEvent<BottomNavReselectEventDetail>('reselect', { detail: { value, item }, bubbles: true, composed: true }))
      return
    }
    const proceed = this.dispatchEvent(
      new CustomEvent<BottomNavItemSelectEventDetail>('item-select', { detail: { value, previous, item }, bubbles: true, composed: true, cancelable: true }),
    )
    if (!proceed) {
      event.preventDefault()
      return
    }
    this.value = value
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  private listenToScroll() {
    this.stopListeningToScroll()
    if (isServer || !this.hideOnScroll || !this.isConnected) {
      this.setAway(false)
      return
    }
    const root = this.getRootNode() as Document | ShadowRoot
    const target = this.scrollTarget ? root.getElementById?.(this.scrollTarget) : window
    if (!target) return
    this.scroller = target
    this.lastScrollTop = this.readScrollTop(target)
    this.travel = 0
    target.addEventListener('scroll', this.handleScroll, { passive: true })
  }

  private stopListeningToScroll() {
    this.scroller?.removeEventListener('scroll', this.handleScroll)
    this.scroller = null
  }

  private readScrollTop(target: Window | HTMLElement): number {
    return target instanceof Window ? target.scrollY : target.scrollTop
  }

  private readonly handleScroll = () => {
    if (!this.scroller) return
    const top = this.readScrollTop(this.scroller)
    const delta = top - this.lastScrollTop
    this.lastScrollTop = top
    if (top <= 0) {
      this.travel = 0
      this.setAway(false)
      return
    }
    if (delta === 0) return
    this.travel = delta > 0 === this.travel > 0 ? this.travel + delta : delta
    if (this.travel > SCROLL_TRAVEL) this.setAway(true)
    else if (this.travel < -SCROLL_TRAVEL) this.setAway(false)
  }

  private setAway(away: boolean) {
    // Focus inside the bar keeps it on screen for keyboard users.
    if (away && this.matches(':focus-within')) return
    this.away = away
    if (away) this.internals?.states.add('scrolled-away')
    else this.internals?.states.delete('scrolled-away')
  }

  override render() {
    return html`<div part="bar" class="bar ${this.away ? 'is-away' : ''}"><slot @slotchange=${this.handleSlotChange}></slot></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-bottom-nav': BottomNav
  }
}
