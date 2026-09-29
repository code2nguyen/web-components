import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { isServer } from 'lit-html/is-server.js'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import { requestContextMenuData } from '@c2n/core/context-menu-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { Menu, type MenuSelectEventDetail } from '@c2n/menu'
import styles from './context-menu.scss?inline'

import '@c2n/menu'

export { CONTEXT_MENU_REQUEST_EVENT, provideContextMenuData, type ContextMenuRequestDetail } from '@c2n/core/context-menu-helper.js'

/** How a menu was asked for: a secondary click, a long press on a touch screen, the keyboard, or `show()`. */
export type ContextMenuTrigger = 'pointer' | 'touch' | 'keyboard' | 'api'

/** Everything known about the place a context menu was opened on, handed to `renderContextMenu` and to the events. */
export interface ContextMenuContext<T = unknown> {
  /** The innermost element under the pointer, inside shadow roots included (a table cell, a chart's canvas, …). */
  target: Element
  /** What `target` stands for, as answered by the component that owns it (`c2-table` answers with the cell). */
  data: T | undefined
  /** The component that supplied `data`, or `null` when none did. */
  source: Element | null
  /** Viewport coordinates the menu opens at. */
  x: number
  y: number
  trigger: ContextMenuTrigger
  /** The event that opened the menu; `undefined` for `show()`. */
  originalEvent: Event | undefined
}

/**
 * Returns the rows of the menu for one context: `c2-menu-item`s, `<hr>` separators and `<h1>`–`<h6>` headings, as a
 * Lit template, a DOM node or an array of them. Return `null`, `undefined` or `nothing` to fall back to the menu
 * slotted into `menu`, or to let the browser show its own menu when there is none.
 */
export type ContextMenuRenderer = (context: ContextMenuContext) => unknown

export interface ContextMenuSelectEventDetail extends MenuSelectEventDetail {
  /** The context the menu was opened on. */
  context: ContextMenuContext
}

/** Events fired by {@link ContextMenu}, keyed for `addEventListener`. */
export interface ContextMenuEventMap {
  'context-menu-open': CustomEvent<ContextMenuContext>
  'context-menu-select': CustomEvent<ContextMenuSelectEventDetail>
  toggle: ToggleEvent
}

export interface ContextMenu {
  addEventListener: TypedAddEventListener<ContextMenu, ContextMenuEventMap>
  removeEventListener: TypedRemoveEventListener<ContextMenu, ContextMenuEventMap>
}

/** How far a finger may drift during a long press before it counts as a scroll instead. */
const LONG_PRESS_SLOP = 10

/** How long after opening a menu a second, native request for the same gesture is swallowed. */
const DUPLICATE_WINDOW = 800

type Request = Omit<ContextMenuContext, 'data' | 'source'>

function deepActiveElement(): HTMLElement | null {
  let active: Element | null = document.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return active instanceof HTMLElement ? active : null
}

/**
 * Shows a menu where its content is right-clicked, long-pressed on a touch screen, or asked for with the keyboard's
 * context-menu key or Shift+F10. Wrap the area in `c2-context-menu`: only its default-slot children open the menu,
 * never the menu itself. The element adds no box of its own (`display: contents`), so it can wrap a table cell grid,
 * a canvas or a whole panel without changing the layout.
 *
 * The menu is a `c2-menu` positioned at the pointer, with its keyboard support, submenus and checkable rows. Give it
 * either way, or both:
 *
 * - **Static:** a `c2-menu` slotted into `menu`, the same menu wherever the area is clicked (zoom in, zoom out, reset).
 * - **Dynamic:** a `renderContextMenu` function, called on every opening with the {@link ContextMenuContext}, which
 *   returns the rows for that spot. When it returns nothing, the slotted menu is used; when there is neither, the
 *   browser shows its own menu.
 *
 * `context.data` is what the clicked spot stands for. Before opening, the element dispatches the composed
 * `c2-context-menu-request` event on the node under the pointer, and a component that owns that node answers it
 * through `provideContextMenuData` from `@c2n/core/context-menu-helper.js`. `c2-table` answers with the cell
 * (`row`, `rowIndex`, `key`, `column`, `value`), so a table wrapped in a context menu gets per-cell menus with no
 * wiring. For plain markup, read `context.target` (`target.closest('[data-id]')`).
 *
 * A nested `c2-context-menu` wins over the one around it, and so does any handler that already called
 * `preventDefault()` on the `contextmenu` event. Set `disabled` to let the browser's own menu through.
 *
 * Style the surface through the `--c2-menu--*` variables, set on this element or anywhere above it.
 *
 * @tag c2-context-menu
 *
 * @slot default - The area that opens the menu.
 * @slot menu - A `c2-menu` shown when `renderContextMenu` is not set or returns nothing.
 *
 * @event {CustomEvent<ContextMenuContext>} context-menu-open - Fired before the menu opens, with the context as `detail`. Cancelable: `preventDefault()` keeps the menu closed and lets the browser's menu show.
 * @event {CustomEvent<ContextMenuSelectEventDetail>} context-menu-select - Fired when a row is activated: the row's `value`, `checked` and `data`, plus the `context` the menu was opened on. The row's own `menu-select` still bubbles as well.
 * @event {ToggleEvent} toggle - Fired after the menu opens or closes; `newState` is `open` or `closed`.
 *
 * @internalcomponent c2-menu
 *
 * @slotcomponent c2-menu
 */
@customElement('c2-context-menu')
export class ContextMenu extends LitElement {
  static override styles = unsafeCSS(styles)

  /**
   * Returns the rows for the spot that was clicked. Called on every opening; see {@link ContextMenuRenderer}. A property
   * only, since it holds a function.
   */
  @property({ attribute: false }) renderContextMenu: ContextMenuRenderer | undefined = undefined

  /** Ignores right clicks and long presses, so the browser shows its own menu. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** How long, in milliseconds, a finger or pen must rest before the menu opens. */
  @property({ type: Number, attribute: 'long-press-duration' }) longPressDuration = 500

  /** Accessible name of a menu built by `renderContextMenu`. A slotted menu takes its own `aria-label`. */
  @property({ attribute: 'menu-label' }) menuLabel = ''

  @query('.anchor') private anchorElement?: HTMLElement

  @query('.menu') private internalMenu?: Menu

  @query('slot[name="menu"]') private menuSlot?: HTMLSlotElement

  /** Rows returned by `renderContextMenu` for the current opening. */
  @state() private dynamicContent: unknown = nothing

  private activeMenu: Menu | null = null

  private currentContext: ContextMenuContext | null = null

  private isOpen = false

  /** Where focus was before the menu took it, restored when the menu closes. */
  private returnFocusTo: HTMLElement | null = null

  /** Menus slotted into `menu` that carry our `toggle` listener. */
  private listenedMenus = new Set<Menu>()

  private longPress: { timer: ReturnType<typeof setTimeout>; pointerId: number; x: number; y: number } | undefined

  /** A long press opened the menu, so the click the lifted finger produces must not reach the content. */
  private suppressClick = false

  /** When the last menu opened, and how: a native `contextmenu` for the same gesture right after is a duplicate. */
  private lastOpen: { time: number; trigger: ContextMenuTrigger } | undefined

  /** An opening is under way; a `closed` toggle from the menu it is reopening is not the end of the menu. */
  private presenting = false

  /** Incremented per opening, so a slower earlier opening never shows after a later one. */
  private generation = 0

  constructor() {
    super()
    if (!isServer) {
      this.addEventListener('contextmenu', this.handleContextMenu)
      this.addEventListener('keydown', this.handleKeydown)
      this.addEventListener('pointerdown', this.handlePointerDown)
      this.addEventListener('click', this.handleClickCapture, { capture: true })
      this.addEventListener('menu-select', this.handleMenuSelect)
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.cancelLongPress()
    this.hide()
    for (const menu of this.listenedMenus) menu.removeEventListener('toggle', this.handleMenuToggle)
    this.listenedMenus.clear()
    this.dynamicContent = nothing
  }

  /** Whether the menu is showing. */
  get open(): boolean {
    return this.isOpen
  }

  /** The context of the menu that is showing, or of the last one shown. */
  get context(): ContextMenuContext | null {
    return this.currentContext
  }

  /** The `c2-menu` slotted into `menu`, if any. */
  get staticMenu(): Menu | null {
    return (this.menuSlot?.assignedElements({ flatten: true }).find((element) => element instanceof Menu) as Menu | undefined) ?? null
  }

  /**
   * Opens the menu at viewport coordinates `x`, `y`. `target` is the element the context is about (this element by
   * default); it is also where the data request is dispatched. Returns whether a menu opened.
   */
  show(x: number, y: number, target: Element = this): boolean {
    return this.openAt({ x, y, target, trigger: 'api', originalEvent: undefined })
  }

  hide(): void {
    this.cancelLongPress()
    this.activeMenu?.hide()
  }

  /** The light-DOM child of this element an event came through, when it belongs to the area (not the menu). */
  private areaChild(event: Event): Element | null {
    const path = event.composedPath()
    const child = path.slice(0, path.indexOf(this)).find((node): node is Element => node instanceof Element && node.parentNode === this)
    return child && !child.slot ? child : null
  }

  /**
   * Whether the event came from one of the menus, which get no browser menu on top of them. A slotted child's path
   * runs through this element's slot and shadow root too, so the internal menu is tested for, not the shadow root.
   */
  private fromMenu(event: Event): boolean {
    const path = event.composedPath()
    const end = path.indexOf(this)
    return path.slice(0, end).some((node) => node === this.internalMenu || (node instanceof Element && node.parentNode === this && node.slot === 'menu'))
  }

  private static innermostElement(event: Event): Element | null {
    return (event.composedPath().find((node) => node instanceof Element) as Element | undefined) ?? null
  }

  private handleContextMenu = (event: MouseEvent) => {
    if (this.fromMenu(event)) {
      event.preventDefault()
      return
    }
    if (this.disabled || event.defaultPrevented || !this.areaChild(event)) return

    // The same gesture already opened the menu: a long press that the browser also reports, or a keyboard request.
    if ((this.lastOpen?.trigger === 'touch' || this.lastOpen?.trigger === 'keyboard') && performance.now() - this.lastOpen.time < DUPLICATE_WINDOW) {
      event.preventDefault()
      return
    }
    const target = ContextMenu.innermostElement(event)
    if (!target) return
    const touch = this.longPress !== undefined || (event as PointerEvent).pointerType === 'touch' || (event as PointerEvent).pointerType === 'pen'
    this.cancelLongPress()
    if (touch) this.suppressClick = true
    if (this.openAt({ x: event.clientX, y: event.clientY, target, trigger: touch ? 'touch' : 'pointer', originalEvent: event })) event.preventDefault()
  }

  private handleKeydown = (event: KeyboardEvent) => {
    const contextKey = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey)
    if (!contextKey || this.disabled || event.defaultPrevented || !this.areaChild(event)) return
    const target = ContextMenu.innermostElement(event)
    if (!target) return
    const rect = target.getBoundingClientRect()
    if (this.openAt({ x: rect.left, y: rect.bottom, target, trigger: 'keyboard', originalEvent: event })) event.preventDefault()
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.suppressClick = false
    if (this.disabled || !event.isPrimary || (event.pointerType !== 'touch' && event.pointerType !== 'pen') || !this.areaChild(event)) return
    const target = ContextMenu.innermostElement(event)
    if (!target) return
    this.cancelLongPress()
    const { clientX: x, clientY: y, pointerId } = event
    const timer = setTimeout(() => {
      this.cancelLongPress()
      if (this.openAt({ x, y, target, trigger: 'touch', originalEvent: event })) this.suppressClick = true
    }, this.longPressDuration)
    this.longPress = { timer, pointerId, x, y }
    window.addEventListener('pointermove', this.handleLongPressMove, true)
    window.addEventListener('pointerup', this.handleLongPressEnd, true)
    window.addEventListener('pointercancel', this.handleLongPressEnd, true)
    window.addEventListener('scroll', this.handleLongPressEnd, true)
  }

  private handleLongPressMove = (event: PointerEvent) => {
    if (!this.longPress || event.pointerId !== this.longPress.pointerId) return
    if (Math.hypot(event.clientX - this.longPress.x, event.clientY - this.longPress.y) > LONG_PRESS_SLOP) this.cancelLongPress()
  }

  private handleLongPressEnd = (event: Event) => {
    if (event instanceof PointerEvent && this.longPress && event.pointerId !== this.longPress.pointerId) return
    this.cancelLongPress()
  }

  private cancelLongPress() {
    if (!this.longPress) return
    clearTimeout(this.longPress.timer)
    this.longPress = undefined
    window.removeEventListener('pointermove', this.handleLongPressMove, true)
    window.removeEventListener('pointerup', this.handleLongPressEnd, true)
    window.removeEventListener('pointercancel', this.handleLongPressEnd, true)
    window.removeEventListener('scroll', this.handleLongPressEnd, true)
  }

  /** The finger that long-pressed lifts with a click; it opened the menu and must not also activate the content. */
  private handleClickCapture = (event: MouseEvent) => {
    if (!this.suppressClick || !this.areaChild(event)) return
    this.suppressClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  private openAt(request: Request): boolean {
    const answer = requestContextMenuData(request.target)
    const context: ContextMenuContext = { ...request, data: answer.data, source: answer.source }

    const rendered = this.renderContextMenu?.(context)
    const dynamic = rendered !== undefined && rendered !== null && rendered !== nothing && rendered !== false
    const menu = dynamic ? this.internalMenu : this.staticMenu
    if (!menu) return false

    const allowed = this.dispatchEvent(new CustomEvent<ContextMenuContext>('context-menu-open', { detail: context, cancelable: true }))
    if (!allowed) return false

    if (!this.isOpen) this.returnFocusTo = deepActiveElement()
    this.currentContext = context
    this.lastOpen = { time: performance.now(), trigger: context.trigger }
    if (dynamic) this.dynamicContent = rendered
    void this.present(menu, context)
    return true
  }

  private async present(menu: Menu, context: ContextMenuContext) {
    const generation = ++this.generation
    this.presenting = true
    const previous = this.activeMenu
    if (previous?.open) {
      previous.hide()
      await previous.updateComplete
    }
    // Render the rows first: the menu measures them and moves focus to the first one as it opens.
    await this.updateComplete
    if (generation !== this.generation) return

    this.placeAnchor(context.x, context.y)
    if (menu !== this.internalMenu) this.listenTo(menu)
    if (menu.offset === undefined) menu.offset = 0
    menu.anchor = this.anchorElement
    this.activeMenu = menu
    menu.show('first')
    this.presenting = false
  }

  /**
   * Moves the zero-size anchor under the pointer. `position: fixed` resolves against a transformed ancestor instead of
   * the viewport, so measure where it landed and correct by the difference.
   */
  private placeAnchor(x: number, y: number) {
    const anchor = this.anchorElement
    if (!anchor) return
    anchor.style.left = `${x}px`
    anchor.style.top = `${y}px`
    const rect = anchor.getBoundingClientRect()
    if (rect.left !== x || rect.top !== y) {
      anchor.style.left = `${2 * x - rect.left}px`
      anchor.style.top = `${2 * y - rect.top}px`
    }
  }

  private listenTo(menu: Menu) {
    if (this.listenedMenus.has(menu)) return
    menu.addEventListener('toggle', this.handleMenuToggle)
    this.listenedMenus.add(menu)
  }

  private handleMenuToggle = (event: Event) => {
    if (event.target !== this.activeMenu) return
    const opened = (event as ToggleEvent).newState === 'open'
    if (!opened && this.presenting) return
    // A menu reopened elsewhere closes and opens again; only the final state is news.
    if (opened === this.isOpen) return
    this.isOpen = opened
    if (!opened) this.restoreFocus()
    redispatchEvent(this, event)
  }

  /** The menu hands focus back to its anchor, which is a point, not a control: return it to where it was instead. */
  private restoreFocus() {
    const previous = this.returnFocusTo
    this.returnFocusTo = null
    if (!previous?.isConnected) return
    const active = deepActiveElement()
    const lost = !active || active === document.body || !!this.activeMenu?.contains(active) || !!this.activeMenu?.shadowRoot?.contains(active)
    if (lost || this.renderRoot.contains(active)) previous.focus({ preventScroll: true })
  }

  private handleMenuSelect = (event: Event) => {
    const menu = this.activeMenu
    if (!menu || !this.currentContext || !event.composedPath().includes(menu)) return
    const detail = (event as CustomEvent<MenuSelectEventDetail>).detail
    this.dispatchEvent(new CustomEvent<ContextMenuSelectEventDetail>('context-menu-select', { detail: { ...detail, context: this.currentContext } }))
  }

  private handleMenuSlotChange = () => {
    const menu = this.staticMenu
    if (menu) this.listenTo(menu)
  }

  override render() {
    return html`<slot></slot>
      <slot name="menu" @slotchange=${this.handleMenuSlotChange}></slot>
      <span class="anchor"></span>
      <c2-menu class="menu" offset="0" aria-label=${this.menuLabel || nothing} @toggle=${this.handleMenuToggle}>${this.dynamicContent}</c2-menu>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-context-menu': ContextMenu
  }
}
