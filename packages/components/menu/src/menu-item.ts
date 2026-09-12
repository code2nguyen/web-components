import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './menu-item.scss?inline'

/** Plain command (`item`), or a checkable row announced as `menuitemcheckbox` / `menuitemradio`. */
export type MenuItemType = 'item' | 'checkbox' | 'radio'

export interface MenuSelectEventDetail {
  /** The `value` of the activated row. */
  value: string
  /** The `checked` state after the activation; always `false` for a plain row. */
  checked: boolean
  /** The `data` payload of the activated row. */
  data: unknown
}

/**
 * A row of a `c2-menu`: a command, a link (`href`), a checkbox or a radio (`type`), or the parent of a nested menu
 * slotted into `submenu`. Activating a row fires `menu-select` and closes the menu unless the row is marked
 * `keep-open`. The default slot is the label, `description` a second muted line, `prefix-icon` / `suffix-icon` take an
 * inline SVG, a `c2-feather-*` icon or a `c2-mat-icon`, and `shortcut` holds a keyboard hint (plain text or a `c2-kbd`).
 *
 * Rows never handle the keyboard themselves: the menu owns arrow keys, typeahead and the roving `tabindex`, and marks
 * every row `reserve-indicator` while any sibling is checkable so the labels of plain and checkable rows line up.
 *
 * @tag c2-menu-item
 *
 * @slot default - The row label. Falls back to `label`, then `value`, when empty.
 * @slot description - Secondary line under the label (muted, smaller).
 * @slot prefix-icon - Icon shown before the label.
 * @slot suffix-icon - Icon shown after the label; replaced by the chevron when the row has a submenu.
 * @slot shortcut - Keyboard hint, aligned to the end of the row.
 * @slot submenu - A nested `c2-menu` opened by hover, click, Enter or ArrowRight.
 *
 * @event {CustomEvent<MenuSelectEventDetail>} menu-select - Fired after the row is activated by a click, Enter or Space. Cancelable; a row with a submenu never fires it.
 * @event {CustomEvent<{ checked: boolean; value: string }>} checked-change - Fired after the `checked` state of a `checkbox` / `radio` row changes.
 *
 * @cssproperty {pixel} [--c2-menu-item--min-height=32px]
 * @cssproperty {pixel} [--c2-menu-item--gap=8px] - Space between the indicator, icons, label and shortcut.
 *
 * @cssproperty {border-radius} [--c2-menu-item--border-top-left-radius=6px]
 * @cssproperty {border-radius} [--c2-menu-item--border-top-right-radius=6px]
 * @cssproperty {border-radius} [--c2-menu-item--border-bottom-left-radius=6px]
 * @cssproperty {border-radius} [--c2-menu-item--border-bottom-right-radius=6px]
 *
 * @cssproperty {padding} [--c2-menu-item--padding-top=6px]
 * @cssproperty {padding} [--c2-menu-item--padding-right=8px]
 * @cssproperty {padding} [--c2-menu-item--padding-bottom=6px]
 * @cssproperty {padding} [--c2-menu-item--padding-left=8px]
 *
 * @cssproperty {font-size} [--c2-menu-item--font-size=14px]
 * @cssproperty {font-weight} --c2-menu-item--font-weight
 * @cssproperty {font-style} --c2-menu-item--font-style
 * @cssproperty {font-family} --c2-menu-item--font-family
 * @cssproperty {pixel} [--c2-menu-item--line-height=20px]
 *
 * @cssproperty {color} [--c2-menu-item--color=#18181b]
 * @cssproperty {color} [--c2-menu-item--background=transparent]
 *
 * @cssproperty {color} [--c2-menu-item__hover--background=#f4f4f5] - Also the highlight of the keyboard-focused row.
 * @cssproperty {color} --c2-menu-item__hover--color - Defaults to the row colour.
 *
 * @cssproperty {color} [--c2-menu-item__description--color=#71717a]
 * @cssproperty {font-size} [--c2-menu-item__description--font-size=12px]
 * @cssproperty {pixel} [--c2-menu-item__description--line-height=16px]
 * @cssproperty {pixel} [--c2-menu-item__description--margin-top=1px]
 *
 * @cssproperty {color} [--c2-menu-item__shortcut--color=#a1a1aa]
 * @cssproperty {font-size} [--c2-menu-item__shortcut--font-size=12px]
 * @cssproperty {letter-spacing} [--c2-menu-item__shortcut--letter-spacing=0.04em]
 *
 * @cssproperty {pixel} [--c2-menu-item__icon--size=16px]
 * @cssproperty {color} [--c2-menu-item__icon--color=#71717a]
 *
 * @cssproperty {pixel} [--c2-menu-item__indicator--size=16px]
 * @cssproperty {color} --c2-menu-item__indicator--color - The check mark / radio dot. Defaults to the row colour.
 *
 * @cssproperty {color} [--c2-menu-item__destructive--color=#dc2626] - Label and icon colour of a `destructive` row.
 * @cssproperty {color} [--c2-menu-item__destructive__hover--background=#fef2f2]
 *
 * @cssproperty {outline} [--c2-menu-item__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-menu-item__focus--outline-offset=-2px]
 *
 * @cssproperty {opacity} [--c2-menu-item__disabled--opacity=0.38]
 */
@customElement('c2-menu-item')
export class MenuItem extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The value reported in `menu-select`. */
  @property({ reflect: true }) value = ''

  /** Dims the row and ignores clicks and keyboard. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** `item` is a command, `checkbox` toggles, `radio` picks one row of a `name` group. */
  @property({ reflect: true }) type: MenuItemType = 'item'

  /** Checked state of a `checkbox` / `radio` row; shown as a check mark or a dot. */
  @property({ type: Boolean, reflect: true }) checked = false

  /** Radio group name. Selecting a `radio` row unchecks the other rows of the same group in that menu. */
  @property({ reflect: true }) name?: string

  /** Makes the row a link; Enter and a click navigate, and `menu-select` still fires. */
  @property() href?: string

  @property() target?: string

  /** Paints the row in the destructive colour, for delete-style commands. */
  @property({ type: Boolean, reflect: true }) destructive = false

  /** Keeps the menu open after this row is activated, e.g. for a checkbox row. */
  @property({ type: Boolean, attribute: 'keep-open' }) keepOpen = false

  /** Label used for typeahead and as the default slot's fallback content. */
  @property({ reflect: true }) label?: string

  /** Arbitrary payload returned alongside `value` in `menu-select`. Not an attribute. */
  @property({ attribute: false }) data?: unknown

  /** Set by the parent menu while this row's submenu is open. Announced as `aria-expanded`. */
  @property({ type: Boolean, reflect: true }) expanded = false

  /** Private: set by the parent menu on every row while any sibling is checkable, so the labels line up. */
  @property({ type: Boolean, reflect: true, attribute: 'reserve-indicator' }) reserveIndicator = false

  @state() private hasDescription = false

  @state() private submenuPresent = false

  @query('slot:not([name])') private contentSlot!: HTMLSlotElement

  @query('slot[name="submenu"]') private submenuSlot?: HTMLSlotElement

  /** `role` written by the author, kept over the automatic one. */
  private authorRole: string | null = null

  /** Whether a menu is slotted into `submenu`. */
  get hasSubmenu(): boolean {
    return this.submenuPresent
  }

  /** The element slotted into `submenu`, if any. The parent menu opens and closes it. */
  get submenuElement(): HTMLElement | null {
    const assigned = this.submenuSlot?.assignedElements({ flatten: true }) ?? []
    return (assigned.find((element): element is HTMLElement => element instanceof HTMLElement) ?? null) as HTMLElement | null
  }

  /** The text the menu matches while typing: `label` when set, otherwise the slotted label text. */
  get displayText(): string {
    if (this.label !== undefined) return this.label
    const assigned = this.contentSlot?.assignedNodes({ flatten: true }) ?? []
    const text = assigned.map((node) => (node as HTMLElement).innerText ?? node.textContent ?? '').join(' ')
    return (text.trim() || this.contentSlot?.textContent?.trim() || this.value).trim()
  }

  override connectedCallback() {
    super.connectedCallback()
    if (this.authorRole === null) this.authorRole = this.getAttribute('role')
  }

  /**
   * Activates the row the way Enter does: a link is navigated, a checkable row toggles, and `menu-select` fires.
   * A row with a submenu does nothing — the menu opens the submenu instead.
   */
  activate(): void {
    if (this.disabled || this.hasSubmenu) return
    if (this.href) {
      this.renderRoot.querySelector('a')?.click()
      return
    }
    this.select()
  }

  private select(): void {
    if (this.type === 'checkbox') this.checked = !this.checked
    else if (this.type === 'radio') this.checked = true

    this.dispatchEvent(
      new CustomEvent<MenuSelectEventDetail>('menu-select', {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: { value: this.value, checked: this.checked, data: this.data },
      }),
    )
  }

  private handleClick = (event: Event) => {
    if (this.disabled) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    // A row that owns a submenu is not a command: the menu opens the submenu on the same click.
    if (this.hasSubmenu) return
    this.select()
  }

  private handleDescriptionSlotChange(event: Event) {
    const slot = event.target as HTMLSlotElement
    this.hasDescription = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
  }

  private handleSubmenuSlotChange(event: Event) {
    this.submenuPresent = (event.target as HTMLSlotElement).assignedElements({ flatten: true }).length > 0
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('checked') && changed.get('checked') !== undefined) {
      this.dispatchEvent(new CustomEvent('checked-change', { bubbles: true, composed: true, detail: { checked: this.checked, value: this.value } }))
    }
    this.syncAria()
  }

  private syncAria() {
    const role =
      this.authorRole ?? (this.href ? 'menuitem' : this.type === 'checkbox' ? 'menuitemcheckbox' : this.type === 'radio' ? 'menuitemradio' : 'menuitem')
    this.setAttribute('role', role)

    if (this.type === 'checkbox' || this.type === 'radio') this.setAttribute('aria-checked', String(this.checked))
    else this.removeAttribute('aria-checked')

    if (this.hasSubmenu) {
      this.setAttribute('aria-haspopup', 'menu')
      this.setAttribute('aria-expanded', String(this.expanded))
    } else {
      this.removeAttribute('aria-haspopup')
      this.removeAttribute('aria-expanded')
    }

    if (this.disabled) this.setAttribute('aria-disabled', 'true')
    else this.removeAttribute('aria-disabled')

    // The menu assigns the roving tabindex; a disabled row is never a tab stop.
    if (this.disabled) this.tabIndex = -1
    else if (!this.hasAttribute('tabindex')) this.tabIndex = -1
  }

  private renderIndicator() {
    if (this.type === 'item' && !this.reserveIndicator) return nothing
    const glyph =
      this.type === 'radio'
        ? svg`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="5"></circle></svg>`
        : svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"></path></svg>`
    return html`<span class="indicator" ?data-checked=${this.checked}>${this.type === 'item' ? nothing : glyph}</span>`
  }

  private renderSubmenuIcon() {
    return svg`<svg class="submenu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6"></path></svg>`
  }

  private renderInner() {
    return html`
      ${this.renderIndicator()}
      <slot name="prefix-icon"></slot>
      <div class="content">
        <div class="text"><slot>${this.label ?? this.value}</slot></div>
        <div class="description" ?hidden=${!this.hasDescription}>
          <slot name="description" @slotchange=${this.handleDescriptionSlotChange}></slot>
        </div>
      </div>
      <slot name="shortcut"></slot>
      <slot name="suffix-icon">${this.hasSubmenu ? this.renderSubmenuIcon() : nothing}</slot>
    `
  }

  override render() {
    const row =
      this.href && !this.disabled
        ? html`<a
            class="c2-menu-item"
            href=${this.href}
            target=${ifDefined(this.target)}
            rel=${this.target === '_blank' ? 'noopener noreferrer' : nothing}
            tabindex="-1"
            @click=${this.handleClick}
            >${this.renderInner()}</a
          >`
        : html`<div class="c2-menu-item" @click=${this.handleClick}>${this.renderInner()}</div>`

    return html`${row}<slot name="submenu" @slotchange=${this.handleSubmenuSlotChange}></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-menu-item': MenuItem
  }
}
