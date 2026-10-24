import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { live } from 'lit/directives/live.js'
import { ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'
import { assignSlot, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { Menu, Placement } from '@c2n/menu'
import { overflowListMessages } from './messages'
import styles from './overflow-list.scss?inline'

import '@c2n/menu'

export type { Placement }

/** Events fired by {@link OverflowList}, keyed for `addEventListener`. */
export interface OverflowListEventMap {
  'overflow-change': CustomEvent<OverflowListChangeDetail>
}

export interface OverflowListChangeDetail {
  /** Number of children shown in the row (separators not counted). */
  visibleCount: number
  /** Number of children folded into the menu. */
  hiddenCount: number
}

export interface OverflowList {
  addEventListener: TypedAddEventListener<OverflowList, OverflowListEventMap>
  removeEventListener: TypedRemoveEventListener<OverflowList, OverflowListEventMap>
}

/** Slot that holds the folded children, laid out invisibly so they keep reporting their size. */
const HIDDEN_SLOT = 'c2-overflow-list-hidden'

/** Child attributes that change which children fold. */
const LAYOUT_ATTRIBUTES = ['slot', 'data-overflow', 'data-overflow-priority']

/** Child attributes that change only the trigger's name or a menu row. */
const ROW_ATTRIBUTES = [
  'aria-current',
  'selected',
  'toggle',
  'aria-pressed',
  'disabled',
  'aria-disabled',
  'aria-label',
  'data-overflow-label',
  'label',
  'tooltip',
  'title',
]

const isSeparator = (element: Element) => element.localName === 'hr' || element.localName === 'c2-separator' || element.getAttribute('role') === 'separator'

const isPinned = (element: Element) => element.getAttribute('data-overflow') === 'pinned'

const priorityOf = (element: Element) => Number(element.getAttribute('data-overflow-priority')) || 0

const isToggle = (element: Element) => element.hasAttribute('toggle') || element.hasAttribute('aria-pressed')

const isChecked = (element: Element) => element.hasAttribute('selected') || element.getAttribute('aria-pressed') === 'true'

const isDisabled = (element: Element) => element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true'

/** The current page of a navigation, or the selected one of a set of links. */
const isCurrent = (element: Element) => {
  const current = element.getAttribute('aria-current')
  return (current !== null && current !== 'false') || (element.hasAttribute('selected') && !isToggle(element))
}

/** Text of the child's label: its own text and that of children not routed to a named slot (an icon, a badge). */
function textOf(element: Element): string {
  let text = ''
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent
    else if (node instanceof Element && !node.hasAttribute('slot')) text += node.textContent
  }
  return text.replace(/\s+/g, ' ').trim()
}

/** The name a folded child gets in the menu. */
function labelOf(element: Element): string {
  for (const attribute of ['data-overflow-label', 'aria-label', 'label', 'tooltip', 'title']) {
    const value = element.getAttribute(attribute)?.trim()
    if (value) return value
  }
  return textOf(element)
}

/** The icon a folded child shows, if any: its `prefix-icon`, or the content of an icon button. */
function iconSourceOf(element: Element): Element | null {
  let icon =
    element.querySelector(':scope > [slot="prefix-icon"]') ??
    (element.localName === 'c2-icon-button' ? ([...element.children].find((child) => !child.hasAttribute('slot')) ?? null) : null)
  // A framework may wrap the icon in a box that does not render (an Astro island, a `display: contents` span): copy
  // the icon itself, since a copy of the wrapper is not hydrated again.
  while (icon && icon.childElementCount === 1 && getComputedStyle(icon).display === 'contents') icon = icon.firstElementChild
  return icon
}

/**
 * Activates a folded child as a click on it would: the native control inside a component (so a `c2-button` submits
 * and a toggle toggles), otherwise the element itself (so a link navigates).
 */
function activate(element: Element) {
  const inner = element.shadowRoot?.querySelector<HTMLElement>('button, a[href]')
  ;(inner ?? (element as HTMLElement)).click()
}

/**
 * One row of actions or links that never wraps: the children that do not fit fold into a "More" menu at the end (or
 * at the start, with `collapse-from="start"`). The row refits whenever the list is resized, a child's size changes,
 * or children are added and removed, in a single pass over sizes it already knows: folded children stay laid out,
 * invisible and inert, so they keep reporting their size and come back as soon as there is room.
 *
 * The menu is built from the folded children, in document order: each becomes a `c2-menu-item` named after the
 * child (`data-overflow-label`, then `aria-label`, `label`, `tooltip`, `title`, then its text) with a copy of its
 * icon (`prefix-icon`, or the content of a `c2-icon-button`). A disabled child is a disabled row, a toggle
 * (`toggle` or `aria-pressed`) is a checkbox row checked while the child is `selected` or pressed, and activating a row clicks the child itself, so its listeners,
 * form submission and link navigation work unchanged. `hr`, `c2-separator` and `role="separator"` children divide
 * groups in the row and in the menu, and are dropped at either edge. Rows slotted into `menu` are always listed
 * after the folded ones, which keeps the trigger visible.
 *
 * Children are read, never written. `data-overflow="pinned"` keeps a child in the row whatever the room;
 * `data-overflow-priority="<n>"` makes it stay longer than lower-priority children (default 0), ties folding from the
 * collapse edge. `min-visible` keeps that many children even when they overflow, `max-visible` caps them.
 *
 * When the child holding focus folds, focus moves to the trigger, so it is never lost. The trigger is named after
 * the count ("3 more items"), and says "including current item" when a folded child is the current page
 * (`aria-current`) or a selected link (`selected`); the list matches `:state(overflowing)` while something is
 * folded and `:state(current-hidden)` in that second case.
 *
 * Give the list a width: it is a block, so it fills its container (in a flex row set `flex: 1` and `min-width: 0`).
 * The gap between children is part of the fit; margins on the children are not.
 *
 * @tag c2-overflow-list
 *
 * @slot - The children: `c2-button`, `c2-icon-button`, `c2-link-button`, links, any element, and `hr` / `c2-separator` between groups.
 * @slot menu - `c2-menu-item` rows always listed in the menu, after the folded children. Their `menu-select` events bubble as usual.
 * @slot more - Content of the trigger, replacing the ⋯ icon (for example the text "More" and a chevron). The trigger keeps its counted name.
 *
 * @event {CustomEvent<OverflowListChangeDetail>} overflow-change - The number of folded children changed. `detail` has `visibleCount` and `hiddenCount`. Does not bubble.
 *
 * @csspart row - The flex row holding the visible children and the trigger.
 * @csspart more - The trigger, a native button that opens the menu.
 *
 * @cssproperty {pixel} [--c2-overflow-list--gap=8px] - Space between the children and before the trigger, included in the fit.
 * @cssproperty {align-items} [--c2-overflow-list--align-items=center]
 *
 * @cssproperty {pixel} [--c2-overflow-list__more--height=36px]
 * @cssproperty {pixel} [--c2-overflow-list__more--min-width=36px]
 * @cssproperty {padding} [--c2-overflow-list__more--padding-left=8px]
 * @cssproperty {padding} [--c2-overflow-list__more--padding-right=8px]
 * @cssproperty {pixel} [--c2-overflow-list__more--gap=4px] - Space between the parts of slotted `more` content.
 * @cssproperty {border} [--c2-overflow-list__more--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-overflow-list__more--border-radius=6px]
 * @cssproperty {color} [--c2-overflow-list__more--background-color=transparent]
 * @cssproperty {color} [--c2-overflow-list__more--color=#18181b]
 * @cssproperty {font-family} [--c2-overflow-list__more--font-family=inherit]
 * @cssproperty {pixel} [--c2-overflow-list__more--font-size=14px]
 * @cssproperty {font-weight} [--c2-overflow-list__more--font-weight=500]
 * @cssproperty {pixel} [--c2-overflow-list__more--icon-size=18px] - Size of the default ⋯ icon.
 *
 * @cssproperty {color} [--c2-overflow-list__more__hover--background-color=#f4f4f5] - Also the background while the menu is open.
 * @cssproperty {border} [--c2-overflow-list__more__hover--border=1px solid #a1a1aa]
 * @cssproperty {outline} [--c2-overflow-list__more__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-overflow-list__more__focus--outline-offset=2px]
 * @cssproperty {color} [--c2-overflow-list__more__current--color=rgb(2, 101, 220)] - Trigger text while a folded child is the current item.
 * @cssproperty {border} [--c2-overflow-list__more__current--border=1px solid rgb(2, 101, 220)]
 *
 * @cssproperty {font-weight} [--c2-overflow-list__current-item--font-weight=600] - Weight of the menu row of the current item.
 *
 * @cssproperty {color} [--c2-overflow-list__separator--color=#e4e4e7] - Colour of an `hr` child between groups in the row.
 * @cssproperty {margin} [--c2-overflow-list__separator--margin=4px 0]
 *
 * @internalcomponent c2-menu
 * @slotcomponent c2-menu-item
 */
@customElement('c2-overflow-list')
export class OverflowList extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, slotAssignment: 'manual' }

  /** The edge whose children fold first; the trigger sits on that edge. */
  @property({ attribute: 'collapse-from' }) collapseFrom: 'end' | 'start' = 'end'

  /** Children kept in the row even when they do not fit. */
  @property({ type: Number, attribute: 'min-visible' }) minVisible = 0

  /** Most children to show, whatever the room. Unset shows as many as fit. */
  @property({ type: Number, attribute: 'max-visible' }) maxVisible: number | undefined = undefined

  /** Placement of the menu. Defaults to `bottom-end`, or `bottom-start` when collapsing from the start. */
  @property() placement: Placement | undefined = undefined

  /** The children laid out in the row or folded: everything but the `menu` and `more` content, in document order. */
  @state() private entries: Element[] = []
  @state() private menuChildren: Element[] = []
  @state() private moreChildren: Element[] = []
  @state() private folded: ReadonlySet<Element> = new Set()
  /** Whether the row has been fitted once. Until then the trigger stays idle, as the server rendered it. */
  @state() private measured = false

  @query('.more') private trigger?: HTMLButtonElement
  @query('c2-menu') private menu?: Menu

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, overflowListMessages)
  private childObserver?: MutationObserver
  private observedTrigger?: HTMLElement
  private resizeObserver?: ResizeObserver
  private sizes = new WeakMap<Element, number>()
  private rowSources = new WeakMap<Element, Element>()
  private iconCopies = new WeakMap<Element, { from: Element; copy: Element }>()
  private fitQueued = false
  private focusTrigger = false
  private reportedHidden = 0

  constructor() {
    super()
    // A labelled group of controls; an author-set `role` (`toolbar`, `navigation`) wins in the accessibility tree.
    this.internals.role = 'group'
  }

  /** The children currently folded into the menu, in document order (separators not included). */
  get hiddenItems(): Element[] {
    return this.entries.filter((entry) => this.folded.has(entry))
  }

  override connectedCallback() {
    super.connectedCallback()
    this.resizeObserver ??= new ResizeObserver((records) => {
      for (const record of records) this.sizes.set(record.target, record.borderBoxSize?.[0]?.inlineSize ?? record.contentRect.width)
      this.queueFit()
    })
    this.childObserver ??= new MutationObserver(this.handleMutations)
    this.childObserver.observe(this, { childList: true, attributes: true, subtree: true, attributeFilter: [...LAYOUT_ATTRIBUTES, ...ROW_ATTRIBUTES] })
    this.readChildren()
    this.observeShadow()
    // Text measured before a web font arrives is narrower or wider than the final glyphs.
    void document.fonts?.ready.then(() => this.queueFit())
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.childObserver?.disconnect()
    this.resizeObserver?.disconnect()
  }

  override firstUpdated() {
    this.observeShadow()
  }

  /** Watches the room the row has and the trigger's own width (a new trigger when it moves to the other edge). */
  private observeShadow() {
    const sizer = this.renderRoot.querySelector('.sizer')
    if (sizer) this.resizeObserver?.observe(sizer)
    if (this.observedTrigger && this.observedTrigger !== this.trigger) this.resizeObserver?.unobserve(this.observedTrigger)
    this.observedTrigger = this.trigger ?? undefined
    if (this.observedTrigger) this.resizeObserver?.observe(this.observedTrigger)
  }

  /**
   * Re-reads the children when one is added, removed or re-slotted, or changes how it folds; redraws the trigger
   * and the menu rows when a child changes what they show. Changes deeper inside a child are left alone.
   */
  private handleMutations = (records: MutationRecord[]) => {
    let reread = false
    let redraw = false
    for (const record of records) {
      if (record.type === 'childList') reread ||= record.target === this
      else if ((record.target as Element).parentElement === this) {
        if (LAYOUT_ATTRIBUTES.includes(record.attributeName ?? '')) reread = true
        else redraw = true
      }
    }
    if (reread) this.readChildren()
    else if (redraw) this.requestUpdate()
  }

  private readChildren() {
    const entries: Element[] = []
    const menuChildren: Element[] = []
    const moreChildren: Element[] = []
    for (const child of this.children) {
      const slot = child.getAttribute('slot')
      if (slot === 'menu') menuChildren.push(child)
      else if (slot === 'more') moreChildren.push(child)
      else entries.push(child)
    }
    for (const entry of this.entries) if (!entries.includes(entry)) this.resizeObserver?.unobserve(entry)
    for (const entry of entries) this.resizeObserver?.observe(entry)
    const same = (a: Element[], b: Element[]) => a.length === b.length && a.every((element, index) => element === b[index])
    if (!same(entries, this.entries)) this.entries = entries
    if (!same(menuChildren, this.menuChildren)) this.menuChildren = menuChildren
    if (!same(moreChildren, this.moreChildren)) this.moreChildren = moreChildren
    const folded = new Set([...this.folded].filter((entry) => entries.includes(entry)))
    if (folded.size !== this.folded.size) this.folded = folded
    this.queueFit()
  }

  private queueFit() {
    if (this.fitQueued) return
    this.fitQueued = true
    queueMicrotask(() => {
      this.fitQueued = false
      this.fit()
    })
  }

  /** The entries shown in the row when `folded` are in the menu: separators only between two shown children. */
  private shownEntries(folded: ReadonlySet<Element>): Element[] {
    const shown: Element[] = []
    let separator: Element | null = null
    for (const entry of this.entries) {
      if (isSeparator(entry)) {
        if (shown.length && !separator) separator = entry
      } else if (!folded.has(entry)) {
        if (separator) shown.push(separator)
        separator = null
        shown.push(entry)
      }
    }
    return shown
  }

  /** Decides which children fold: none when everything fits, otherwise the fewest, in folding order. */
  private fit() {
    const sizer = this.renderRoot.querySelector<HTMLElement>('.sizer')
    const row = this.renderRoot.querySelector<HTMLElement>('.row')
    // A list that is not laid out (display: none, detached) has no room to measure; keep the last fit.
    if (!sizer || !row || !this.isConnected || sizer.clientWidth === 0) return
    const available = sizer.clientWidth + 0.5
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0
    const triggerWidth = this.trigger ? (this.sizes.get(this.trigger) ?? this.trigger.getBoundingClientRect().width) : 0
    const items = this.entries.filter((entry) => !isSeparator(entry))
    const fromEnd = this.collapseFrom !== 'start'
    const order = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !isPinned(item))
      .sort((a, b) => priorityOf(a.item) - priorityOf(b.item) || (fromEnd ? b.index - a.index : a.index - b.index))
      .map(({ item }) => item)
    const alwaysMenu = this.menuChildren.length > 0
    const limit = this.maxVisible !== undefined && this.maxVisible !== null && this.maxVisible >= 0 ? Math.floor(this.maxVisible) : Infinity
    const floor = Math.max(0, Math.floor(this.minVisible || 0))

    const folded = new Set<Element>()
    const occupied = () => {
      const shown = this.shownEntries(folded)
      let total = shown.reduce((sum, entry) => sum + (this.sizes.get(entry) ?? 0), 0) + gap * Math.max(0, shown.length - 1)
      if (folded.size || alwaysMenu) total += triggerWidth + (shown.length ? gap : 0)
      return total
    }
    for (const item of order) {
      const visible = items.length - folded.size
      if (visible > limit || (visible > floor && occupied() > available)) folded.add(item)
      else break
    }

    this.measured = true
    if (folded.size === this.folded.size && [...folded].every((item) => this.folded.has(item))) return
    const root = this.getRootNode() as Document | ShadowRoot
    const active = root.activeElement
    if (active && [...folded].some((item) => !this.folded.has(item) && (item === active || item.contains(active)))) this.focusTrigger = true
    this.folded = folded
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if ((changed.has('collapseFrom') || changed.has('minVisible') || changed.has('maxVisible')) && this.hasUpdated) this.queueFit()
  }

  protected override updated(changed: PropertyValues) {
    if (changed.has('moreChildren') || changed.has('menuChildren') || changed.has('collapseFrom')) this.observeShadow()
    if ((this.renderRoot as ShadowRoot).slotAssignment !== 'manual') this.assignNamedSlots()
    const hidden = this.folded.size
    const current = this.hiddenItems.some(isCurrent)
    this.toggleState('overflowing', hidden > 0)
    this.toggleState('current-hidden', current)
    if (this.focusTrigger) {
      this.focusTrigger = false
      this.trigger?.focus()
    }
    if (hidden === this.reportedHidden) return
    this.reportedHidden = hidden
    const visibleCount = this.entries.filter((entry) => !isSeparator(entry)).length - hidden
    this.dispatchEvent(new CustomEvent<OverflowListChangeDetail>('overflow-change', { detail: { visibleCount, hiddenCount: hidden } }))
  }

  private toggleState(name: string, on: boolean) {
    if (on) this.internals.states.add(name)
    else this.internals.states.delete(name)
  }

  /**
   * A declarative shadow root (server rendering) is always in named mode, where `assign()` has no effect: route the
   * folded children by `slot` attribute instead, touching only the attribute this list wrote.
   */
  private assignNamedSlots() {
    const shown = new Set(this.shownEntries(this.folded))
    for (const entry of this.entries) {
      // Setting an attribute to the value it has is still a mutation, which would re-read the children in a loop.
      if (!shown.has(entry)) {
        if (entry.getAttribute('slot') !== HIDDEN_SLOT) entry.setAttribute('slot', HIDDEN_SLOT)
      } else if (entry.getAttribute('slot') === HIDDEN_SLOT) entry.removeAttribute('slot')
    }
  }

  private handleMenuSelect = (event: Event) => {
    const source = this.rowSources.get(event.target as Element)
    // A `menu` row is the author's: its event goes on as it is.
    if (!source) return
    event.stopPropagation()
    // After the menu has closed and handed focus back to the trigger.
    queueMicrotask(() => activate(source))
  }

  private handleMenuClick = (event: Event) => {
    // A click on a generated row stands in for one on the folded child, which receives its own click.
    if (event.composedPath().some((target) => target instanceof Element && this.rowSources.has(target))) event.stopPropagation()
  }

  private handleMenuToggle = (event: Event) => {
    if (event.target !== this.menu) return
    // Icons may have changed inside their elements since the rows were drawn: copy them again.
    if ((event as ToggleEvent).newState !== 'open') return
    this.iconCopies = new WeakMap()
    this.requestUpdate()
  }

  private iconFor(item: Element) {
    const from = iconSourceOf(item)
    if (!from) return nothing
    let cached = this.iconCopies.get(item)
    if (!cached || cached.from !== from) {
      const copy = from.cloneNode(true) as Element
      copy.removeAttribute('slot')
      cached = { from, copy }
      this.iconCopies.set(item, cached)
    }
    return html`<span slot="prefix-icon" class="row-icon">${cached.copy}</span>`
  }

  private renderRow(item: Element) {
    const toggle = isToggle(item)
    return html`<c2-menu-item
      class=${classMap({ folded: true, current: isCurrent(item) })}
      type=${toggle ? 'checkbox' : 'item'}
      .checked=${live(toggle && isChecked(item))}
      ?disabled=${isDisabled(item)}
      aria-current=${isCurrent(item) ? 'true' : nothing}
      ${ref((row) => row && this.rowSources.set(row, item))}
      >${this.iconFor(item)}${labelOf(item)}</c2-menu-item
    >`
  }

  /** The folded children as menu rows, with a separator wherever the row had one between two of them. */
  private renderRows() {
    const rows: Array<{ key: Element; separator: boolean }> = []
    let separator: Element | null = null
    for (const entry of this.entries) {
      if (isSeparator(entry)) {
        if (rows.length && !separator) separator = entry
      } else if (this.folded.has(entry)) {
        if (separator) rows.push({ key: separator, separator: true })
        separator = null
        rows.push({ key: entry, separator: false })
      }
    }
    return repeat(
      rows,
      (row) => row.key,
      (row) => (row.separator ? html`<hr />` : this.renderRow(row.key)),
    )
  }

  override render() {
    const shown = this.shownEntries(this.folded)
    const shownSet = new Set(shown)
    const parked = this.entries.filter((entry) => !shownSet.has(entry))
    const hidden = this.hiddenItems
    const fromStart = this.collapseFrom === 'start'
    const active = this.measured && (hidden.length > 0 || this.menuChildren.length > 0)
    const name = hidden.length
      ? hidden.some(isCurrent)
        ? this.msg.t('moreItemsCurrent', hidden.length)
        : this.msg.t('moreItems', hidden.length)
      : this.msg.t('more')
    const more = html`<c2-menu
      class=${classMap({ 'more-menu': true, idle: !active })}
      placement=${this.placement ?? (fromStart ? 'bottom-start' : 'bottom-end')}
      aria-label=${this.msg.t('more')}
      ?disabled=${!active}
      @menu-select=${this.handleMenuSelect}
      @click=${this.handleMenuClick}
      @toggle=${this.handleMenuToggle}
    >
      <button slot="trigger" class="more" part="more" type="button" aria-label=${name} tabindex=${active ? nothing : '-1'}>
        <slot name="more" ${assignSlot(this.moreChildren)}>
          ${svg`<svg class="more-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.75"></circle><circle cx="12" cy="12" r="1.75"></circle><circle cx="19" cy="12" r="1.75"></circle></svg>`}
        </slot>
      </button>
      ${this.renderRows()} ${hidden.length && this.menuChildren.length ? html`<hr />` : nothing}
      <slot name="menu" ${assignSlot(this.menuChildren)}></slot>
    </c2-menu>`
    return html`
      <div class="sizer"></div>
      <div class="row" part="row">${fromStart ? more : nothing}<slot ${assignSlot(shown)}></slot>${fromStart ? nothing : more}</div>
      <div class="measure" aria-hidden="true" inert>
        <div class="measure-row"><slot name=${HIDDEN_SLOT} ${assignSlot(parked)}></slot></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-overflow-list': OverflowList
  }
}
