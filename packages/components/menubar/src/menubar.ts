import { LitElement, html, nothing, unsafeCSS, isServer } from 'lit'
import { query } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { MenuSelectEventDetail } from '@c2n/menu'
import { MenubarMenu } from './menubar-menu'
import styles from './menubar.scss?inline'

import './menubar-menu'

export { MenubarMenu }
export type { MenubarMenuFocus, MenubarMenuEventMap } from './menubar-menu'
export type { MenuSelectEventDetail }

/** Events fired by {@link Menubar}, keyed for `addEventListener`. */
export interface MenubarEventMap {
  'menu-select': CustomEvent<MenuSelectEventDetail>
}

export interface Menubar {
  addEventListener: TypedAddEventListener<Menubar, MenubarEventMap>
  removeEventListener: TypedRemoveEventListener<Menubar, MenubarEventMap>
}

/**
 * A desktop-style menu bar: File, Edit, View… as a row of `c2-menubar-menu` children, each a trigger and the
 * `c2-menu` it opens. The bar is one Tab stop; the arrow keys move across it, and once a menu is open, hovering
 * another trigger or pressing ArrowLeft/ArrowRight inside the menu moves the open menu with it, the way an
 * application's menu bar does (WAI-ARIA menubar pattern).
 *
 * Keyboard on a trigger: ArrowLeft/ArrowRight go to the previous/next menu (wrapping, mirrored right-to-left),
 * Home/End to the first/last, a letter to the next menu whose label starts with it; Enter, Space or ArrowDown open the
 * menu on its first row, ArrowUp on its last. Inside a menu, ArrowRight opens a submenu or, on a plain row, moves to
 * the next menu; ArrowLeft closes a submenu or, at the top level, moves to the previous menu; Escape closes the menu
 * and returns focus to its trigger.
 *
 * The `start` and `end` slots hold what sits beside the menus (an app icon, a document title, a "Saved" status); they
 * are outside the `menubar` role. Activated rows fire `menu-select`, which bubbles from the row through the bar.
 *
 * @tag c2-menubar
 *
 * @slot default - The menus: `c2-menubar-menu` elements.
 * @slot start - Content before the menus, outside the menubar role (a logo or app icon).
 * @slot end - Content after the menus, outside the menubar role (a title, status or actions).
 *
 * @csspart menus - The element with the `menubar` role that holds the menus.
 *
 * @event {CustomEvent<MenuSelectEventDetail>} menu-select - Bubbles from an activated row: `detail.value`, `detail.checked` and `detail.data` of that row.
 *
 * @cssproperty {pixel} [--c2-menubar--gap=8px] - Space between the start slot, the menus and the end slot.
 * @cssproperty {pixel} [--c2-menubar--menus-gap=2px] - Space between two triggers.
 * @cssproperty {color} [--c2-menubar--background-color=#ffffff]
 * @cssproperty {border} [--c2-menubar--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-menubar--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-menubar--box-shadow=none]
 * @cssproperty {padding} [--c2-menubar--padding-top=4px]
 * @cssproperty {padding} [--c2-menubar--padding-right=4px]
 * @cssproperty {padding} [--c2-menubar--padding-bottom=4px]
 * @cssproperty {padding} [--c2-menubar--padding-left=4px]
 *
 * @slotcomponent c2-menubar-menu
 */
@customElement('c2-menubar')
export class Menubar extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Accessible name of the menu bar ("Application", "Document"). */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  @query('slot:not([name])') private menuSlot?: HTMLSlotElement

  /** The menu whose trigger is the bar's Tab stop. */
  private activeMenu: MenubarMenu | undefined = undefined

  private typeahead = ''
  private typeaheadTimer: ReturnType<typeof setTimeout> | undefined

  /** The `c2-menubar-menu` children, in order. */
  get menus(): MenubarMenu[] {
    const assigned = this.menuSlot?.assignedElements({ flatten: true }) ?? [...this.children]
    // A framework may wrap each menu in an element of its own (an Astro island), as c2-menu allows for its rows.
    return assigned
      .map((element) => (element instanceof MenubarMenu ? element : element.firstElementChild))
      .filter((element): element is MenubarMenu => element instanceof MenubarMenu)
  }

  /** The menu that is open, if any. */
  get openMenu(): MenubarMenu | undefined {
    return this.menus.find((menu) => menu.open)
  }

  /** Closes whichever menu is open. */
  close(): void {
    this.openMenu?.hide()
  }

  /** Focuses the bar's Tab stop. */
  override focus(options?: FocusOptions): void {
    ;(this.activeMenu ?? this.enabledMenus[0])?.focus(options)
  }

  private get enabledMenus(): MenubarMenu[] {
    return this.menus.filter((menu) => !menu.disabled)
  }

  private get isRtl(): boolean {
    return !isServer && getComputedStyle(this).direction === 'rtl'
  }

  /**
   * Keeps a single Tab stop: the active menu's trigger, else the first enabled one, else the first menu (a disabled
   * trigger stays focusable, so the bar never drops out of the Tab order). The menus call it when they upgrade or
   * change `disabled`.
   */
  syncTabStops(): void {
    const menus = this.menus
    const enabled = menus.filter((menu) => !menu.disabled)
    if (!this.activeMenu || !enabled.includes(this.activeMenu)) this.activeMenu = enabled[0] ?? menus[0]
    for (const menu of menus) {
      const tabStop = menu === this.activeMenu
      // A menu still waiting to hydrate must render what the server did first; it takes its stop once it has.
      if (menu.hasUpdated) menu.tabStop = tabStop
      else void menu.updateComplete.then(() => (menu.tabStop = menu === this.activeMenu))
    }
  }

  protected override firstUpdated(): void {
    // A server-rendered slot is assigned before its slotchange listener exists, so the first count happens here.
    this.syncTabStops()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    clearTimeout(this.typeaheadTimer)
  }

  private setActive(menu: MenubarMenu) {
    if (this.activeMenu === menu) return
    this.activeMenu = menu
    this.syncTabStops()
  }

  /** The bar's menu an event passed through, and whether it came from that menu's trigger rather than its rows. */
  private menuFromEvent(event: Event): { menu: MenubarMenu; onTrigger: boolean } | undefined {
    const path = event.composedPath()
    const menu = this.menus.find((candidate) => path.includes(candidate))
    if (!menu) return undefined
    const trigger = menu.triggerElement
    return { menu, onTrigger: !!trigger && path.includes(trigger) }
  }

  /** The next enabled menu from `menu` in direction `step`, wrapping; `menu` may itself be disabled. */
  private neighbour(menu: MenubarMenu, step: 1 | -1): MenubarMenu | undefined {
    const menus = this.menus
    const index = menus.indexOf(menu)
    for (let i = 1; i <= menus.length; i++) {
      const candidate = menus[(((index + step * i) % menus.length) + menus.length) % menus.length]
      if (candidate && !candidate.disabled) return candidate
    }
    return undefined
  }

  /**
   * Moves to `target`. From an open menu the open state goes along: `focus` says whether the new menu starts on its
   * first row (keyboard inside a menu) or keeps focus on its trigger (keyboard on a trigger, or the pointer).
   */
  private moveTo(target: MenubarMenu | undefined, from: MenubarMenu, focus: 'first' | 'trigger') {
    if (!target) return
    this.setActive(target)
    if (target === from) {
      if (focus === 'first' && from.open) from.show('first')
      return
    }
    if (from.open) {
      from.hide()
      target.show(focus)
    } else {
      target.focus()
    }
  }

  private handleKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
    const source = this.menuFromEvent(event)
    if (!source) return
    const { menu, onTrigger } = source
    // The triggers follow the reading direction. Inside a menu the keys stay as c2-menu reads them (ArrowRight opens a
    // submenu, so it also goes on to the next menu), or a row with a submenu and a plain row would disagree.
    const rtl = onTrigger && this.isRtl
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft'

    if (event.key === forward || event.key === backward) {
      event.preventDefault()
      this.moveTo(this.neighbour(menu, event.key === forward ? 1 : -1), menu, onTrigger ? 'trigger' : 'first')
      return
    }

    // The rest belongs to the trigger; inside a menu, c2-menu owns Home, End and typeahead.
    if (!onTrigger) return
    const enabled = this.enabledMenus
    switch (event.key) {
      case 'Home':
        event.preventDefault()
        this.moveTo(enabled[0], menu, 'trigger')
        return
      case 'End':
        event.preventDefault()
        this.moveTo(enabled[enabled.length - 1], menu, 'trigger')
        return
    }

    // Typeahead: letters jump to the next menu whose label starts with what was typed.
    if (event.key.length === 1 && event.key !== ' ') {
      clearTimeout(this.typeaheadTimer)
      this.typeahead += event.key.toLowerCase()
      this.typeaheadTimer = setTimeout(() => (this.typeahead = ''), 600)
      const index = enabled.indexOf(menu)
      const start = this.typeahead.length === 1 ? index + 1 : Math.max(index, 0)
      const ordered = [...enabled.slice(start), ...enabled.slice(0, start)]
      const match = ordered.find((candidate) => candidate.displayLabel.toLowerCase().startsWith(this.typeahead))
      if (match) {
        event.preventDefault()
        this.moveTo(match, menu, 'trigger')
      }
    }
  }

  /** Once a menu is open, the pointer moving onto another trigger opens that one instead. */
  private handlePointerOver = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    const source = this.menuFromEvent(event)
    if (!source?.onTrigger || source.menu.disabled || source.menu.open) return
    const open = this.openMenu
    if (!open) return
    this.moveTo(source.menu, open, 'trigger')
  }

  private handleFocusIn = (event: FocusEvent) => {
    const source = this.menuFromEvent(event)
    if (source?.onTrigger && !source.menu.disabled) this.setActive(source.menu)
  }

  private handleSlotChange = () => {
    this.syncTabStops()
  }

  override render() {
    return html`<slot name="start"></slot>
      <div
        class="menus"
        part="menus"
        role="menubar"
        aria-label=${this.ariaLabel || nothing}
        @keydown=${this.handleKeydown}
        @pointerover=${this.handlePointerOver}
        @focusin=${this.handleFocusIn}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
      <slot name="end"></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-menubar': Menubar
  }
}
