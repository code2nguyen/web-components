import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { isServer } from 'lit-html/is-server.js'
import { property, query, queryAll, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { Overlay, Placement } from '@c2n/overlay'
import styles from './theme-select.scss?inline'

import '@c2n/overlay'

export type { Placement }

/** Colour scheme a mode resolves to. `system` follows the OS `prefers-color-scheme`. */
export type ThemeSelectScheme = 'light' | 'dark' | 'system'

/** One state of the control. A bare string is shorthand for `{ value }`. */
export interface ThemeSelectMode {
  /** Identifier written to `value`, to storage and to the `theme-change` detail. */
  value: string
  /** Row label in the menu and accessible name of the trigger. Defaults to the capitalized value. */
  label?: string
  /** Scheme applied to the target. Defaults to `system` / `dark` for those values, `light` otherwise. */
  scheme?: ThemeSelectScheme
}

/** Detail of the `theme-change` event. */
export interface ThemeSelectChangeDetail {
  /** The selected mode. */
  value: string
  /** The scheme it resolves to right now — `system` is already resolved against the OS preference. */
  theme: 'light' | 'dark'
}

/** Events fired by {@link ThemeSelect}, keyed for `addEventListener`. */
export interface ThemeSelectEventMap {
  'theme-change': CustomEvent<ThemeSelectChangeDetail>
}

export interface ThemeSelect {
  addEventListener: TypedAddEventListener<ThemeSelect, ThemeSelectEventMap>
  removeEventListener: TypedRemoveEventListener<ThemeSelect, ThemeSelectEventMap>
}

const BUILT_IN_LABELS: Record<string, string> = { system: 'System', light: 'Light', dark: 'Dark' }

/** `modes="system,light,dark"` in markup, a JSON array for richer rows, an array of objects from script. */
const modesConverter = {
  toAttribute: () => null,
  fromAttribute: (value: string | null): Array<string | ThemeSelectMode> => {
    const source = value?.trim()
    if (!source) return []
    if (source.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(source)
        return Array.isArray(parsed) ? (parsed as Array<string | ThemeSelectMode>) : []
      } catch {
        return []
      }
    }
    return source
      .split(/[,;]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  },
}

const SUN_ICON = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <circle cx="12" cy="12" r="5"></circle>
  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
</svg>`

const MOON_ICON = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
</svg>`

const MONITOR_ICON = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
  <path d="M8 21h8M12 17v4"></path>
</svg>`

const CHECK_ICON = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M20 6 9 17l-5-5"></path>
</svg>`

const BUILT_IN_ICONS: Record<string, TemplateResult> = { system: MONITOR_ICON, light: SUN_ICON, dark: MOON_ICON }

/**
 * Colour-theme switcher. The trigger shows the icon of the mode currently in effect and clicking it steps to the next
 * one, wrapping around — a two-state control is therefore a plain light/dark toggle. With three or more modes the
 * trigger also opens a menu on hover (or focus, or ArrowDown) so any mode can be picked directly, while the click-to-
 * advance behaviour keeps working.
 *
 * By default the component owns the page theme: it writes the resolved scheme to `data-theme` on `<html>`, remembers
 * the choice in `localStorage` under `storage-key`, restores it on load, follows the OS preference live while the
 * `system` mode is selected, and stays in sync with other tabs and with other instances on the page. Set `manual` to
 * take that over yourself and only listen for `theme-change`.
 *
 * @tag c2-theme-select
 *
 * @slot system-icon - Replaces the built-in monitor icon of the `system` mode, in the trigger and in its menu row. Every mode takes its icon from `<value>-icon`, so a custom mode brings its own.
 * @slot light-icon - Replaces the built-in sun icon of the `light` mode.
 * @slot dark-icon - Replaces the built-in moon icon of the `dark` mode.
 * @slot check - Mark shown beside the selected row in the menu. Defaults to a check.
 *
 * @event {CustomEvent<ThemeSelectChangeDetail>} theme-change - The scheme in effect changed: a mode was picked, or the OS preference moved while `system` was selected. `detail.value` is the mode, `detail.theme` the scheme it resolves to. Does not bubble; assigning `value` from script is silent.
 *
 * @csspart trigger - The button that shows the current mode and advances to the next one.
 * @csspart icon - The icon box inside the trigger and inside every menu row.
 * @csspart label - The trigger's text, rendered only with `show-label`.
 * @csspart menu - The dropdown surface.
 * @csspart menu-item - One row of the dropdown.
 * @csspart check - The mark beside the selected row.
 *
 * @cssproperty {pixel} [--c2-theme-select__trigger--size=32px] - Height of the trigger, and its width while icon-only.
 * @cssproperty {pixel} [--c2-theme-select__trigger--padding-inline=8px] - Side padding, used only with `show-label`.
 * @cssproperty {pixel} [--c2-theme-select__trigger--gap=8px] - Space between the icon and the label.
 * @cssproperty {border-radius} [--c2-theme-select__trigger--border-radius=8px]
 * @cssproperty {border} [--c2-theme-select__trigger--border=1px solid transparent]
 * @cssproperty {color} [--c2-theme-select__trigger--background=transparent]
 * @cssproperty {color} [--c2-theme-select__trigger--color=#18181b]
 * @cssproperty {color} [--c2-theme-select__trigger__hover--background=#f4f4f5]
 * @cssproperty {color} --c2-theme-select__trigger__hover--color - Falls back to the resting colour.
 * @cssproperty {color} [--c2-theme-select__trigger__active--background=#e4e4e7]
 * @cssproperty {color} --c2-theme-select__trigger__open--background - Trigger fill while the menu is open; falls back to the hover fill.
 * @cssproperty {outline} [--c2-theme-select__trigger__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-theme-select__trigger__focus--outline-offset=2px]
 * @cssproperty {opacity} [--c2-theme-select__trigger__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-theme-select__icon--size=16px] - Side of the icon square, in the trigger and in the menu rows.
 * @cssproperty {font-size} [--c2-theme-select__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-theme-select__label--font-weight=500]
 *
 * @cssproperty {color} [--c2-theme-select__menu--background=#ffffff]
 * @cssproperty {border} [--c2-theme-select__menu--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-theme-select__menu--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-theme-select__menu--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {pixel} [--c2-theme-select__menu--padding=4px]
 * @cssproperty {pixel} [--c2-theme-select__menu--min-width=148px]
 * @cssproperty {pixel} [--c2-theme-select__menu--gap=2px] - Space between rows.
 * @cssproperty {pixel} [--c2-theme-select__menu--offset=6px] - Distance between the trigger and the menu.
 *
 * @cssproperty {pixel} [--c2-theme-select__menu-item--gap=8px]
 * @cssproperty {pixel} [--c2-theme-select__menu-item--padding-block=6px]
 * @cssproperty {pixel} [--c2-theme-select__menu-item--padding-inline=8px]
 * @cssproperty {border-radius} [--c2-theme-select__menu-item--border-radius=6px]
 * @cssproperty {color} [--c2-theme-select__menu-item--color=#18181b]
 * @cssproperty {font-size} [--c2-theme-select__menu-item--font-size=14px]
 * @cssproperty {font-weight} [--c2-theme-select__menu-item--font-weight=500]
 * @cssproperty {color} [--c2-theme-select__menu-item__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-theme-select__menu-item__selected--color=rgb(2, 101, 220)]
 * @cssproperty {color} --c2-theme-select__menu-item__selected--background - Fill of the selected row; transparent by default.
 * @cssproperty {pixel} [--c2-theme-select__check--size=14px]
 * @cssproperty {color} --c2-theme-select__check--color - Falls back to the selected row's colour.
 *
 * @cssproperty {time} [--c2-theme-select--transition-duration=150ms] - Icon cross-fade and trigger colour change.
 */
@customElement('c2-theme-select')
export class ThemeSelect extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The states to cycle through: `"system,light,dark"`, a JSON array, or objects from script. */
  @property({ converter: modesConverter }) modes: Array<string | ThemeSelectMode> = ['system', 'light', 'dark']

  /** The mode in effect. Assigning it selects that mode silently; `select()` and `next()` report the change. */
  @property({ reflect: true }) value = ''

  /** When to offer the dropdown: `auto` (three or more modes), `always`, or `never`. */
  @property({ reflect: true }) menu: 'auto' | 'always' | 'never' = 'auto'

  /** Preferred placement of the menu (floating-ui names). */
  @property({ reflect: true }) placement: Placement = 'bottom'

  /** Show the current mode's label beside its icon. */
  @property({ type: Boolean, reflect: true, attribute: 'show-label' }) showLabel = false

  /** Blocks interaction and dims the control. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Do not touch the document or storage; the host applies the theme itself from `theme-change`. */
  @property({ type: Boolean, reflect: true }) manual = false

  /** Element the scheme is written to, or the id of one. Defaults to `<html>`. */
  @property({ attribute: 'target' }) target: string | HTMLElement | undefined = undefined

  /** Attribute written on the target, `data-theme` by default. */
  @property({ attribute: 'theme-attribute' }) themeAttribute = 'data-theme'

  /** `localStorage` key the chosen mode is remembered under. Empty disables persistence. */
  @property({ attribute: 'storage-key' }) storageKey = 'c2n-theme'

  /** Milliseconds the pointer must rest on the trigger before the menu opens. */
  @property({ type: Number, attribute: 'open-delay' }) openDelay = 150

  /** Milliseconds the menu stays open after the pointer leaves, so it can be crossed into. */
  @property({ type: Number, attribute: 'close-delay' }) closeDelay = 200

  /** Accessible name of the trigger. Defaults to `Theme: <current label>`. */
  @property({ attribute: 'aria-label' }) override ariaLabel!: string

  /** Whether the dropdown is showing. */
  @state() private open = false

  /** Live `prefers-color-scheme: dark`, used to resolve the `system` mode. */
  @state() private systemDark = false

  /**
   * Slotted per-mode icons, cloned once per place they appear. A node lives in exactly one parent and a named slot is
   * assigned exactly once, so the trigger and the mode's menu row each need their own copy; the assignment itself
   * happens in a hidden set of source slots, one per mode, so every mode's icon is collected and not just the current
   * one's. Cloning at `slotchange` rather than at render keeps the node identity stable between updates.
   */
  @state() private icons: Record<string, { trigger: Element[]; row: Element[] }> = {}

  @query('.c2-theme-select__trigger') private triggerElement!: HTMLButtonElement
  @query('c2-overlay') private overlayElement!: Overlay
  @queryAll('.c2-theme-select__item') private itemElements!: NodeListOf<HTMLButtonElement>

  /** What each icon slot was last assigned, so a repeated read does not re-clone and re-render. */
  private iconSources: Record<string, Element[]> = {}
  private mediaQuery: MediaQueryList | undefined
  private openTimer: ReturnType<typeof setTimeout> | undefined
  private closeTimer: ReturnType<typeof setTimeout> | undefined
  /** Nothing has been applied yet, so the first render must write the theme even if `value` did not change. */
  private applied = false

  /** The modes, normalized and with every default filled in. */
  get resolvedModes(): Required<ThemeSelectMode>[] {
    const source = this.modes?.length ? this.modes : ['light', 'dark']
    return source.map((mode) => {
      const entry = typeof mode === 'string' ? { value: mode } : mode
      const value = entry.value
      return {
        value,
        label: entry.label ?? BUILT_IN_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1),
        scheme: entry.scheme ?? (value === 'system' ? 'system' : value === 'dark' ? 'dark' : 'light'),
      }
    })
  }

  /** The mode currently in effect, always one of {@link resolvedModes}. */
  get currentMode(): Required<ThemeSelectMode> {
    const modes = this.resolvedModes
    return modes.find((mode) => mode.value === this.value) ?? modes[0]
  }

  /** The scheme in effect: the current mode's, with `system` resolved against the OS preference. */
  get resolvedTheme(): 'light' | 'dark' {
    const scheme = this.currentMode.scheme
    return scheme === 'system' ? (this.systemDark ? 'dark' : 'light') : scheme
  }

  /** Whether the dropdown is offered at all. */
  private get hasMenu(): boolean {
    if (this.menu === 'never') return false
    return this.menu === 'always' || this.resolvedModes.length > 2
  }

  private get targetElement(): HTMLElement | null {
    if (this.target instanceof HTMLElement) return this.target
    if (typeof this.target === 'string' && this.target) {
      const root = this.getRootNode() as Document | ShadowRoot
      return (root.querySelector?.(`#${CSS.escape(this.target)}`) as HTMLElement | null) ?? document.getElementById(this.target)
    }
    return document.documentElement
  }

  override connectedCallback() {
    super.connectedCallback()
    if (isServer) return
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    this.systemDark = this.mediaQuery.matches
    this.mediaQuery.addEventListener('change', this.handleSystemChange)
    window.addEventListener('storage', this.handleStorage)
    if (!this.value) this.value = this.restore() ?? this.resolvedModes[0].value
  }

  /**
   * `slotchange` does not fire for server-rendered slots, so read the sources once by hand. Deferred past the update
   * Lit is finishing, or the state it sets would schedule a second render from inside the first one; on the client
   * `slotchange` has normally run by then and each read is a no-op.
   */
  protected override firstUpdated() {
    void this.updateComplete.then(() => {
      for (const slot of this.renderRoot.querySelectorAll<HTMLSlotElement>('.c2-theme-select__icon-source slot')) this.readIconSlot(slot)
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.mediaQuery?.removeEventListener('change', this.handleSystemChange)
    window.removeEventListener('storage', this.handleStorage)
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.clearTimers()
  }

  /** Selects a mode by value and fires `theme-change`. Unknown values are ignored. */
  select(value: string) {
    if (this.disabled) return
    const mode = this.resolvedModes.find((entry) => entry.value === value)
    if (!mode || mode.value === this.value) return
    this.value = mode.value
    this.report()
  }

  private report() {
    this.dispatchEvent(new CustomEvent<ThemeSelectChangeDetail>('theme-change', { detail: { value: this.value, theme: this.resolvedTheme } }))
  }

  /** Advances to the next mode, wrapping around — what a click on the trigger does. */
  next() {
    const modes = this.resolvedModes
    const index = modes.findIndex((mode) => mode.value === this.value)
    this.select(modes[(index + 1) % modes.length].value)
  }

  /** Opens the dropdown, when there is one. */
  showMenu() {
    this.clearTimers()
    if (!this.hasMenu || this.disabled) return
    this.open = true
  }

  /** Closes the dropdown. */
  hideMenu() {
    this.clearTimers()
    this.open = false
  }

  override focus(options?: FocusOptions) {
    this.triggerElement?.focus(options)
  }

  protected override updated(changed: PropertyValues) {
    const first = !this.applied
    if (!isServer && (first || changed.has('value') || changed.has('systemDark') || changed.has('manual'))) this.applyTheme()
    // An OS flip while `system` is selected changes the scheme in effect without changing the mode. Nothing else on
    // the page can see that, so it is reported like a pick — but the initial resolution is state, not a change.
    if (!isServer && !first && changed.has('systemDark') && this.currentMode.scheme === 'system') this.report()
    if (changed.has('open')) this.syncOutsideDismiss()
  }

  /** Writes the resolved scheme onto the target and remembers the mode. A no-op in `manual` mode. */
  private applyTheme() {
    this.applied = true
    if (this.manual) return
    const target = this.targetElement
    if (target) target.setAttribute(this.themeAttribute, this.resolvedTheme)
    if (!this.storageKey) return
    try {
      localStorage.setItem(this.storageKey, this.value)
    } catch {
      /* storage unavailable (private mode, blocked cookies) */
    }
  }

  private restore(): string | undefined {
    if (this.manual || !this.storageKey) return undefined
    let stored: string | null = null
    try {
      stored = localStorage.getItem(this.storageKey)
    } catch {
      return undefined
    }
    return this.resolvedModes.some((mode) => mode.value === stored) ? (stored ?? undefined) : undefined
  }

  private handleIconSlotChange = (event: Event) => {
    this.readIconSlot(event.target as HTMLSlotElement)
  }

  private readIconSlot(slot: HTMLSlotElement) {
    const value = slot.name.slice(0, -'-icon'.length)
    const assigned = slot.assignedElements()
    const previous = this.iconSources[value] ?? []
    if (assigned.length === previous.length && assigned.every((node, index) => node === previous[index])) return
    this.iconSources[value] = assigned
    const next = { ...this.icons }
    if (assigned.length) {
      next[value] = {
        trigger: assigned.map((node) => node.cloneNode(true) as Element),
        row: assigned.map((node) => node.cloneNode(true) as Element),
      }
    } else delete next[value]
    this.icons = next
  }

  private handleSystemChange = (event: MediaQueryListEvent) => {
    this.systemDark = event.matches
  }

  /** Another tab (or another instance writing the same key) changed the stored mode. */
  private handleStorage = (event: StorageEvent) => {
    if (this.manual || !this.storageKey || event.key !== this.storageKey || !event.newValue) return
    if (this.resolvedModes.some((mode) => mode.value === event.newValue)) this.value = event.newValue
  }

  /** `popover="manual"` never light-dismisses, so an outside press has to close the menu by hand. */
  private syncOutsideDismiss() {
    if (isServer) return
    if (this.open) document.addEventListener('pointerdown', this.handleDocumentPointerDown, true)
    else document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true)
  }

  private handleDocumentPointerDown = (event: PointerEvent) => {
    const path = event.composedPath()
    if (path.includes(this) || path.includes(this.overlayElement)) return
    this.hideMenu()
  }

  /** Keyboard users leave the menu by tabbing out of it. */
  private handleFocusOut = (event: FocusEvent) => {
    if (!this.open) return
    const next = event.relatedTarget as Node | null
    if (next && (this.renderRoot as ShadowRoot).contains(next)) return
    this.hideMenu()
  }

  private clearTimers() {
    clearTimeout(this.openTimer)
    clearTimeout(this.closeTimer)
    this.openTimer = undefined
    this.closeTimer = undefined
  }

  /** The pointer is over the trigger or the menu: cancel a pending close, schedule the open. */
  private handlePointerEnter = (event: PointerEvent) => {
    // A touch tap also fires `pointerenter`; opening on it would fight the click that follows.
    if (event.pointerType === 'touch' || !this.hasMenu || this.disabled) return
    // Crossing the gap between the trigger and the menu leaves the wrapper and starts the close timer; entering
    // either one again has to cancel it, open or not, or a slow trip into the menu closes it halfway there.
    clearTimeout(this.closeTimer)
    this.closeTimer = undefined
    if (this.open || this.openTimer) return
    this.openTimer = setTimeout(
      () => {
        this.openTimer = undefined
        this.open = true
      },
      Math.max(0, this.openDelay),
    )
  }

  private handlePointerLeave = () => {
    clearTimeout(this.openTimer)
    this.openTimer = undefined
    if (!this.open || this.closeTimer) return
    this.closeTimer = setTimeout(
      () => {
        this.closeTimer = undefined
        this.open = false
      },
      Math.max(0, this.closeDelay),
    )
  }

  private handleTriggerClick = () => {
    this.next()
  }

  private handleTriggerKeydown = (event: KeyboardEvent) => {
    if (!this.hasMenu || this.disabled) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      this.showMenu()
      void this.updateComplete.then(() => this.focusItem(event.key === 'ArrowUp' ? this.itemElements.length - 1 : 0))
    } else if (event.key === 'Escape' && this.open) {
      event.preventDefault()
      this.hideMenu()
    }
  }

  private handleItemClick(value: string) {
    this.select(value)
    this.hideMenu()
    this.triggerElement?.focus()
  }

  private handleMenuKeydown = (event: KeyboardEvent) => {
    const items = [...this.itemElements]
    if (!items.length) return
    const index = items.indexOf(event.target as HTMLButtonElement)
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        this.focusItem((index + 1) % items.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        this.focusItem((index - 1 + items.length) % items.length)
        break
      case 'Home':
        event.preventDefault()
        this.focusItem(0)
        break
      case 'End':
        event.preventDefault()
        this.focusItem(items.length - 1)
        break
      case 'Escape':
      case 'Tab':
        this.hideMenu()
        if (event.key === 'Escape') {
          event.preventDefault()
          this.triggerElement?.focus()
        }
        break
    }
  }

  private focusItem(index: number) {
    this.itemElements[index]?.focus()
  }

  /** The overlay light-dismisses itself (Escape, outside press); mirror that back into `open`. */
  private handleOverlayToggle = (event: Event) => {
    this.open = (event as ToggleEvent).newState === 'open'
  }

  /** The slotted icon for this place, or the built-in one. Decorative either way: the row is named by its label. */
  private renderIcon(mode: Required<ThemeSelectMode>, place: 'trigger' | 'row') {
    return this.icons[mode.value]?.[place] ?? BUILT_IN_ICONS[mode.value] ?? nothing
  }

  /** Hidden: this is where the per-mode icon slots live, so every mode's icon is assigned, not just the current one's. */
  private renderIconSources() {
    return html`<span class="c2-theme-select__icon-source" aria-hidden="true">
      ${this.resolvedModes.map((mode) => html`<slot name="${mode.value}-icon" @slotchange=${this.handleIconSlotChange}></slot>`)}
    </span>`
  }

  private renderMenu() {
    const current = this.currentMode
    return html`
      <c2-overlay
        class="c2-theme-select__overlay"
        popover="manual"
        free-width
        anchor="c2-theme-select-trigger"
        .placement=${this.placement}
        .open=${this.open}
        @toggle=${this.handleOverlayToggle}
        @keydown=${this.handleMenuKeydown}
        @pointerenter=${this.handlePointerEnter}
        @pointerleave=${this.handlePointerLeave}
      >
        <div class="c2-theme-select__menu" part="menu" role="menu">
          ${this.resolvedModes.map(
            (mode) => html`
              <button
                class=${classMap({ 'c2-theme-select__item': true, 'is-selected': mode.value === current.value })}
                part="menu-item"
                type="button"
                role="menuitemradio"
                aria-checked=${mode.value === current.value}
                tabindex="-1"
                @click=${() => this.handleItemClick(mode.value)}
              >
                <span class="c2-theme-select__icon" part="icon" aria-hidden="true">${this.renderIcon(mode, 'row')}</span>
                <span class="c2-theme-select__item-label">${mode.label}</span>
                <span class="c2-theme-select__check" part="check">
                  ${mode.value === current.value ? html`<slot name="check">${CHECK_ICON}</slot>` : nothing}
                </span>
              </button>
            `,
          )}
        </div>
      </c2-overlay>
    `
  }

  override render() {
    const current = this.currentMode
    const hasMenu = this.hasMenu
    return html`
      <div class="c2-theme-select" @pointerenter=${this.handlePointerEnter} @pointerleave=${this.handlePointerLeave} @focusout=${this.handleFocusOut}>
        <button
          id="c2-theme-select-trigger"
          class=${classMap({ 'c2-theme-select__trigger': true, 'is-open': this.open })}
          part="trigger"
          type="button"
          ?disabled=${this.disabled}
          aria-label=${this.ariaLabel || `Theme: ${current.label}`}
          aria-haspopup=${ifDefined(hasMenu ? 'menu' : undefined)}
          aria-expanded=${ifDefined(hasMenu ? String(this.open) : undefined)}
          @click=${this.handleTriggerClick}
          @keydown=${this.handleTriggerKeydown}
          @pointerenter=${this.handlePointerEnter}
        >
          <span class="c2-theme-select__icon" part="icon" aria-hidden="true">${this.renderIcon(current, 'trigger')}</span>
          ${this.showLabel ? html`<span class="c2-theme-select__label" part="label">${current.label}</span>` : nothing}
        </button>
        ${hasMenu ? this.renderMenu() : nothing} ${this.renderIconSources()}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-theme-select': ThemeSelect
  }
}
