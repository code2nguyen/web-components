import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { provide } from '@lit/context'
import styles from './tabs.scss?inline'
import { selectedTabContext } from './tab-context'
// Registers `c2-tab` so consumers of the strip alone get the child element too (same pattern as select → list-item).
import './tab'
import type { Tab } from './tab'

const TAB_TAG = 'c2-tab'

/** Detail of the `selection-change` event of {@link Tabs}. */
export interface TabsSelectionChangeEventDetail {
  /** `for` value of the tab that is now selected — the new `selected-tab`. */
  value: string
}

/** Events fired by {@link Tabs}, keyed for `addEventListener`. */
export interface TabsEventMap {
  'selection-change': CustomEvent<TabsSelectionChangeEventDetail>
}

export interface Tabs {
  addEventListener: TypedAddEventListener<Tabs, TabsEventMap>
  removeEventListener: TypedRemoveEventListener<Tabs, TabsEventMap>
}

/**
 * Tab strip that shows one content panel at a time.
 *
 * Light-DOM children are split in two groups: every `<c2-tab for="…">` becomes a tab in the header,
 * every other child is a panel whose `id` matches a tab's `for`. Only the panel of the selected tab is
 * rendered. The header is a `tablist`: Arrow keys, Home and End move between tabs, Enter and Space
 * activate the focused one.
 *
 * The strip assigns its children to its slots itself (manual slot assignment), so neither the tabs nor the
 * panels need a `slot` attribute and none is written on them; a `slot="tab"` already in the markup is
 * harmless. When the shadow root was server-rendered (declarative shadow DOM, which has no manual mode)
 * the strip falls back to writing `slot` on the tabs and the selected panel. The selected tab matches
 * `c2-tab:state(selected)`. Panels without a `role` get `role="tabpanel"` and `aria-labelledby` (and the
 * tab an `id` for it): a plain element has no `ElementInternals`, so write those yourself in
 * server-rendered markup and nothing is added.
 *
 * @tag c2-tabs
 *
 * @slotcomponent c2-tab
 *
 * @slot tab - The `<c2-tab>` children (assigned by the strip; no `slot` attribute needed).
 * @slot tab-content - The panel of the selected tab (assigned by the strip from the child whose `id` matches `selected-tab`; no `slot` attribute needed).
 *
 * @event {CustomEvent<TabsSelectionChangeEventDetail>} selection-change - Fired after the user selects another tab. `detail.value` is the new `selected-tab`. Not fired for programmatic changes. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself rather than on an ancestor.
 *
 * The name matches `c2-list`, `c2-select` and `c2-table`; it is deliberately not `change`, which every native form
 * control bubbles — a `c2-text-field` inside a panel would otherwise reach a listener meant for the tab strip.
 *
 * @cssproperty {box-shadow} [--c2-tabs--box-shadow=inset 0px -2px 0px 0px rgb(213, 213, 213)]
 * @cssproperty {justify-content} [--c2-tabs--justify-content=flex-start]
 * @cssproperty {background-color} --c2-tabs--background-color
 * @cssproperty {pixel} --c2-tabs--height
 * @cssproperty {pixel} --c2-tabs--gap
 * @cssproperty {border-radius} --c2-tabs--border-radius
 * @cssproperty {padding} --c2-tabs--padding-top
 * @cssproperty {padding} --c2-tabs--padding-right
 * @cssproperty {padding} [--c2-tabs--padding-bottom=var(--c2-tabs__indicator--height)]
 * @cssproperty {padding} --c2-tabs--padding-left
 *
 * @cssproperty {pixel} [--c2-tabs__tab--gap=8px] - Space between an icon and the label inside a tab.
 * @cssproperty {flex} --c2-tabs__tab--flex - Set `1 1 0` to make every tab grow to the same width.
 * @cssproperty {justify-content} [--c2-tabs__tab--justify-content=center]
 *
 * @cssproperty {font-weight} --c2-tabs__tab--font-weight
 * @cssproperty {font-size} --c2-tabs__tab--font-size
 * @cssproperty {font-style} --c2-tabs__tab--font-style
 * @cssproperty {font-family} --c2-tabs__tab--font-family
 *
 * @cssproperty {color} [--c2-tabs__indicator--color=rgb(109, 109, 109)]
 * @cssproperty {border-radius} --c2-tabs__indicator--border-radius
 * @cssproperty {pixel} [--c2-tabs__indicator--height=2px]
 * @cssproperty {pixel} [--c2-tabs__indicator--bottom=0px]
 *
 * @cssproperty {padding} [--c2-tabs__tab--padding-top=8px]
 * @cssproperty {padding} [--c2-tabs__tab--padding-right=16px]
 * @cssproperty {padding} [--c2-tabs__tab--padding-bottom=8px]
 * @cssproperty {padding} [--c2-tabs__tab--padding-left=16px]
 *
 * @cssproperty {color} --c2-tabs__tab--color
 * @cssproperty {background-color} --c2-tabs__tab--background-color
 *
 * @cssproperty {border-radius} --c2-tabs__tab--border-top-left-radius
 * @cssproperty {border-radius} --c2-tabs__tab--border-top-right-radius
 * @cssproperty {border-radius} --c2-tabs__tab--border-bottom-left-radius
 * @cssproperty {border-radius} --c2-tabs__tab--border-bottom-right-radius
 *
 * @cssproperty {color} [--c2-tabs__tab__hover--color=rgb(2, 101, 220)]
 * @cssproperty {background-color} --c2-tabs__tab__hover--background-color
 *
 * @cssproperty {color} [--c2-tabs__tab__selected--color=rgb(2, 101, 220)]
 * @cssproperty {background-color} --c2-tabs__tab__selected--background-color
 *
 * @cssproperty {outline} [--c2-tabs__tab__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-tabs__tab__focus--outline-offset=-2px]
 *
 * @cssproperty {opacity} [--c2-tabs__tab__disabled--opacity=0.38]
 */
@customElement('c2-tabs')
export class Tabs extends LitElement {
  static override styles = unsafeCSS(styles)

  // The strip picks its children for each slot itself instead of writing `slot` on them: an attribute written on a
  // child while the page upgrades is one the server never rendered, which React reports as a hydration mismatch.
  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, slotAssignment: 'manual' }

  /** Accessible name for the tab list. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** `for` value of the selected tab (and `id` of the visible panel). Falls back to the first enabled tab. */
  @provide({ context: selectedTabContext })
  @property({ type: String, attribute: 'selected-tab' })
  selectedTab = ''

  @query('.c2-tabs-header')
  private header!: HTMLElement

  @query('slot[name="tab"]')
  private tabsSlot!: HTMLSlotElement

  @query('slot[name="tab-content"]')
  private contentSlot!: HTMLSlotElement

  @state()
  private indicatorStyle = ''

  /** False until the indicator has been placed once: the first placement must not animate. */
  @state()
  private measured = false

  private resizeObserver?: ResizeObserver

  /** Tabs and panels added or removed later are (re)assigned to their slots. */
  private childObserver?: MutationObserver

  override connectedCallback() {
    super.connectedCallback()
    if (!isServer && typeof ResizeObserver !== 'undefined' && !this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => this.updateIndicator())
    }
    if (!isServer) {
      this.childObserver ??= new MutationObserver(() => this.assignSlots())
      this.childObserver.observe(this, { childList: true })
      // A reconnected strip may have missed child changes while it was detached.
      if (this.hasUpdated) this.assignSlots()
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    this.childObserver?.disconnect()
  }

  override firstUpdated() {
    this.assignSlots()
  }

  /**
   * Whether this strip assigns its slots by hand. False only when the shadow root came from declarative shadow DOM
   * (server rendering), which is always in named mode; the strip then falls back to `slot` attributes.
   */
  private get manualSlots(): boolean {
    return (this.renderRoot as ShadowRoot).slotAssignment === 'manual'
  }

  /** Puts every `<c2-tab>` child in the `tab` slot, then re-resolves the visible panel. */
  private assignSlots() {
    if (!this.tabsSlot) return
    const tabs = [...this.children].filter((child) => child.localName === TAB_TAG)
    if (this.manualSlots) {
      // `assign()` fires `slotchange` when the set changes, which runs `handleTabSlotChange`.
      this.tabsSlot.assign(...tabs)
    } else {
      for (const tab of tabs) if (tab.getAttribute('slot') !== 'tab') tab.setAttribute('slot', 'tab')
    }
    this.syncPanels()
  }

  /** Slotted `<c2-tab>` elements, in DOM order. */
  get tabs(): Tab[] {
    return (this.tabsSlot?.assignedElements() ?? []).filter((el): el is Tab => el.localName === TAB_TAG)
  }

  /** Selects a tab and notifies listeners. Ignores unknown or disabled tabs. */
  select(value: string) {
    if (value === this.selectedTab) return
    const tab = this.tabs.find((t) => t.for === value)
    if (!tab || tab.disabled) return
    this.selectedTab = value
    this.dispatchEvent(new CustomEvent<TabsSelectionChangeEventDetail>('selection-change', { detail: { value }, bubbles: false, composed: true }))
  }

  private handleTabChange(event: CustomEvent<string>) {
    const value = event.detail
    // Let every `tab-change` listener up the tree run first so `preventDefault()` can veto the switch.
    queueMicrotask(() => {
      if (!event.defaultPrevented) this.select(value)
    })
  }

  private handleKeydown(event: KeyboardEvent) {
    const tabs = this.tabs.filter((t) => !t.disabled)
    if (tabs.length === 0) return
    const current = tabs.indexOf(event.target as Tab)
    if (current === -1) return

    const rtl = getComputedStyle(this).direction === 'rtl'
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = rtl ? current - 1 : current + 1
        break
      case 'ArrowLeft':
        next = rtl ? current + 1 : current - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = tabs.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    const tab = tabs[(next + tabs.length) % tabs.length]
    tab.focus()
    this.select(tab.for)
  }

  private async handleTabSlotChange() {
    // Tabs may be upgraded after the strip (separate module): wait so `for`/`disabled` are readable.
    await customElements.whenDefined(TAB_TAG)
    const tabs = this.tabs
    await Promise.all(tabs.map((tab) => tab.updateComplete))

    this.resizeObserver?.disconnect()
    if (this.resizeObserver) {
      this.resizeObserver.observe(this.header)
      for (const tab of tabs) this.resizeObserver.observe(tab)
    }

    // No (valid) selection given: adopt the first enabled tab silently.
    if (!this.selectedTab) {
      const first = tabs.find((t) => !t.disabled)
      if (first) this.selectedTab = first.for
    }
    this.syncTabs()
    this.updateIndicator()
  }

  /** Mirrors `selectedTab` onto the tabs (selected state, roving tabindex) and the panels (slot, ARIA). */
  private syncTabs() {
    const tabs = this.tabs
    if (tabs.length === 0) return

    const selected = tabs.find((t) => t.for === this.selectedTab)
    // The focusable tab is the selected one, or the first enabled one when nothing valid is selected.
    const focusable = selected && !selected.disabled ? selected : tabs.find((t) => !t.disabled)
    for (const tab of tabs) {
      tab.selected = tab === selected
      tab.tabIndex = tab === focusable ? 0 : -1
      tab.requestUpdate()
    }
    this.syncPanels()
  }

  /** Shows the panel of the selected tab in `tab-content` and gives it the `tabpanel` semantics it lacks. */
  private syncPanels() {
    if (!this.contentSlot) return
    const selected = this.tabs.find((t) => t.for === this.selectedTab)
    const panel = [...this.children].find((child) => child.localName !== TAB_TAG && !!child.id && child.id === this.selectedTab)

    if (this.manualSlots) {
      const assigned = this.contentSlot.assignedElements()
      if (assigned.length !== (panel ? 1 : 0) || assigned[0] !== panel) this.contentSlot.assign(...(panel ? [panel] : []))
    } else {
      for (const child of this.children) {
        if (child === panel) child.setAttribute('slot', 'tab-content')
        else if (child.localName !== TAB_TAG && child.getAttribute('slot') === 'tab-content') child.removeAttribute('slot')
      }
    }

    // A plain element has no ElementInternals, so these can only be attributes. They are skipped when the author
    // wrote them, which is how server-rendered markup avoids any write.
    if (panel) {
      if (!panel.hasAttribute('role')) panel.setAttribute('role', 'tabpanel')
      if (selected && !panel.hasAttribute('aria-labelledby')) {
        if (!selected.id) selected.id = `${panel.id}-tab`
        panel.setAttribute('aria-labelledby', selected.id)
      }
    }
  }

  private updateIndicator() {
    const tab = this.tabs.find((t) => t.for === this.selectedTab)
    if (!tab || !this.header) {
      this.indicatorStyle = 'width: 0px;'
      return
    }
    const tabRect = tab.getBoundingClientRect()
    const headerRect = this.header.getBoundingClientRect()
    const x = tabRect.left - headerRect.left + this.header.scrollLeft
    this.indicatorStyle = `transform: translateX(${x}px); width: ${tabRect.width}px;`
    if (!this.measured) {
      // Commit the first position without a transition, then enable transitions from the next update on.
      this.updateComplete.then(() => (this.measured = true))
    }
  }

  override willUpdate(changed: PropertyValues<this>) {
    // Selection cleared (attribute removed, `selectedTab = ''`): fall back to the first enabled tab instead of showing nothing.
    if (changed.has('selectedTab') && !this.selectedTab && this.hasUpdated) {
      const first = this.tabs.find((t) => !t.disabled)
      if (first) this.selectedTab = first.for
    }
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('selectedTab')) {
      this.syncTabs()
      this.updateIndicator()
    }
  }

  override render() {
    return html`
      <div class="c2-tabs">
        <div class="c2-tabs-header" role="tablist" aria-label=${this.ariaLabel || nothing} @tab-change=${this.handleTabChange} @keydown=${this.handleKeydown}>
          <slot name="tab" @slotchange=${this.handleTabSlotChange}></slot>
          <div class="selection-indicator ${classMap({ 'first-position': !this.measured })}" style=${this.indicatorStyle}></div>
        </div>
        <slot name="tab-content"></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tabs': Tabs
  }
}
