import { LitElement, html, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { live } from 'lit/directives/live.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './command.scss?inline'
import { CommandItem } from './command-item'
import { CommandGroup } from './command-group'

import './command-item'
import './command-group'
import './command-separator'
import { CommandSeparator } from './command-separator'

export { CommandItem, CommandGroup }
export { CommandSeparator }

export interface CommandSelectEventDetail {
  /** The `value` of the activated row, or its label text when it has no `value`. */
  value: string
  /** The `data` payload of the activated row. */
  data: unknown
}

/** Events fired by {@link Command}, keyed for `addEventListener`. */
export interface CommandEventMap {
  'command-select': CustomEvent<CommandSelectEventDetail>
  input: InputEvent
}

export interface Command {
  addEventListener: TypedAddEventListener<Command, CommandEventMap>
  removeEventListener: TypedRemoveEventListener<Command, CommandEventMap>
}

/**
 * A searchable list of commands: a search field above `c2-command-item` rows, optionally sorted into
 * `c2-command-group`s and split by `c2-command-separator`s. Typing filters the rows (every word of the query must appear in
 * a row's label, `value` or `keywords`), hides the groups left without a match and shows the `empty` slot when nothing
 * matches. Put it in a `c2-modal` for a ⌘K palette, or inline in a page or a popover.
 *
 * Focus never leaves the search field. Arrow Up/Down move the highlight between the enabled matching rows (wrapping
 * with `loop`), Enter activates the highlighted row and a click activates the clicked one. Activation fires
 * `command-select`; a row with `href` then navigates unless the event was cancelled. The field is a `combobox` whose
 * `aria-activedescendant` tracks the highlighted `option`.
 *
 * Set `manual-filter` when the rows come from a server: the palette then shows every row, and the app filters on
 * `input` (read `query`) and replaces the rows.
 *
 * @tag c2-command
 *
 * @slot default - The rows: `c2-command-item`, `c2-command-group` and `c2-command-separator` elements (separators are hidden while a query is typed).
 * @slot prefix-icon - Icon before the search field. Defaults to a magnifier.
 * @slot suffix - Content after the search field, such as an `esc` hint or a spinner.
 * @slot empty - Shown when no row matches. Defaults to "No results found."
 * @slot footer - A bar under the list, such as keyboard hints.
 *
 * @csspart field - The row holding the icon, the search input and the suffix.
 * @csspart input - The native search `<input>`.
 * @csspart list - The scrolling `listbox` around the rows.
 * @csspart empty - The container of the `empty` slot.
 * @csspart footer - The container of the `footer` slot.
 *
 * @event {CustomEvent<CommandSelectEventDetail>} command-select - Fired on the palette when a row is activated by Enter or a click. Cancelable: cancelling it stops an `href` row from navigating. Does not bubble.
 * @event {InputEvent} input - Re-dispatched from the search field whenever the query changes; read `query`.
 *
 * @cssproperty {color} [--c2-command--background=#ffffff]
 * @cssproperty {color} [--c2-command--color=#18181b]
 * @cssproperty {font-family} --c2-command--font-family
 * @cssproperty {pixel} --c2-command--width - Defaults to the width of the container.
 * @cssproperty {pixel} [--c2-command--max-height=none] - Caps the height of the whole palette: the field and the footer stay in view and the list shrinks to the space left, scrolling on its own. Pair it with `--c2-command__list--max-height: none` to let the list grow past its own cap and fill that height. Keep the host's `display: flex`.
 *
 * @cssproperty {border} [--c2-command--border-top=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-command--border-right=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-command--border-bottom=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-command--border-left=1px solid #e4e4e7]
 *
 * @cssproperty {border-radius} [--c2-command--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-command--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-command--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-command--border-bottom-right-radius=8px]
 *
 * @cssproperty {box-shadow} --c2-command--box-shadow
 *
 * @cssproperty {pixel} [--c2-command__field--min-height=48px]
 * @cssproperty {pixel} [--c2-command__field--gap=8px]
 * @cssproperty {padding} [--c2-command__field--padding-right=12px]
 * @cssproperty {padding} [--c2-command__field--padding-left=12px]
 * @cssproperty {border} [--c2-command__field--border-bottom=1px solid #e4e4e7]
 * @cssproperty {font-size} [--c2-command__field--font-size=14px]
 * @cssproperty {color} [--c2-command__placeholder--color=#71717a]
 *
 * @cssproperty {pixel} [--c2-command__icon--size=16px]
 * @cssproperty {color} [--c2-command__icon--color=#71717a]
 *
 * @cssproperty {pixel} [--c2-command__list--max-height=320px] - The list scrolls past this height. Set `none` to let the list take whatever `--c2-command--max-height` leaves.
 * @cssproperty {padding} [--c2-command__list--padding-top=4px]
 * @cssproperty {padding} [--c2-command__list--padding-right=4px]
 * @cssproperty {padding} [--c2-command__list--padding-bottom=4px]
 * @cssproperty {padding} [--c2-command__list--padding-left=4px]
 * @cssproperty {pixel} --c2-command__list--gap - Space between the rows and groups.
 *
 * @cssproperty {color} [--c2-command__empty--color=#71717a]
 * @cssproperty {font-size} [--c2-command__empty--font-size=14px]
 * @cssproperty {padding} [--c2-command__empty--padding=24px 8px]
 *
 * @cssproperty {border} [--c2-command__footer--border-top=1px solid #e4e4e7]
 * @cssproperty {padding} [--c2-command__footer--padding=8px 12px]
 * @cssproperty {color} [--c2-command__footer--color=#71717a]
 * @cssproperty {font-size} [--c2-command__footer--font-size=12px]
 *
 * @slotcomponent c2-command-item
 * @slotcomponent c2-command-group
 * @slotcomponent c2-command-separator
 */
@customElement('c2-command')
export class Command extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  /** The search text. Setting it filters the rows as typing does. */
  @property() query = ''

  /** Placeholder of the search field. */
  @property() placeholder = 'Type a command or search…'

  /** Accessible name of the search field and the list. */
  @property() label = 'Search commands'

  /** Show every row whatever the query, for rows the app filters itself (a server search). */
  @property({ type: Boolean, attribute: 'manual-filter' }) manualFilter = false

  /** Arrow keys wrap from the last row to the first and back. */
  @property({ type: Boolean }) loop = false

  @query('input') private input?: HTMLInputElement

  private readonly internals = this.attachInternals()

  private readonly slotPresence = new SlotPresenceController(this, ['footer'])

  private observer?: MutationObserver

  private active: CommandItem | undefined

  /** Set while `activate` follows an `href`, so the resulting click does not fire `command-select` twice. */
  private navigating = false

  /** Every row of this palette, in document order (rows of a nested palette excluded). */
  get items(): CommandItem[] {
    return Array.from(this.querySelectorAll('c2-command-item')).filter(
      (item): item is CommandItem => item instanceof CommandItem && item.closest('c2-command') === this,
    )
  }

  /** The rows that match the query, in document order. */
  get visibleItems(): CommandItem[] {
    return this.items.filter((item) => !item.filtered)
  }

  /** The highlighted row, which Enter activates. */
  get activeItem(): CommandItem | undefined {
    return this.active
  }

  /** Empties the query and shows every row again. */
  clear(): void {
    this.query = ''
  }

  /**
   * Activates a row the way Enter does: fires `command-select` and, unless it was cancelled, follows the row's `href`.
   * Defaults to the highlighted row. Returns whether the event was left uncancelled.
   */
  activate(item: CommandItem | undefined = this.active): boolean {
    if (!item || item.disabled) return false
    const proceed = this.dispatchSelect(item)
    if (proceed && item.href) {
      this.navigating = true
      try {
        item.navigate()
      } finally {
        this.navigating = false
      }
    }
    return proceed
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (isServer) return
    this.addEventListener('click', this.handleClick)
    this.addEventListener('pointermove', this.handlePointerMove)
    this.addEventListener('mousedown', this.handleMouseDown)
    this.observer ??= new MutationObserver(() => this.applyFilter(false))
    this.observer.observe(this, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value', 'keywords', 'disabled'] })
    if (this.hasUpdated) this.applyFilter(false)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener('click', this.handleClick)
    this.removeEventListener('pointermove', this.handlePointerMove)
    this.removeEventListener('mousedown', this.handleMouseDown)
    this.observer?.disconnect()
  }

  protected override updated(changed: PropertyValues<this>): void {
    // Both count as changed on the first update, which is what runs the initial filter.
    if (changed.has('query') || changed.has('manualFilter')) this.applyFilter(changed.has('query'))
  }

  /** Filters the rows against the query, hides empty groups and keeps the highlight on a matching row. */
  private applyFilter(resetActive: boolean) {
    const tokens = this.manualFilter ? [] : this.query.toLowerCase().split(/\s+/).filter(Boolean)
    const items = this.items
    for (const item of items) item.filtered = tokens.length > 0 && !tokens.every((token) => item.searchText.includes(token))

    for (const group of this.querySelectorAll('c2-command-group')) {
      if (!(group instanceof CommandGroup) || group.closest('c2-command') !== this) continue
      group.filtered = !items.some((item) => !item.filtered && group.contains(item))
    }

    // Separators divide the full list; while searching, the groups that survive stand on their own.
    for (const separator of this.querySelectorAll('c2-command-separator')) {
      if (separator instanceof CommandSeparator && separator.closest('c2-command') === this) separator.filtered = tokens.length > 0
    }

    const enabled = items.filter((item) => !item.filtered && !item.disabled)
    this.toggleState('empty', !items.some((item) => !item.filtered))

    if (resetActive || !this.active || !enabled.includes(this.active)) this.setActive(enabled[0], false)
  }

  private setActive(item: CommandItem | undefined, scroll: boolean) {
    if (this.active && this.active !== item) this.active.active = false
    this.active = item
    if (item) {
      item.active = true
      if (scroll) item.scrollIntoView({ block: 'nearest' })
    }
    // Element reflection crosses the shadow boundary from the field to a light-DOM row, which an id reference cannot.
    const input = this.input as (HTMLInputElement & { ariaActiveDescendantElement?: Element | null }) | undefined
    if (input && 'ariaActiveDescendantElement' in input) input.ariaActiveDescendantElement = item ?? null
  }

  private move(delta: 1 | -1) {
    const enabled = this.visibleItems.filter((item) => !item.disabled)
    if (!enabled.length) return
    const index = this.active ? enabled.indexOf(this.active) : -1
    let next = index === -1 ? (delta === 1 ? 0 : enabled.length - 1) : index + delta
    if (next < 0) next = this.loop ? enabled.length - 1 : 0
    if (next >= enabled.length) next = this.loop ? 0 : enabled.length - 1
    this.setActive(enabled[next], true)
  }

  private dispatchSelect(item: CommandItem): boolean {
    return this.dispatchEvent(
      new CustomEvent<CommandSelectEventDetail>('command-select', {
        cancelable: true,
        detail: { value: item.resolvedValue, data: item.data },
      }),
    )
  }

  private itemFrom(event: Event): CommandItem | undefined {
    return event.composedPath().find((target): target is CommandItem => target instanceof CommandItem && target.closest('c2-command') === this)
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        this.move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        this.move(-1)
        break
      case 'Enter':
        if (!this.active) return
        event.preventDefault()
        this.activate()
        break
    }
  }

  private handleInput = (event: InputEvent) => {
    this.query = (event.target as HTMLInputElement).value
    redispatchEvent(this, event)
  }

  private handleClick = (event: MouseEvent) => {
    if (this.navigating) return
    const item = this.itemFrom(event)
    if (!item || item.disabled) return
    this.setActive(item, false)
    if (!this.dispatchSelect(item)) event.preventDefault()
  }

  private handlePointerMove = (event: PointerEvent) => {
    const item = this.itemFrom(event)
    if (item && !item.disabled && item !== this.active) this.setActive(item, false)
  }

  /** Keeps focus in the search field when a row is pressed. */
  private handleMouseDown = (event: MouseEvent) => {
    if (this.itemFrom(event)) event.preventDefault()
  }

  private toggleState(name: string, on: boolean) {
    try {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    } catch {
      // Browsers without CustomStateSet.
    }
  }

  override render() {
    return html`
      <div class="field" part="field">
        <slot name="prefix-icon">
          <svg
            class="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7"></circle>
            <path d="m20 20-3.5-3.5"></path>
          </svg>
        </slot>
        <input
          part="input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="list"
          aria-autocomplete="list"
          aria-label=${this.label}
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder=${this.placeholder}
          .value=${live(this.query)}
          @input=${this.handleInput}
          @keydown=${this.handleKeyDown}
        />
        <slot name="suffix"></slot>
      </div>
      <div class="list" part="list" id="list" role="listbox" aria-label=${this.label}>
        <slot></slot>
      </div>
      <div class="empty" part="empty"><slot name="empty">No results found.</slot></div>
      <div class="footer" part="footer" ?hidden=${!this.slotPresence.has('footer')}>
        <slot name="footer" @slotchange=${this.slotPresence.handleSlotChange}></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-command': Command
  }
}
