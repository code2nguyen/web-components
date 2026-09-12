import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { isServer } from 'lit-html/is-server.js'
import { customElement, property, query, state } from 'lit/decorators.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import type { Overlay, Placement } from '@c2n/overlay'
import styles from './menu.scss?inline'
import { MenuItem } from './menu-item'

import '@c2n/overlay'
import './menu-item'

export type { Placement }
export type { MenuItemType, MenuSelectEventDetail } from './menu-item'

/**
 * A menu of commands anchored to a trigger. The trigger is slotted into `trigger` (a `c2-button`, a `c2-icon-button`,
 * a plain `<button>`, …) or named by `anchor`; the rows are `c2-menu-item` children, with `<hr>` separators and
 * `<h1>`–`<h6>` group headings between them. The surface is a native popover on the top layer positioned by
 * `c2-overlay`, so it flips near the viewport edge, light-dismisses on Escape and outside clicks, and is never clipped
 * by an `overflow: hidden` parent.
 *
 * Keyboard: the trigger opens the menu with Enter, Space or ArrowDown (ArrowUp opens it on the last row). Inside,
 * Arrow Up/Down move between enabled rows, Home/End jump to the first/last, typing letters jumps to a matching row,
 * Enter and Space activate, ArrowRight opens a submenu, ArrowLeft returns to its parent row, and Escape or Tab closes
 * the menu and returns focus to the trigger.
 *
 * Activating a row fires `menu-select` and closes the menu; `keep-open` on the menu (or on a single row) leaves it
 * open, which is what a list of `checkbox` rows wants.
 *
 * The surface is as wide as its rows, never narrower than `--c2-menu--min-width` and, when the menu owns its trigger,
 * never narrower than that trigger either. `fit-anchor` pins it to exactly the trigger's width instead.
 *
 * @tag c2-menu
 *
 * @slot default - The rows: `c2-menu-item` elements, plus `<hr>` separators and `<h1>`–`<h6>` group headings.
 * @slot trigger - The element that opens the menu. Omit it and point `anchor` at an element elsewhere on the page.
 *
 * @event {CustomEvent<MenuSelectEventDetail>} menu-select - Bubbles from the activated row: `detail.value`, `detail.checked` and `detail.data` of that row.
 * @event {ToggleEvent} toggle - Fired after the menu opens or closes; `newState` is `open` or `closed`.
 *
 * @cssproperty {color} [--c2-menu--background=#ffffff]
 * @cssproperty {pixel} [--c2-menu--min-width=128px] - Floor for the surface, which is otherwise as wide as its content (and never narrower than a slotted trigger).
 * @cssproperty {pixel} [--c2-menu--max-height=320px] - The menu scrolls past this height.
 *
 * @cssproperty {border} [--c2-menu--border-top=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-menu--border-right=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-menu--border-bottom=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-menu--border-left=1px solid #e4e4e7]
 *
 * @cssproperty {border-radius} [--c2-menu--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-menu--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-menu--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-menu--border-bottom-right-radius=8px]
 *
 * @cssproperty {box-shadow} [--c2-menu--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 *
 * @cssproperty {padding} [--c2-menu--padding-top=4px]
 * @cssproperty {padding} [--c2-menu--padding-right=4px]
 * @cssproperty {padding} [--c2-menu--padding-bottom=4px]
 * @cssproperty {padding} [--c2-menu--padding-left=4px]
 *
 * @cssproperty {pixel} --c2-menu--gap - Space between the rows.
 *
 * @cssproperty {color} [--c2-menu__separator--color=#e4e4e7]
 * @cssproperty {margin} [--c2-menu__separator--margin=4px 0]
 *
 * @cssproperty {color} [--c2-menu__heading--color=#71717a]
 * @cssproperty {font-size} [--c2-menu__heading--font-size=11px]
 * @cssproperty {font-weight} [--c2-menu__heading--font-weight=600]
 * @cssproperty {letter-spacing} [--c2-menu__heading--letter-spacing=0.06em]
 * @cssproperty {text-transform} [--c2-menu__heading--text-transform=uppercase]
 * @cssproperty {padding} [--c2-menu__heading--padding-top=8px]
 * @cssproperty {padding} [--c2-menu__heading--padding-right=8px]
 * @cssproperty {padding} [--c2-menu__heading--padding-bottom=4px]
 * @cssproperty {padding} [--c2-menu__heading--padding-left=8px]
 *
 * @internalcomponent c2-overlay
 *
 * @slotcomponent c2-menu-item
 */
@customElement('c2-menu')
export class Menu extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Whether the menu is showing. Set it to open or close the menu from code. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Preferred placement of the surface (floating-ui names). Submenus default to `right-start`. */
  @property({ reflect: true }) placement: Placement = 'bottom-start'

  /** Anchor element, or (attribute) the id of an element in the same tree. Defaults to the slotted trigger. */
  @property() anchor: string | HTMLElement | undefined = undefined

  /** Make the surface exactly as wide as the anchor instead of as wide as its content. */
  @property({ type: Boolean, attribute: 'fit-anchor' }) fitAnchor = false

  /** Keep the menu open after a row is activated. Also available per row as `keep-open`. */
  @property({ type: Boolean, attribute: 'keep-open' }) keepOpen = false

  /** Ignores the trigger and never opens. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Accessible name of the surface. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  @query('#overlay') private overlay?: Overlay

  @query('slot[name="trigger"]') private triggerSlot?: HTMLSlotElement

  @query('slot:not([name])') private itemSlot?: HTMLSlotElement

  @state() private anchorElement: HTMLElement | null = null

  /** Whether something is slotted into `trigger`; a menu opened from one is never narrower than it. */
  @state() private hasTrigger = false

  /** The row that holds the roving `tabindex`. */
  private focusedItem: MenuItem | undefined = undefined

  /** Which row to focus once the surface is open. */
  private pendingFocus: 'first' | 'last' | 'none' = 'first'

  private typeahead = ''
  private typeaheadTimer: ReturnType<typeof setTimeout> | undefined

  /** Open state at the pointerdown that started the current press on the trigger, see `handleTriggerPointerDown`. */
  private openBeforePress: boolean | undefined = undefined

  /** Slotted rows, in DOM order (separators and headings excluded). */
  get items(): MenuItem[] {
    return (this.itemSlot?.assignedElements({ flatten: true }) ?? [])
      .map((element) => (element instanceof MenuItem ? element : element.firstElementChild))
      .filter((element): element is MenuItem => element instanceof MenuItem)
  }

  private get enabledItems(): MenuItem[] {
    return this.items.filter((item) => !item.disabled)
  }

  /** The element that opens this menu: the slotted trigger, or the resolved `anchor`. */
  get triggerElement(): HTMLElement | null {
    const assigned = this.triggerSlot?.assignedElements({ flatten: true }) ?? []
    return (assigned.find((element): element is HTMLElement => element instanceof HTMLElement) ?? null) as HTMLElement | null
  }

  /** The row this menu is a submenu of, when it is slotted into a `c2-menu-item`. */
  get ownerItem(): MenuItem | null {
    return this.parentElement instanceof MenuItem ? this.parentElement : null
  }

  override connectedCallback() {
    super.connectedCallback()
    // A submenu opens beside its row, not under it.
    if (!isServer && this.getAttribute('slot') === 'submenu' && !this.hasAttribute('placement')) this.placement = 'right-start'
  }

  /** Opens the menu. Pass `'last'` to start on the last row, `'none'` to leave focus where it is. */
  show(focus: 'first' | 'last' | 'none' = 'first'): void {
    if (this.disabled) return
    this.pendingFocus = focus
    this.open = true
  }

  hide(): void {
    this.open = false
  }

  toggle(force?: boolean): void {
    const next = force ?? !this.open
    if (next) this.show()
    else this.hide()
  }

  /** Moves focus to the first enabled row. */
  focusFirstItem(): void {
    this.focusItem(this.enabledItems[0])
  }

  /** Moves focus to the last enabled row. */
  focusLastItem(): void {
    const enabled = this.enabledItems
    this.focusItem(enabled[enabled.length - 1])
  }

  private resolveAnchor(): HTMLElement | null {
    if (this.anchor instanceof HTMLElement) return this.anchor
    if (typeof this.anchor === 'string' && this.anchor) {
      const root = this.getRootNode() as Document | ShadowRoot
      return (root.querySelector?.(`#${CSS.escape(this.anchor)}`) as HTMLElement | null) ?? null
    }
    return this.triggerElement
  }

  private syncAnchor() {
    const resolved = this.resolveAnchor()
    if (resolved !== this.anchorElement) this.anchorElement = resolved
    this.hasTrigger = !!this.triggerElement
    this.toggleAttribute('has-trigger', this.hasTrigger)
    void this.syncTriggerAria()
  }

  /**
   * `aria-haspopup` / `aria-expanded` belong on the element that carries the button role. For a `c2-*` trigger that is
   * the control inside its shadow root, not the host, which is a plain generic element.
   */
  private async syncTriggerAria() {
    const trigger = this.triggerElement
    if (!trigger) return
    const element = trigger as HTMLElement & { updateComplete?: Promise<unknown> }
    if (element.updateComplete) await element.updateComplete
    const inner = trigger.localName.includes('-') ? trigger.shadowRoot?.querySelector<HTMLElement>('button, a, [role="button"]') : null
    const target = inner ?? trigger
    target.setAttribute('aria-haspopup', 'menu')
    target.setAttribute('aria-expanded', String(this.open))
  }

  private focusItem(item?: MenuItem) {
    if (!item) return
    this.focusedItem = item
    for (const other of this.items) other.tabIndex = other === item ? 0 : -1
    item.focus()
  }

  /** Assigns the roving `tabindex` and reserves the indicator column when any row is checkable. */
  private syncItems() {
    const items = this.items
    const enabled = this.enabledItems
    if (!this.focusedItem || !enabled.includes(this.focusedItem)) this.focusedItem = enabled[0]

    const checkable = items.some((item) => item.type !== 'item')
    for (const item of items) {
      item.reserveIndicator = checkable
      item.tabIndex = item === this.focusedItem ? 0 : -1
    }

    // Separators and headings are decoration: a `role="menu"` may only contain menu rows.
    for (const element of this.itemSlot?.assignedElements({ flatten: true }) ?? []) {
      if (/^h[1-6]$/.test(element.localName)) element.setAttribute('role', 'presentation')
    }
  }

  private openSubmenu(item: MenuItem, focus: 'first' | 'none') {
    const submenu = item.submenuElement
    if (!(submenu instanceof Menu) || item.disabled) return
    if (submenu.open) {
      if (focus === 'first') submenu.focusFirstItem()
      return
    }
    this.closeSubmenus(item)
    submenu.anchor = item
    item.expanded = true
    submenu.show(focus)
  }

  private closeSubmenus(except?: MenuItem) {
    for (const item of this.items) {
      if (item === except || !item.hasSubmenu) continue
      const submenu = item.submenuElement
      if (submenu instanceof Menu) submenu.hide()
      item.expanded = false
    }
  }

  private itemFromEvent(event: Event): MenuItem | undefined {
    const target = event.target
    if (!(target instanceof Element)) return undefined
    const item = target instanceof MenuItem ? target : (target.closest('c2-menu-item') ?? undefined)
    return item && this.items.includes(item) ? item : undefined
  }

  /**
   * The popover light-dismisses itself when the press lands outside it — the trigger included — so by the time the
   * click arrives the menu is already closed and a naive toggle would reopen it. Remember the state at pointerdown,
   * which runs before the dismissal, and toggle from that instead.
   */
  private handleTriggerPointerDown = () => {
    this.openBeforePress = this.open
  }

  private handleTriggerClick = (event: Event) => {
    const wasOpen = this.openBeforePress ?? this.open
    this.openBeforePress = undefined
    if (this.disabled) return
    event.preventDefault()
    if (wasOpen) this.hide()
    else this.show('first')
  }

  private handleTriggerKeydown = (event: KeyboardEvent) => {
    if (this.disabled) return
    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault()
        this.show('first')
        return
      case 'ArrowUp':
        event.preventDefault()
        this.show('last')
        return
    }
  }

  private handleItemClick = (event: Event) => {
    const item = this.itemFromEvent(event)
    if (!item || item.disabled) return
    if (item.hasSubmenu) this.openSubmenu(item, 'none')
  }

  /** Hovering a row highlights it and swaps which submenu is open, the way a desktop menu does. */
  private handlePointerOver = (event: Event) => {
    const item = this.itemFromEvent(event)
    if (!item) return
    if (!item.disabled && this.focusedItem !== item) {
      this.focusedItem = item
      for (const other of this.items) other.tabIndex = other === item ? 0 : -1
    }
    if (item.hasSubmenu && !item.disabled) this.openSubmenu(item, 'none')
    else this.closeSubmenus()
  }

  private handleKeydown = (event: KeyboardEvent) => {
    const enabled = this.enabledItems
    const current = this.itemFromEvent(event) ?? this.focusedItem
    const index = current ? enabled.indexOf(current) : -1

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        event.stopPropagation()
        this.focusItem(enabled[index + 1] ?? enabled[0])
        return
      case 'ArrowUp':
        event.preventDefault()
        event.stopPropagation()
        this.focusItem(index > 0 ? enabled[index - 1] : enabled[enabled.length - 1])
        return
      case 'Home':
        event.preventDefault()
        event.stopPropagation()
        this.focusItem(enabled[0])
        return
      case 'End':
        event.preventDefault()
        event.stopPropagation()
        this.focusItem(enabled[enabled.length - 1])
        return
      case 'ArrowRight':
        if (current?.hasSubmenu) {
          event.preventDefault()
          event.stopPropagation()
          this.openSubmenu(current, 'first')
        }
        return
      case 'ArrowLeft':
        if (this.ownerItem) {
          event.preventDefault()
          event.stopPropagation()
          this.hide()
          this.ownerItem.focus()
        }
        return
      case 'Enter':
      case ' ':
        if (!current) return
        event.preventDefault()
        event.stopPropagation()
        if (current.hasSubmenu) this.openSubmenu(current, 'first')
        else current.activate()
        return
      case 'Tab':
        event.preventDefault()
        event.stopPropagation()
        this.hide()
        return
    }

    // Typeahead: letters jump to the next row whose label starts with what was typed.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.stopPropagation()
      clearTimeout(this.typeaheadTimer)
      this.typeahead += event.key.toLowerCase()
      this.typeaheadTimer = setTimeout(() => (this.typeahead = ''), 600)
      const start = Math.max(this.typeahead.length === 1 ? index + 1 : index, 0)
      const ordered = [...enabled.slice(start), ...enabled.slice(0, start)]
      const match = ordered.find((item) => item.displayText.toLowerCase().startsWith(this.typeahead))
      if (match) this.focusItem(match)
    }
  }

  private handleMenuSelect = (event: Event) => {
    const source = event.target instanceof MenuItem ? event.target : undefined
    const own = source && this.items.includes(source) ? source : undefined

    if (own?.type === 'radio') {
      for (const item of this.items) {
        if (item !== own && item.type === 'radio' && item.name === own.name) item.checked = false
      }
    }

    if (this.keepOpen || source?.keepOpen) return
    this.hide()
  }

  private handleOverlayToggle = (event: Event) => {
    const isOpen = (event as ToggleEvent).newState === 'open'
    this.open = isOpen

    if (isOpen) {
      this.syncItems()
      if (this.pendingFocus === 'last') this.focusLastItem()
      else if (this.pendingFocus === 'first') this.focusFirstItem()
    } else {
      this.closeSubmenus()
      if (this.shouldReturnFocus()) this.returnFocus()
    }
    this.pendingFocus = 'first'
    void this.syncTriggerAria()
    redispatchEvent(this, event)
  }

  /**
   * Focus goes back to the trigger unless the dismissal handed it to a real control elsewhere — clicking a row leaves
   * the focus on that row in Chromium and WebKit but on the body in Firefox, and either way the trigger is where the
   * user was.
   */
  private shouldReturnFocus(): boolean {
    let active: Element | null = document.activeElement
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
    if (!active || active === document.body || active === document.documentElement) return true
    return this.items.some((item) => item === active || item.contains(active)) || !!this.overlay?.contains(active)
  }

  /** Focus goes back to the row that owns this submenu, or to the trigger. */
  private returnFocus() {
    const owner = this.ownerItem
    if (owner) {
      owner.focus()
      return
    }
    const trigger = this.triggerElement ?? (this.anchorElement as HTMLElement | null)
    trigger?.focus()
  }

  private handleSlotChange = () => {
    this.syncItems()
  }

  private handleTriggerSlotChange = () => {
    this.syncAnchor()
  }

  protected override firstUpdated(): void {
    this.syncAnchor()
    this.syncItems()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // The overlay needs its anchor in the same commit that opens it, so resolve it before rendering, not after.
    if (changed.has('anchor') && this.anchor) this.anchorElement = this.resolveAnchor()
    else if (!this.anchorElement) this.anchorElement = this.querySelector<HTMLElement>(':scope > [slot="trigger"]')
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('open') && this.ownerItem) this.ownerItem.expanded = this.open
    if (changed.has('disabled') && this.disabled) this.hide()
  }

  override render() {
    return html`<slot
        name="trigger"
        @slotchange=${this.handleTriggerSlotChange}
        @pointerdown=${this.handleTriggerPointerDown}
        @click=${this.handleTriggerClick}
        @keydown=${this.handleTriggerKeydown}
      ></slot>
      <c2-overlay
        id="overlay"
        class="overlay"
        .anchor=${this.anchorElement ?? undefined}
        .placement=${this.placement}
        .open=${this.open}
        ?fit-anchor=${this.fitAnchor}
        ?free-width=${!this.hasTrigger}
        @toggle=${this.handleOverlayToggle}
      >
        <div
          class="menu"
          role="menu"
          aria-orientation="vertical"
          aria-label=${this.ariaLabel || nothing}
          @click=${this.handleItemClick}
          @pointerover=${this.handlePointerOver}
          @keydown=${this.handleKeydown}
          @menu-select=${this.handleMenuSelect}
        >
          <slot @slotchange=${this.handleSlotChange}></slot>
        </div>
      </c2-overlay>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-menu': Menu
  }
}
