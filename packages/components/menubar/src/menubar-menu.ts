import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { Menu, MenuSelectEventDetail, Placement } from '@c2n/menu'
import styles from './menubar-menu.scss?inline'

import '@c2n/menu'

export type { MenuSelectEventDetail, Placement }

/** Where focus goes when a menu opens: its first or last row, its own trigger (the menu opened under the pointer), or nowhere. */
export type MenubarMenuFocus = 'first' | 'last' | 'trigger' | 'none'

/** Events fired by {@link MenubarMenu}, keyed for `addEventListener`. */
export interface MenubarMenuEventMap {
  'menu-select': CustomEvent<MenuSelectEventDetail>
  toggle: ToggleEvent
}

export interface MenubarMenu {
  addEventListener: TypedAddEventListener<MenubarMenu, MenubarMenuEventMap>
  removeEventListener: TypedRemoveEventListener<MenubarMenu, MenubarMenuEventMap>
}

/**
 * One menu of a `c2-menubar`: a trigger labelled `label` ("File", "Edit", …) and the rows it opens. The trigger is a
 * native button with the `menuitem` role, and the menu is a `c2-menu` anchored under it, so the rows are everything a
 * `c2-menu` takes: `c2-menu-item` children (checkbox and radio rows, shortcuts, descriptions, submenus), `<hr>`
 * separators and `<h1>`–`<h6>` group headings.
 *
 * Keyboard and pointer movement across the bar belong to the `c2-menubar` around it; on its own the element behaves
 * like a menu button (Enter, Space or ArrowDown open on the first row, ArrowUp on the last, Escape closes).
 *
 * @tag c2-menubar-menu
 *
 * @slot default - The rows: `c2-menu-item` elements, `<hr>` separators and `<h1>`–`<h6>` group headings.
 *
 * @csspart trigger - The native button that opens the menu.
 *
 * @event {CustomEvent<MenuSelectEventDetail>} menu-select - Bubbles from the activated row (from `c2-menu-item`, unchanged).
 * @event {ToggleEvent} toggle - The menu opened or closed; `newState` is `open` or `closed`.
 *
 * @cssproperty {pixel} [--c2-menubar-menu__trigger--height=28px]
 * @cssproperty {padding} [--c2-menubar-menu__trigger--padding-left=10px]
 * @cssproperty {padding} [--c2-menubar-menu__trigger--padding-right=10px]
 * @cssproperty {border-radius} [--c2-menubar-menu__trigger--border-radius=6px]
 * @cssproperty {font-size} [--c2-menubar-menu__trigger--font-size=14px]
 * @cssproperty {font-weight} --c2-menubar-menu__trigger--font-weight
 * @cssproperty {font-family} --c2-menubar-menu__trigger--font-family
 * @cssproperty {color} [--c2-menubar-menu__trigger--color=#18181b]
 * @cssproperty {color} [--c2-menubar-menu__trigger--background-color=transparent]
 * @cssproperty {color} [--c2-menubar-menu__trigger__hover--background-color=#f4f4f5]
 * @cssproperty {color} --c2-menubar-menu__trigger__hover--color
 * @cssproperty {color} [--c2-menubar-menu__trigger__open--background-color=#f4f4f5]
 * @cssproperty {color} --c2-menubar-menu__trigger__open--color
 * @cssproperty {font-weight} --c2-menubar-menu__trigger__open--font-weight
 * @cssproperty {outline} [--c2-menubar-menu__trigger__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-menubar-menu__trigger__focus--outline-offset=0px]
 * @cssproperty {number} [--c2-menubar-menu__trigger__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-menubar-menu__menu--offset=4px] - Gap between the trigger and its menu.
 *
 * @internalcomponent c2-menu
 * @slotcomponent c2-menu-item
 */
@customElement('c2-menubar-menu')
export class MenubarMenu extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The trigger's text, which is also its accessible name. */
  @property() label = ''

  /** Whether the menu is showing. Set it to open or close the menu from code. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Leaves the trigger focusable and announced but never opens the menu; the bar's arrow keys skip it. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Preferred placement of the menu (floating-ui names); it flips near the viewport edge. */
  @property() placement: Placement = 'bottom-start'

  /** Accessible name of the menu surface. Defaults to the trigger's name. */
  @property({ attribute: 'menu-label' }) menuLabel = ''

  @query('.trigger') private trigger?: HTMLButtonElement

  @query('c2-menu') private menu?: Menu

  /**
   * Whether the trigger is the bar's Tab stop. Every trigger starts as one, so the bar works before it has upgraded
   * (and under a server render); `c2-menubar` keeps a single one once it runs.
   */
  @state() tabStop = true

  private readonly internals = isServer ? undefined : this.attachInternals()

  /** Which row the menu should focus when it next opens. `open` set from code moves no focus; `show()` does. */
  private pendingFocus: MenubarMenuFocus = 'none'

  /** The native button that opens the menu. */
  get triggerElement(): HTMLButtonElement | null {
    return this.trigger ?? null
  }

  /** The trigger's text, for the bar's typeahead. */
  get displayLabel(): string {
    return this.label.trim()
  }

  /** Opens the menu. `'trigger'` keeps focus on the trigger (a menu opened under the pointer), `'none'` leaves it where it is. */
  show(focus: MenubarMenuFocus = 'first'): void {
    if (this.disabled) return
    this.pendingFocus = focus
    if (this.open) this.applyFocus()
    else this.open = true
  }

  hide(): void {
    this.open = false
  }

  /** Focuses the trigger. */
  override focus(options?: FocusOptions): void {
    this.trigger?.focus(options)
  }

  override connectedCallback() {
    super.connectedCallback()
    // A `menuitem` must sit directly in its `menubar`; the host between them is presentation only, like an APG `<li role="none">`.
    if (this.internals) this.internals.role = 'none'
  }

  protected override willUpdate(): void {
    if (this.open && this.disabled) this.open = false
  }

  protected override firstUpdated(): void {
    // A menu that upgrades (or hydrates) after its bar starts as a Tab stop; the bar puts it back in line.
    this.syncBar()
  }

  /** Asks the bar around this menu to recount its Tab stops, without importing it. */
  private syncBar() {
    const bar = this.closest('c2-menubar') as (HTMLElement & { syncTabStops?: () => void }) | null
    bar?.syncTabStops?.()
  }

  /**
   * On a menu that is already open (the bar opened it under the pointer, or moved it along with focus left on the
   * trigger), the opening keys move into the rows. c2-menu would only re-open it, and Enter or Space would close it.
   */
  private handleTriggerKeydown = (event: KeyboardEvent) => {
    if (!this.open || event.ctrlKey || event.metaKey || event.altKey) return
    let focus: 'first' | 'last'
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') focus = 'first'
    else if (event.key === 'ArrowUp') focus = 'last'
    else return
    event.preventDefault()
    event.stopPropagation()
    this.show(focus)
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('disabled') && changed.get('disabled') !== undefined) this.syncBar()
    if (changed.has('open')) {
      const menu = this.menu
      if (menu && menu.open !== this.open) {
        if (this.open) menu.show(this.pendingFocus === 'first' || this.pendingFocus === 'last' ? this.pendingFocus : 'none')
        else menu.hide()
      }
    }
    if (this.internals) {
      if (this.open) this.internals.states.add('open')
      else this.internals.states.delete('open')
    }
  }

  private applyFocus() {
    const focus = this.pendingFocus
    this.pendingFocus = 'none'
    if (focus === 'trigger') this.trigger?.focus()
    else if (focus === 'first') this.menu?.focusFirstItem()
    else if (focus === 'last') this.menu?.focusLastItem()
  }

  private handleMenuToggle = (event: Event) => {
    if (event.target !== this.menu) return
    const isOpen = (event as ToggleEvent).newState === 'open'
    this.open = isOpen
    // The menu that closed when this one opened may have handed focus back to its own trigger in the meantime.
    if (isOpen) this.applyFocus()
    else this.pendingFocus = 'none'
    redispatchEvent(this, event)
  }

  override render() {
    // The menu's name goes in as a property: an `aria-label` attribute on the c2-menu host would make it a named generic
    // between the menubar and its menuitems, which the menubar role does not allow.
    return html`<c2-menu
      .placement=${this.placement}
      .disabled=${this.disabled}
      .ariaLabel=${this.menuLabel || this.label || null}
      @toggle=${this.handleMenuToggle}
    >
      <button
        slot="trigger"
        class="trigger"
        part="trigger"
        type="button"
        role="menuitem"
        tabindex=${this.tabStop ? 0 : -1}
        aria-disabled=${this.disabled ? 'true' : nothing}
        @keydown=${this.handleTriggerKeydown}
      >
        ${this.label}
      </button>
      <slot></slot>
    </c2-menu>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-menubar-menu': MenubarMenu
  }
}
