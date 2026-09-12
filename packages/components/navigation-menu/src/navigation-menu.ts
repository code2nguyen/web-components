import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import styles from './navigation-menu.scss?inline'
import { NavigationMenuItem, type PanelToggleEventDetail } from './navigation-menu-item'

import './navigation-menu-item'
import './navigation-menu-link'

export type { PanelToggleEventDetail } from './navigation-menu-item'
export type { Placement } from '@c2n/overlay'

/** `bar` is the row of items; `mobile` is the whole navigation as one hierarchy behind a single button. */
export type NavigationMenuMode = 'bar' | 'mobile'

export interface ValueChangeEventDetail {
  /** The `value` of the item whose panel is open, or `''` when the bar is closed. */
  value: string
}

/**
 * Site navigation bar: a row of `c2-navigation-menu-item` children, each either a plain link or a trigger that opens
 * a panel of `c2-navigation-menu-link` rows (or any markup) below the bar. The panels are native popovers on the top
 * layer positioned by `c2-overlay`, so they are never clipped by the header and light-dismiss on Escape or an outside
 * click.
 *
 * The bar owns which panel is open: `value` is the `value` of that item (`''` when closed), and `value-change` fires
 * on every change. Panels open on hover after `open-delay` and close after `close-delay` once the pointer leaves both
 * the item and its panel; a click on a trigger opens its panel straight away. Set `open-on="click"` for a bar that
 * ignores hover entirely, where a click on the open trigger closes it again.
 *
 * Keyboard: every item is a tab stop. On a trigger, ArrowLeft / ArrowRight and Home / End move along the bar (moving
 * while a panel is open switches to that item's panel), ArrowDown, Enter or Space opens the panel and moves focus to
 * its first link, and Escape closes it and returns focus to the trigger. Tab from an open trigger walks into the
 * panel, since the popover sits right after the trigger in the DOM.
 *
 * The bar never wraps: it is one row, and `mode="mobile"` is the other layout. In `mobile` mode the bar becomes a
 * single button — the `mobile-trigger` slot replaces it — that opens the whole navigation as one hierarchy: every
 * plain link is a row, and every item with a panel becomes a heading with its panel's rows underneath. Add
 * `collapsible` and those groups open one at a time instead, the open one being `value`, exactly as in the bar, and
 * the list starts on the group holding the current page. Set `mobile-breakpoint` and the bar switches modes on its
 * own below that viewport width; leave it unset and `mode` is yours to set, from a media query of your own or from
 * anything else that knows better.
 *
 * @tag c2-navigation-menu
 *
 * @slot default - The items: `c2-navigation-menu-item` elements.
 * @slot mobile-trigger - Replaces the button shown in `mobile` mode.
 *
 * @event {CustomEvent<ValueChangeEventDetail>} value-change - Fired after the open panel changes. `detail.value` is the `value` of the open item, or `''` when the bar closed.
 *
 * @cssproperty {pixel} [--c2-navigation-menu--gap=4px] - Space between the items.
 * @cssproperty {color} --c2-navigation-menu--background
 * @cssproperty {padding} [--c2-navigation-menu--padding-top=0px]
 * @cssproperty {padding} [--c2-navigation-menu--padding-right=0px]
 * @cssproperty {padding} [--c2-navigation-menu--padding-bottom=0px]
 * @cssproperty {padding} [--c2-navigation-menu--padding-left=0px]
 * @cssproperty {border-radius} --c2-navigation-menu--border-top-left-radius
 * @cssproperty {border-radius} --c2-navigation-menu--border-top-right-radius
 * @cssproperty {border-radius} --c2-navigation-menu--border-bottom-left-radius
 * @cssproperty {border-radius} --c2-navigation-menu--border-bottom-right-radius
 * @cssproperty {border} --c2-navigation-menu--border-top
 * @cssproperty {border} --c2-navigation-menu--border-right
 * @cssproperty {border} --c2-navigation-menu--border-bottom
 * @cssproperty {border} --c2-navigation-menu--border-left
 * @cssproperty {box-shadow} --c2-navigation-menu--box-shadow
 *
 * @cssproperty {pixel} [--c2-navigation-menu__mobile-trigger--size=40px]
 * @cssproperty {color} [--c2-navigation-menu__mobile-trigger--color=#18181b]
 * @cssproperty {color} [--c2-navigation-menu__mobile-trigger--background=transparent]
 * @cssproperty {border} [--c2-navigation-menu__mobile-trigger--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-navigation-menu__mobile-trigger--border-radius=8px]
 * @cssproperty {pixel} [--c2-navigation-menu__mobile-trigger__icon--size=20px]
 * @cssproperty {color} [--c2-navigation-menu__mobile-trigger__hover--background=#f4f4f5]
 * @cssproperty {color} --c2-navigation-menu__mobile-trigger__hover--color
 * @cssproperty {outline} [--c2-navigation-menu__mobile-trigger__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-navigation-menu__mobile-trigger__focus--outline-offset=1px]
 *
 * @cssproperty {color} [--c2-navigation-menu__mobile-panel--background=#ffffff]
 * @cssproperty {pixel} [--c2-navigation-menu__mobile-panel--min-width=260px] - Set it to `calc(100vw - 32px)` for a sheet that spans the screen.
 * @cssproperty {pixel} --c2-navigation-menu__mobile-panel--max-width
 * @cssproperty {pixel} [--c2-navigation-menu__mobile-panel--max-height=min(80vh, var(--c2-overlay--available-height, 80vh))] - The list scrolls past this height.
 * @cssproperty {pixel} [--c2-navigation-menu__mobile-panel--gap=2px] - Space between the rows and groups.
 * @cssproperty {border} [--c2-navigation-menu__mobile-panel--border-top=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-navigation-menu__mobile-panel--border-right=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-navigation-menu__mobile-panel--border-bottom=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-navigation-menu__mobile-panel--border-left=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-navigation-menu__mobile-panel--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-navigation-menu__mobile-panel--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-navigation-menu__mobile-panel--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-navigation-menu__mobile-panel--border-bottom-right-radius=8px]
 * @cssproperty {box-shadow} [--c2-navigation-menu__mobile-panel--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {padding} [--c2-navigation-menu__mobile-panel--padding-top=8px]
 * @cssproperty {padding} [--c2-navigation-menu__mobile-panel--padding-right=8px]
 * @cssproperty {padding} [--c2-navigation-menu__mobile-panel--padding-bottom=8px]
 * @cssproperty {padding} [--c2-navigation-menu__mobile-panel--padding-left=8px]
 *
 * @internalcomponent c2-overlay
 *
 * @slotcomponent c2-navigation-menu-item
 */
@customElement('c2-navigation-menu')
export class NavigationMenu extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The `value` of the item whose panel is open; `''` closes the bar. Set it to open a panel from code. */
  @property({ reflect: true }) value = ''

  /** Accessible name of the navigation landmark. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** `hover` opens a panel on pointer intent (and on click); `click` waits for a click or the keyboard. */
  @property({ attribute: 'open-on' }) openOn: 'hover' | 'click' = 'hover'

  /** Pointer intent before the first panel opens, in milliseconds. A panel switch is always immediate. */
  @property({ type: Number, attribute: 'open-delay' }) openDelay = 150

  /** Grace period before a panel closes once the pointer has left both the item and the panel, in milliseconds. */
  @property({ type: Number, attribute: 'close-delay' }) closeDelay = 300

  /** `item` opens each panel under its own item; `menu` aligns every panel to the bar, for full-width mega panels. */
  @property({ attribute: 'panel-anchor' }) panelAnchor: 'item' | 'menu' = 'item'

  /** `bar` shows the row of items; `mobile` shows one button that opens the whole navigation as a hierarchy list. */
  @property({ reflect: true }) mode: NavigationMenuMode = 'bar'

  /** In `mobile` mode, groups open one at a time instead of all being listed at once. */
  @property({ type: Boolean, reflect: true }) collapsible = false

  /**
   * Viewport width, in pixels, at or below which the bar switches itself to `mobile` — and back to `bar` above it.
   * Leave it at `0` to own `mode` yourself, which is what a breakpoint that depends on something other than the
   * window needs.
   */
  @property({ type: Number, attribute: 'mobile-breakpoint' }) mobileBreakpoint = 0

  /** Accessible name of the button shown in `mobile` mode. */
  @property({ attribute: 'mobile-label' }) mobileLabel = 'Menu'

  /** Whether the `mobile` button's list is showing. */
  @property({ type: Boolean, reflect: true, attribute: 'mobile-open' }) mobileOpen = false

  @query('.bar') private bar?: HTMLElement

  @query('.mobile-trigger') private defaultMobileTrigger?: HTMLElement

  @query('slot:not([name])') private itemSlot?: HTMLSlotElement

  @state() private slottedMobileTrigger: HTMLElement | null = null

  private mediaQuery?: MediaQueryList

  private openTimer: ReturnType<typeof setTimeout> | undefined
  private closeTimer: ReturnType<typeof setTimeout> | undefined

  /** Whether the document-level dismissal listeners are attached; they only run while a panel is open. */
  private dismissing = false

  /** Whether the navigation is in its mobile form: one button, and a hierarchy list behind it. */
  get mobile(): boolean {
    return this.mode === 'mobile'
  }

  /** Slotted items, in DOM order. */
  get items(): NavigationMenuItem[] {
    return (this.itemSlot?.assignedElements({ flatten: true }) ?? [])
      .map((element) => (element instanceof NavigationMenuItem ? element : element.firstElementChild))
      .filter((element): element is NavigationMenuItem => element instanceof NavigationMenuItem)
  }

  private get enabledItems(): NavigationMenuItem[] {
    return this.items.filter((item) => !item.disabled)
  }

  /** The item whose panel is open, if any. */
  get openItem(): NavigationMenuItem | undefined {
    return this.value ? this.items.find((item) => item.value === this.value) : undefined
  }

  override connectedCallback() {
    super.connectedCallback()
    this.watchBreakpoint()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.clearTimers()
    this.listenForDismiss(false)
    this.mediaQuery?.removeEventListener('change', this.handleBreakpointChange)
    this.mediaQuery = undefined
  }

  /** Follows `mobile-breakpoint`, when there is one, by driving `mode` from a media query. */
  private watchBreakpoint() {
    this.mediaQuery?.removeEventListener('change', this.handleBreakpointChange)
    this.mediaQuery = undefined
    if (this.mobileBreakpoint <= 0 || typeof matchMedia === 'undefined') return
    this.mediaQuery = matchMedia(`(max-width: ${this.mobileBreakpoint}px)`)
    this.mediaQuery.addEventListener('change', this.handleBreakpointChange)
    this.mode = this.mediaQuery.matches ? 'mobile' : 'bar'
  }

  private handleBreakpointChange = (event: MediaQueryListEvent) => {
    this.mode = event.matches ? 'mobile' : 'bar'
  }

  /** Opens the panel of `value` (`''` closes the bar) and fires `value-change`. */
  open(value: string): void {
    this.clearTimers()
    this.setValue(value)
  }

  close(): void {
    this.open('')
  }

  private setValue(value: string) {
    if (this.value === value) return
    this.value = value
    this.dispatchEvent(new CustomEvent<ValueChangeEventDetail>('value-change', { bubbles: true, composed: true, detail: { value } }))
  }

  private clearTimers() {
    clearTimeout(this.openTimer)
    clearTimeout(this.closeTimer)
    this.openTimer = undefined
    this.closeTimer = undefined
  }

  /**
   * The panels are manual popovers, so the bar dismisses them itself: a press anywhere outside it closes the open
   * panel or the mobile list, and Escape does too, wherever the focus happens to be.
   */
  private listenForDismiss(active: boolean) {
    if (active === this.dismissing) return
    this.dismissing = active
    if (active) {
      document.addEventListener('pointerdown', this.handleDocumentPointerDown, true)
      document.addEventListener('keydown', this.handleDocumentKeydown, true)
    } else {
      document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true)
      document.removeEventListener('keydown', this.handleDocumentKeydown, true)
    }
  }

  private handleDocumentPointerDown = (event: Event) => {
    // Everything that belongs to the bar — the items, their panels and the mobile list — is inside this host.
    if (event.composedPath().includes(this)) return
    if (!this.mobile) this.open('')
    this.toggleMobile(false)
  }

  private handleDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    const restore = !this.focusIsElsewhere(event)
    if (this.mobileOpen) {
      this.toggleMobile(false)
      if (restore) this.mobileTrigger?.focus()
      return
    }
    if (!this.value) return
    const item = this.openItem
    this.open('')
    if (restore) item?.focus()
  }

  /**
   * Whether the focus sits on a real control outside this navigation, in which case Escape must leave it alone.
   * WebKit does not focus a button that was clicked, so "not inside" on its own would lose the place too often.
   */
  private focusIsElsewhere(event: Event): boolean {
    if (event.composedPath().includes(this)) return false
    let active: Element | null = document.activeElement
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
    return !!active && active !== document.body && active !== document.documentElement
  }

  /** Mirrors `value` onto the items and hands each one the element its panel is anchored to. */
  private syncItems() {
    const items = this.items
    items.forEach((item, index) => {
      // A panel needs a value to be addressable, and an item's `hasPanel` is only known after it has rendered, so
      // every item that comes without one falls back to its position in the bar.
      if (!item.value) item.value = `item-${index + 1}`
      item.mobile = this.mobile
      item.collapsible = this.collapsible
      item.panelAnchorElement = this.panelAnchor === 'menu' ? (this.bar ?? null) : null
      // `expanded` means one thing everywhere: this item's panel is the open one. A flat mobile list has no open
      // item — every group is simply listed — so nothing there is expanded, and the rows stay plain until hovered.
      item.expanded = !!item.value && item.value === this.value
    })
  }

  /**
   * Whether the event came from the item's panel rather than from the item itself. The label and the slotted icons
   * are light-DOM children too, so `event.target` alone does not tell the two apart.
   */
  private inPanelOf(item: NavigationMenuItem, event: Event): boolean {
    const target = event.target
    return target instanceof Node && target !== item && item.panelContains(target)
  }

  /** The group the current page belongs to, so a collapsible list opens on the section the visitor is in. */
  private currentGroupValue(): string {
    return this.items.find((item) => item.hasPanel && (item.currentGroup || item.current))?.value ?? ''
  }

  private itemFromEvent(event: Event): NavigationMenuItem | undefined {
    const target = event.target
    if (!(target instanceof Element)) return undefined
    const item = target instanceof NavigationMenuItem ? target : (target.closest('c2-navigation-menu-item') ?? undefined)
    return item && this.items.includes(item) ? item : undefined
  }

  private scheduleOpen(item: NavigationMenuItem) {
    this.clearTimers()
    if (!item.hasPanel || item.disabled) {
      // Moving onto a plain link closes whatever was open, with the same grace period.
      if (this.value) this.scheduleClose()
      return
    }
    if (this.value) {
      this.setValue(item.value)
      return
    }
    this.openTimer = setTimeout(() => this.setValue(item.value), Math.max(0, this.openDelay))
  }

  private scheduleClose() {
    this.clearTimers()
    this.closeTimer = setTimeout(() => this.setValue(''), Math.max(0, this.closeDelay))
  }

  private handlePointerOver = (event: Event) => {
    if (this.mobile || this.openOn !== 'hover' || (event as PointerEvent).pointerType === 'touch') return
    const item = this.itemFromEvent(event)
    if (!item) return
    // Hovering inside an open panel keeps it open; only the items themselves drive the hover state.
    if (this.inPanelOf(item, event)) {
      this.clearTimers()
      return
    }
    this.scheduleOpen(item)
  }

  private handlePointerLeave = () => {
    if (this.openOn !== 'hover' || !this.value) return
    this.scheduleClose()
  }

  private handleClick = (event: Event) => {
    const item = this.itemFromEvent(event)
    this.clearTimers()
    if (!item) return
    if (this.mobile) {
      // A heading toggles its group when the list is collapsible, and does nothing when every group is listed.
      if (item.hasPanel && !this.inPanelOf(item, event)) {
        if (this.collapsible && !item.disabled) {
          event.preventDefault()
          this.setValue(item.expanded ? '' : item.value)
        }
        return
      }
      // Any other row is a link: let it navigate and put the list away.
      this.toggleMobile(false)
      return
    }
    if (this.inPanelOf(item, event)) {
      // A click on a link inside a panel navigates; the bar just gets out of the way.
      this.setValue('')
      return
    }
    if (item.disabled || !item.hasPanel) return
    event.preventDefault()
    // In hover mode the pointer is already on the item, so a click commits the panel rather than toggling it:
    // closing here would race the hover delay and the very next pointer move would reopen the panel anyway.
    this.setValue(this.openOn === 'hover' || !item.expanded ? item.value : '')
  }

  /** Opens or closes the list behind the mobile button. */
  private toggleMobile(open = !this.mobileOpen) {
    this.mobileOpen = open
  }

  private handleMobileTriggerClick = (event: Event) => {
    event.preventDefault()
    this.toggleMobile()
  }

  private handleMobileOverlayToggle = (event: Event) => {
    this.mobileOpen = (event as ToggleEvent).newState === 'open'
  }

  /** The button the mobile list hangs from: the slotted one when there is one, otherwise the default. */
  get mobileTrigger(): HTMLElement | null {
    return this.slottedMobileTrigger ?? this.defaultMobileTrigger ?? null
  }

  private handleMobileTriggerSlotChange = (event: Event) => {
    const assigned = (event.target as HTMLSlotElement).assignedElements({ flatten: true })
    this.slottedMobileTrigger = (assigned.find((element): element is HTMLElement => element instanceof HTMLElement) ?? null) as HTMLElement | null
  }

  private handlePanelToggle = (event: Event) => {
    const detail = (event as CustomEvent<PanelToggleEventDetail>).detail
    // The browser closes a popover on Escape, on an outside click, and when another popover opens.
    if (!detail.open && this.value === detail.value) {
      this.clearTimers()
      this.setValue('')
    }
  }

  private moveFocus(from: NavigationMenuItem, delta: number) {
    const enabled = this.enabledItems
    const index = enabled.indexOf(from)
    if (index === -1 || enabled.length === 0) return
    const next = enabled[(index + delta + enabled.length) % enabled.length]
    next.focus()
    // Arrowing along the bar while a panel is open keeps browsing panels, as hovering does.
    if (this.value) this.setValue(next.hasPanel ? next.value : '')
  }

  private handleKeydown = (event: KeyboardEvent) => {
    // In mobile mode the list is a column of links and group buttons: Tab walks it and Escape closes it.
    if (this.mobile) return
    const item = this.itemFromEvent(event)
    if (!item) return
    const onTrigger = !this.inPanelOf(item, event)

    if (!onTrigger) return

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        this.moveFocus(item, 1)
        return
      case 'ArrowLeft':
        event.preventDefault()
        this.moveFocus(item, -1)
        return
      case 'Home':
        event.preventDefault()
        this.enabledItems[0]?.focus()
        return
      case 'End': {
        event.preventDefault()
        const enabled = this.enabledItems
        enabled[enabled.length - 1]?.focus()
        return
      }
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        if (!item.hasPanel || item.disabled) return
        event.preventDefault()
        this.open(item.value)
        void this.focusPanelOf(item)
        return
    }
  }

  /** Waits for the panel to be shown before moving focus into it. */
  private async focusPanelOf(item: NavigationMenuItem) {
    await item.updateComplete
    item.focusPanel()
  }

  private handleSlotChange = () => {
    this.syncItems()
  }

  protected override willUpdate(changed: PropertyValues): void {
    // Re-point the media query in the same update, so `mode` lands with everything else rather than after it.
    if (changed.has('mobileBreakpoint')) this.watchBreakpoint()
  }

  protected override firstUpdated(): void {
    this.syncItems()
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has('value') || changed.has('panelAnchor') || changed.has('mode') || changed.has('collapsible')) this.syncItems()
    // Switching layouts starts over: nothing is open in either of them.
    if (changed.has('mode') || changed.has('collapsible')) {
      if (!this.mobile) this.toggleMobile(false)
      this.value = ''
    }
    // Opening the list picks the section the visitor is in, unless a group was already chosen.
    if (changed.has('mobileOpen') && this.mobileOpen && this.collapsible && !this.value) this.value = this.currentGroupValue()
    if (changed.has('value') || changed.has('mobileOpen')) this.listenForDismiss(!!this.value || this.mobileOpen)
  }

  private renderMobileIcon() {
    return svg`<svg class="mobile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>`
  }

  private renderBar() {
    return html`<div
      class="bar"
      role="list"
      @pointerover=${this.handlePointerOver}
      @pointerleave=${this.handlePointerLeave}
      @click=${this.handleClick}
      @keydown=${this.handleKeydown}
      @panel-toggle=${this.handlePanelToggle}
    >
      <slot @slotchange=${this.handleSlotChange}></slot>
    </div>`
  }

  /** The mobile button and, behind it, the whole navigation as one hierarchy. */
  private renderMobile() {
    return html`<div class="mobile" @click=${this.handleClick}>
      <slot name="mobile-trigger" @slotchange=${this.handleMobileTriggerSlotChange} @click=${this.handleMobileTriggerClick}>
        ${
          this.slottedMobileTrigger
            ? nothing
            : html`<button
                type="button"
                class="mobile-trigger"
                id="mobile-trigger"
                aria-label=${this.mobileLabel}
                aria-expanded=${this.mobileOpen ? 'true' : 'false'}
                aria-controls="mobile-panel"
              >
                ${this.renderMobileIcon()}
              </button>`
        }
      </slot>
      ${html`<c2-overlay
        id="mobile-overlay"
        popover="manual"
        placement="bottom-end"
        free-width
        .anchor=${this.slottedMobileTrigger ?? 'mobile-trigger'}
        .open=${this.mobileOpen}
        @toggle=${this.handleMobileOverlayToggle}
      >
        <div class="mobile-panel" id="mobile-panel" role="list">
          <slot @slotchange=${this.handleSlotChange}></slot>
        </div>
      </c2-overlay>`}
    </div>`
  }

  override render() {
    return html`<nav class="c2-navigation-menu" aria-label=${this.ariaLabel || nothing}>${this.mobile ? this.renderMobile() : this.renderBar()}</nav>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-navigation-menu': NavigationMenu
  }
}
