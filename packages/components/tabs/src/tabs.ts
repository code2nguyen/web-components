import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { assignSlot, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { repeat } from 'lit/directives/repeat.js'
import { classMap } from 'lit/directives/class-map.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { tabsMessages } from './messages'
import { provide } from '@lit/context'
import styles from './tabs.scss?inline'
import { selectedTabContext } from './tab-context'
// Registers `c2-tab` so consumers of the strip alone get the child element too (same pattern as select → list-item).
import './tab'
import type { Tab } from './tab'

const TAB_TAG = 'c2-tab'

/** Slot of the tabs folded into the menu (`overflow="menu"`), laid out invisibly so they keep reporting their width. */
const FOLDED_SLOT = 'c2-tabs-folded'

/** The menu is loaded the first time a strip folds tabs, so a strip that never does pays nothing for it. */
let menuModule: Promise<unknown> | undefined
const loadMenu = () => (menuModule ??= import('@c2n/menu'))

/** Window event a strip with a `sync-key` fires when the user picks a tab, so the other strips of its group follow. */
const SYNC_EVENT = 'c2-tabs-sync'

/** `localStorage` key prefix under which a `sync-key` group remembers the label of its last pick. */
const SYNC_STORE = 'c2n-tabs:'

interface TabsSyncDetail {
  key: string
  label: string
  source: Tabs
}

/**
 * What a `sync-key` group matches tabs by: the label, which the same choice shares across groups (`npm`, `pnpm`). An
 * explicit `label` or `aria-label` wins over the text, which may hold a badge; the text's whitespace is collapsed.
 */
const syncLabel = (tab: Tab) => tab.label || tab.getAttribute('aria-label') || tab.textContent?.replace(/\s+/g, ' ').trim() || ''

/** Element reflection lets a panel wrapper in the shadow root be labelled by its tab in the light DOM. */
const canReferenceElements = typeof Element !== 'undefined' && 'ariaLabelledByElements' in Element.prototype

/**
 * What the strip does when its tabs are wider than it: `visible` (default) lets them run past its edge, `scroll` scrolls
 * the tab list sideways, `menu` folds the tabs that do not fit into a "More" menu.
 */
export type TabsOverflow = 'visible' | 'scroll' | 'menu'

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
 * shown. The header is a `tablist`: Arrow keys, Home and End move between tabs, Enter and Space
 * activate the focused one.
 *
 * The strip assigns its children to its slots itself (manual slot assignment), so neither the tabs nor the
 * panels need a `slot` attribute and none is written on them; a `slot="tab"` already in the markup is
 * harmless. Each panel sits in a wrapper of the shadow root; the shown one carries `role="tabpanel"` and is
 * labelled by its tab, and the others are `hidden="until-found"`: the browser's find-in-page (and a
 * text-fragment link) still finds the text of every enabled tab and selects that tab, firing
 * `selection-change` as a click does. Where `until-found` is unsupported the other panels are simply hidden.
 * A panel that carries its own `role` keeps it and the wrapper adds none. Without element reflection
 * (`ariaLabelledByElements`), the selected panel gets `role="tabpanel"` and `aria-labelledby` itself (and the
 * tab an `id` for it), unless the author wrote them.
 *
 * A strip with more tabs than room (six tabs on a phone) sets `overflow="scroll"`: the tab list scrolls sideways, the
 * selected tab is scrolled into view whenever it changes, the arrow keys reach every tab, and an edge fades out on a
 * side where tabs are hidden (`--c2-tabs__fade--width`), as in `c2-tab-nav`. The scrollbar is hidden unless `--c2-tabs--scrollbar-width`
 * says otherwise.
 *
 * `overflow="menu"` folds instead: the tabs that do not fit, from the end, go into a "More" menu after the strip, and
 * the selected tab never folds. Picking a tab from the menu selects it (through the same cancelable `tab-change` as a
 * click) and brings it back into the strip in place of another; the arrow keys, Home and End move onto folded tabs the
 * same way. Tabs keep their natural width in this mode (`--c2-tabs__tab--flex` does not stretch them). Style the
 * trigger through `--c2-tabs__more--*` or its `more` part. If `c2-menu` cannot be loaded, the strip scrolls instead. A server-rendered strip, which cannot
 * move its tabs between slots, scrolls instead.
 *
 * Strips that share a `sync-key` move together: picking a tab in one selects the tab with the same label in every
 * other strip of the page with that key (a package manager, a language), and the choice is remembered in
 * `localStorage` and restored when the page loads again. That is how a set of code blocks keeps one switcher.
 *
 * When the shadow root was server-rendered (declarative shadow DOM, which has no manual mode) the strip falls
 * back to writing `slot` on the tabs and the selected panel, and only that panel is rendered. The selected tab
 * matches `c2-tab:state(selected)`.
 *
 * @tag c2-tabs
 *
 * @slotcomponent c2-tab
 *
 * @csspart more - The trigger of the menu of folded tabs (`overflow="menu"`), a native button.
 *
 * @slot tab - The `<c2-tab>` children (assigned by the strip; no `slot` attribute needed).
 * @slot tab-content - The panel of the selected tab, in a server-rendered shadow root only (assigned from the child whose `id` matches `selected-tab`). Otherwise each panel is assigned to a wrapper of its own; no `slot` attribute is needed either way.
 *
 * @event {CustomEvent<TabsSelectionChangeEventDetail>} selection-change - Fired after the user selects another tab, including when this strip follows a pick made in another strip of its `sync-key` group. `detail.value` is the new `selected-tab`. Not fired for programmatic changes, nor when a remembered choice is restored. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself rather than on an ancestor.
 *
 * The name matches `c2-list`, `c2-select` and `c2-table`; it is deliberately not `change`, which every native form
 * control bubbles — a `c2-text-field` inside a panel would otherwise reach a listener meant for the tab strip.
 *
 * @cssproperty {box-shadow} [--c2-tabs--box-shadow=inset 0px -2px 0px 0px rgb(213, 213, 213)]
 * @cssproperty {justify-content} [--c2-tabs--justify-content=flex-start]
 * @cssproperty {background-color} --c2-tabs--background-color
 * @cssproperty {pixel} --c2-tabs--height
 * @cssproperty {pixel} --c2-tabs--gap
 * @cssproperty {scrollbar-width} [--c2-tabs--scrollbar-width=none] - Scrollbar of a strip with `overflow="scroll"`: `thin` or `auto` shows one, which a mouse without a horizontal wheel can drag.
 * @cssproperty {pixel} [--c2-tabs__more--gap=4px] - Space between the trigger's text and its chevron.
 * @cssproperty {color} --c2-tabs__more--color - Text of the "More" trigger; the tabs' colour by default.
 * @cssproperty {color} --c2-tabs__more__hover--color
 * @cssproperty {color} --c2-tabs__more__hover--background-color
 * @cssproperty {outline} [--c2-tabs__more__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-tabs__fade--width=32px] - Width of the fade at an edge of a scrolling strip where tabs are hidden; a scrolled-to tab stays this far from the edge.
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

  /**
   * Name of a group of strips that switch together. Picking a tab selects the tab with the same label (its `label`,
   * else its `aria-label`, else its text) in every strip of the page with this key, and the label is remembered in
   * `localStorage` under `c2n-tabs:<sync-key>`, so the strip opens on it on the next visit. A strip that has no tab with
   * that label keeps its own. A remembered choice is applied once the tabs are slotted, in place of `selected-tab`.
   */
  @property({ type: String, attribute: 'sync-key' })
  syncKey = ''

  /**
   * What happens when the tabs are wider than the strip. `visible` (default): they run past its edge. `scroll`: the
   * tab list scrolls sideways, keeps the selected tab in view and fades the edges where tabs are hidden. `menu`: the
   * tabs that do not fit fold into a "More" menu after the strip; the selected tab stays.
   */
  @property({ reflect: true }) overflow: TabsOverflow = 'visible'

  /** Whether the remembered `sync-key` choice has been looked up. */
  private restored = false

  @query('.c2-tabs-header')
  private header!: HTMLElement

  @query('slot[name="tab"]')
  private tabsSlot!: HTMLSlotElement

  @query(`slot[name="${FOLDED_SLOT}"]`)
  private foldedSlot?: HTMLSlotElement

  @query('.more')
  private trigger?: HTMLButtonElement

  /** Tabs folded into the menu (`overflow="menu"`), in document order. */
  @state() private folded: Tab[] = []

  /** Whether `c2-menu` has been loaded; the trigger is drawn from then on. */
  @state() private menuReady = false

  /** `c2-menu` could not be loaded (offline, a blocked chunk): the strip scrolls instead of folding. */
  @state() private menuFailed = false

  /** Tabs, the strip and the trigger being measured: observing one again would report it again. */
  private observed = new Set<Element>()

  private readonly msg = new LocalizeController(this, tabsMessages)
  private widths = new WeakMap<Element, number>()
  private fitQueued = false

  @query('slot[name="tab-content"]')
  private contentSlot!: HTMLSlotElement

  @query('.selection-indicator')
  private indicator?: HTMLElement

  /**
   * False until the indicator has been placed once: the first placement must not animate. The indicator is placed by
   * writing its style directly, not through reactive state: it is measured in `updated`, and a state change there
   * would schedule a second render for every selection.
   */
  private measured = false

  private resizeObserver?: ResizeObserver

  /** Panels, one wrapper each (manual slot assignment only; a server-rendered root uses the `tab-content` slot). */
  @state()
  private panels: Element[] = []

  /** Tabs and panels added or removed later are (re)assigned to their slots. */
  private childObserver?: MutationObserver

  override connectedCallback() {
    super.connectedCallback()
    if (!isServer && typeof ResizeObserver !== 'undefined' && !this.resizeObserver) {
      this.resizeObserver = new ResizeObserver((records) => {
        let stripResized = false
        for (const record of records) {
          const width = record.borderBoxSize?.[0]?.inlineSize ?? record.contentRect.width
          if (record.target === this.header && width !== this.widths.get(record.target)) stripResized = true
          this.widths.set(record.target, width)
        }
        if (this.folding) this.queueFit()
        this.updateIndicator()
        // Only when the strip itself changed width: a tab or font settling must not undo a scroll the user made.
        if (stripResized) this.revealSelected()
        this.updateScrollEdges()
      })
    }
    if (!isServer) {
      this.childObserver ??= new MutationObserver(() => this.assignSlots())
      this.childObserver.observe(this, { childList: true })
      // A reconnected strip may have missed child changes while it was detached.
      if (this.hasUpdated) this.assignSlots()
      window.addEventListener(SYNC_EVENT, this.handleSync)
    }
  }

  constructor() {
    super()
    // On the host rather than the strip: a folded tab sits outside the strip, and the menu fires its `tab-change` too.
    this.addEventListener('tab-change', this.handleTabChange)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    if (!isServer) window.removeEventListener(SYNC_EVENT, this.handleSync)
    this.resizeObserver?.disconnect()
    this.observed.clear()
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
    return (this.renderRoot as ShadowRoot | undefined)?.slotAssignment === 'manual'
  }

  /** Puts every `<c2-tab>` child in the `tab` slot, then re-resolves the visible panel. */
  private assignSlots() {
    if (!this.tabsSlot) return
    const tabs = [...this.children].filter((child) => child.localName === TAB_TAG)
    if (this.manualSlots) {
      // `assign()` fires `slotchange` when the set changes, which runs `handleTabSlotChange`.
      this.assignTabs(tabs)
      if (this.folding) this.queueFit()
    } else {
      for (const tab of tabs) if (tab.getAttribute('slot') !== 'tab') tab.setAttribute('slot', 'tab')
    }
    this.syncPanels()
  }

  /** Puts the shown tabs in the strip and the folded ones in the measuring slot. */
  private assignTabs(tabs: Element[] = [...this.children].filter((child) => child.localName === TAB_TAG)) {
    const folded = new Set<Element>(this.folded)
    const shown = tabs.filter((tab) => !folded.has(tab))
    const same = (slot: HTMLSlotElement | undefined, list: Element[]) => {
      const current = slot?.assignedElements() ?? []
      return current.length === list.length && current.every((element, index) => element === list[index])
    }
    if (!same(this.tabsSlot, shown)) this.tabsSlot.assign(...shown)
    if (this.foldedSlot && !same(this.foldedSlot, [...folded])) this.foldedSlot.assign(...tabs.filter((tab) => folded.has(tab)))
  }

  /** The `<c2-tab>` children, in DOM order, whether shown in the strip or folded into the menu. */
  get tabs(): Tab[] {
    if (!this.tabsSlot) return []
    return [...this.children].filter((el): el is Tab => el.localName === TAB_TAG && (el.assignedSlot !== null || el.getAttribute('slot') === 'tab'))
  }

  /** Whether this strip folds tabs into a menu: `overflow="menu"` with manual slot assignment (not server-rendered). */
  private get folding(): boolean {
    return this.overflow === 'menu' && this.manualSlots && !this.menuFailed
  }

  /** Whether the tab list scrolls: `overflow="scroll"`, or `menu` in a server-rendered strip, which cannot fold. */
  private get scrolling(): boolean {
    return this.overflow === 'scroll' || (this.overflow === 'menu' && (!this.manualSlots || this.menuFailed))
  }

  /** Refits on the next frame: refitting inside a resize observer callback would resize what it observes. */
  private queueFit() {
    if (this.fitQueued) return
    this.fitQueued = true
    requestAnimationFrame(() => {
      this.fitQueued = false
      this.fit()
    })
  }

  /**
   * Folds the fewest tabs, from the end, so the rest and the trigger fit the strip. The selected tab never folds.
   * Widths come from the resize observer (folded tabs keep their natural width in the measuring slot).
   */
  private fit() {
    const bar = this.renderRoot.querySelector<HTMLElement>('.c2-tabs-bar')
    const header = this.header
    if (!this.folding || !bar || !header || !this.isConnected || bar.clientWidth === 0) {
      if (!this.folding && this.folded.length) this.setFolded([])
      return
    }
    const style = getComputedStyle(header)
    const gap = parseFloat(style.columnGap) || 0
    const available = bar.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) + 0.5
    const width = (element: Element) => this.widths.get(element) ?? element.getBoundingClientRect().width
    const tabs = [...this.children].filter((child): child is Tab => child.localName === TAB_TAG)
    const trigger = this.trigger ? width(this.trigger) : 0
    const folded = new Set<Tab>()
    const occupied = () => {
      const shown = tabs.filter((tab) => !folded.has(tab))
      const total = shown.reduce((sum, tab) => sum + width(tab), 0) + gap * Math.max(0, shown.length - 1)
      return folded.size ? total + trigger : total
    }
    for (const tab of [...tabs].reverse()) {
      if (occupied() <= available) break
      if (tab.for !== this.selectedTab) folded.add(tab)
    }
    this.setFolded(tabs.filter((tab) => folded.has(tab)))
  }

  private setFolded(folded: Tab[]) {
    if (folded.length === this.folded.length && folded.every((tab, index) => tab === this.folded[index])) return
    if (folded.length && !this.menuReady) {
      loadMenu().then(
        () => (this.menuReady = true),
        () => {
          // Folded tabs would be out of reach without the menu: give them back and scroll instead. A later fold retries.
          menuModule = undefined
          this.menuFailed = true
          this.setFolded([])
        },
      )
    }
    this.folded = folded
    this.assignTabs()
    this.updateIndicator()
  }

  /** Selects a tab and notifies listeners. Ignores unknown or disabled tabs. */
  select(value: string) {
    const tab = this.pick(value)
    const label = tab && this.syncKey ? syncLabel(tab) : ''
    if (!label) return
    try {
      localStorage.setItem(SYNC_STORE + this.syncKey, label)
    } catch {
      // Storage blocked (private mode, a sandboxed frame): the group still switches together on this page.
    }
    window.dispatchEvent(new CustomEvent<TabsSyncDetail>(SYNC_EVENT, { detail: { key: this.syncKey, label, source: this } }))
  }

  /** Selects a tab and fires `selection-change`; returns the tab when the selection changed. */
  private pick(value: string): Tab | undefined {
    if (value === this.selectedTab) return
    const tab = this.tabs.find((t) => t.for === value)
    if (!tab || tab.disabled) return
    this.selectedTab = value
    this.dispatchEvent(new CustomEvent<TabsSelectionChangeEventDetail>('selection-change', { detail: { value }, bubbles: false, composed: true }))
    return tab
  }

  /** Another strip of the page picked a tab: follow it when it is in this strip's group and this strip has that label. */
  private handleSync = (event: Event) => {
    const { key, label, source } = (event as CustomEvent<TabsSyncDetail>).detail
    if (source === this || !this.syncKey || key !== this.syncKey) return
    const tab = this.tabs.find((t) => !t.disabled && syncLabel(t) === label)
    if (tab) this.pick(tab.for)
  }

  /** Selects the tab of the choice its `sync-key` group remembers, once, silently. */
  private restoreSync(tabs: Tab[]) {
    if (!this.syncKey || this.restored || tabs.length === 0) return
    this.restored = true
    let label: string | null = null
    try {
      label = localStorage.getItem(SYNC_STORE + this.syncKey)
    } catch {
      return
    }
    const tab = label ? tabs.find((t) => !t.disabled && syncLabel(t) === label) : undefined
    if (tab) this.selectedTab = tab.for
  }

  private handleTabChange = (event: Event) => {
    // Only this strip's own tabs: a strip nested in a panel reports its tabs through the same bubbling event.
    if ((event.target as Element).parentElement !== this || (event.target as Element).localName !== TAB_TAG) return
    const value = (event as CustomEvent<string>).detail
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
    if (this.folded.includes(tab)) {
      // A folded tab comes back into the strip once selected; focus it there.
      this.select(tab.for)
      void this.updateComplete.then(() => tab.focus())
      return
    }
    tab.focus()
    this.select(tab.for)
  }

  /** A tab picked from the menu: the same cancelable `tab-change` as a click on it, then focus on it in the strip. */
  private handleMenuSelect = (event: Event) => {
    event.stopPropagation()
    const value = (event as CustomEvent<{ value: string }>).detail.value
    const tab = this.folded.find((t) => t.for === value)
    if (!tab || tab.disabled) return
    tab.dispatchEvent(new CustomEvent('tab-change', { bubbles: true, cancelable: true, detail: tab.for }))
    // After the menu has closed (and handed focus back to its trigger) and the strip has refitted.
    setTimeout(() => {
      if (this.selectedTab === tab.for) void this.updateComplete.then(() => tab.focus())
    })
  }

  private async handleTabSlotChange() {
    // Tabs may be upgraded after the strip (separate module): wait so `for`/`disabled` are readable.
    await customElements.whenDefined(TAB_TAG)
    const tabs = this.tabs
    await Promise.all(tabs.map((tab) => tab.updateComplete))

    this.observe([this.header, ...tabs])
    this.observeBar()

    this.restoreSync(tabs)
    // No (valid) selection given: adopt the first enabled tab silently.
    if (!this.selectedTab) {
      const first = tabs.find((t) => !t.disabled)
      if (first) this.selectedTab = first.for
    }
    this.syncTabs()
    this.updateIndicator()
    // The panel wrappers read the tabs' `disabled`, which an upgrade or a slot change may have changed.
    this.requestUpdate()
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

  /**
   * Updates `panels` (the children named by a tab, each rendered in a wrapper of its own) when the set changed. Called
   * from `willUpdate` so a render already has them, and from the child observer between renders.
   */
  private collectPanels() {
    const names = new Set([...this.children].filter((child) => child.localName === TAB_TAG).map((tab) => tab.getAttribute('for')))
    const panels = [...this.children].filter((child) => child.localName !== TAB_TAG && !!child.id && names.has(child.id))
    if (panels.length !== this.panels.length || panels.some((child, index) => child !== this.panels[index])) this.panels = panels
  }

  /** Shows the panel of the selected tab and gives the panels the `tabpanel` semantics they lack. */
  private syncPanels() {
    if (!this.contentSlot) return
    const selected = this.tabs.find((t) => t.for === this.selectedTab)
    const panel = [...this.children].find((child) => child.localName !== TAB_TAG && !!child.id && child.id === this.selectedTab)

    if (this.manualSlots) {
      // Every child named by a tab gets a wrapper of its own (rendered from `panels`), so the hidden ones stay findable.
      this.collectPanels()
      if (this.contentSlot.assignedElements().length) this.contentSlot.assign()
      if (canReferenceElements) return
    } else {
      for (const child of this.children) {
        if (child === panel) child.setAttribute('slot', 'tab-content')
        else if (child.localName !== TAB_TAG && child.getAttribute('slot') === 'tab-content') child.removeAttribute('slot')
      }
    }

    // A plain element has no ElementInternals, so these can only be attributes. They are skipped when the author
    // wrote them, which is how server-rendered markup avoids any write.
    if (panel) {
      // modern-web-ignore: aria-attribute-on-other-element fallback only (no manual slot assignment or no element references); skipped when the author wrote it
      if (!panel.hasAttribute('role')) panel.setAttribute('role', 'tabpanel')
      if (selected && !panel.hasAttribute('aria-labelledby')) {
        if (!selected.id) selected.id = `${panel.id}-tab`
        // modern-web-ignore: aria-attribute-on-other-element same fallback path; the modern path wraps each panel in a shadow element with ariaLabelledByElements
        panel.setAttribute('aria-labelledby', selected.id)
      }
    }
  }

  /**
   * Find-in-page matched text in a hidden panel: select its tab the way a click does, through a cancelable
   * `tab-change`. A vetoed switch hides the panel again once the browser has revealed it.
   */
  private handleBeforeMatch(event: Event) {
    const wrapper = event.currentTarget as HTMLElement
    const tab = this.tabs.find((t) => t.for === wrapper.dataset.panel)
    if (!tab || tab.disabled) {
      // A tab disabled since the last render (c2-tab reports no change) left its panel findable. The browser reveals
      // it right after this event: hide it again, unfindable now, and re-render so the wrappers match the tabs.
      requestAnimationFrame(() => {
        if (wrapper.dataset.panel !== this.selectedTab) wrapper.setAttribute('hidden', '')
        this.requestUpdate()
      })
      return
    }
    const change = new CustomEvent('tab-change', { bubbles: true, cancelable: true, detail: tab.for })
    tab.dispatchEvent(change)
    requestAnimationFrame(() => {
      if (change.defaultPrevented && tab.for !== this.selectedTab) wrapper.setAttribute('hidden', 'until-found')
    })
  }

  private renderPanel(panel: Element) {
    const tab = this.tabs.find((t) => t.getAttribute('for') === panel.id)
    const selected = panel.id === this.selectedTab
    // The panel of a disabled tab is not findable: find-in-page could not select it.
    const hidden = selected ? nothing : tab && !tab.disabled ? 'until-found' : ''
    // Only the shown wrapper is a tabpanel: a hidden one would still be an (empty) tabpanel in some accessibility trees.
    const labelled = selected && canReferenceElements && !panel.hasAttribute('role')
    return html`<div
      class="c2-tabs-panel"
      data-panel=${panel.id}
      role=${labelled ? 'tabpanel' : nothing}
      .ariaLabelledByElements=${labelled && tab ? [tab] : null}
      hidden=${hidden}
      @beforematch=${this.handleBeforeMatch}
    >
      <slot ${assignSlot([panel])}></slot>
    </div>`
  }

  private updateIndicator() {
    const indicator = this.indicator
    if (!indicator) return
    const tab = this.tabs.find((t) => t.for === this.selectedTab)
    if (!tab || !this.header) {
      indicator.style.transform = ''
      indicator.style.width = '0px'
      return
    }
    const tabRect = tab.getBoundingClientRect()
    const headerRect = this.header.getBoundingClientRect()
    const x = tabRect.left - headerRect.left + this.header.scrollLeft
    indicator.style.transform = `translateX(${x}px)`
    indicator.style.width = `${tabRect.width}px`
    if (!this.measured) {
      this.measured = true
      // Commit the first position without a transition, then enable transitions from the next frame on.
      requestAnimationFrame(() => indicator.classList.remove('first-position'))
    }
  }

  override willUpdate(changed: PropertyValues<this>) {
    // A newly selected tab may be folded: refit before rendering, so it is in the strip before anything focuses it,
    // and the change of `folded` joins this update rather than scheduling another.
    if (changed.has('selectedTab') && this.folding && this.hasUpdated) this.fit()
    // Collected before rendering, not in `updated`: a state change there would schedule a second update every time.
    if (!isServer && this.manualSlots) this.collectPanels()
    // Selection cleared (attribute removed, `selectedTab = ''`): fall back to the first enabled tab instead of showing nothing.
    if (changed.has('selectedTab') && !this.selectedTab && this.hasUpdated) {
      const first = this.tabs.find((t) => !t.disabled)
      if (first) this.selectedTab = first.for
    }
  }

  /**
   * Measures `targets` from now on, and stops measuring the observed elements no longer in the strip, the bar or the
   * tabs. An element already observed is left alone: observing it again would report it again, and every report runs a fit.
   */
  private observe(targets: (Element | null | undefined)[], replace = true) {
    const observer = this.resizeObserver
    if (!observer) return
    const wanted = new Set(targets.filter((target): target is Element => !!target))
    for (const target of wanted) if (!this.observed.has(target)) observer.observe(target)
    if (replace) {
      const keep = new Set([...wanted, ...this.renderRoot.querySelectorAll('.c2-tabs-bar, .more')])
      for (const target of this.observed) if (!keep.has(target)) observer.unobserve(target)
      this.observed = new Set([...this.observed].filter((target) => keep.has(target)))
    }
    for (const target of wanted) this.observed.add(target)
  }

  /** The room of a folding strip and the trigger's width, both re-measured when they change. */
  private observeBar() {
    this.observe([this.renderRoot.querySelector('.c2-tabs-bar'), this.trigger], false)
  }

  override updated(changed: PropertyValues<this>) {
    const values = changed as PropertyValues
    if (changed.has('overflow') || values.has('menuReady') || values.has('menuFailed')) {
      // Entering or leaving `menu` rebuilds the strip, whose new slot has nothing assigned yet, and a new indicator.
      if (this.manualSlots) this.assignTabs()
      if (changed.has('overflow') && changed.get('overflow') !== undefined) this.measured = false
      this.observe([this.header, ...this.tabs])
      this.observeBar()
      this.queueFit()
    }
    if (changed.has('selectedTab')) {
      this.syncTabs()
      this.updateIndicator()
      this.revealSelected()
    }
    if (changed.has('overflow')) {
      this.revealSelected()
      this.updateScrollEdges()
    }
  }

  /**
   * Scrolls a scrolling strip so the selected tab is wholly in view, `--c2-tabs__fade--width` (the scroll padding) away
   * from either edge. Only the tab list moves: unlike `scrollIntoView`, the page never scrolls. The scroll is instant,
   * as in `c2-tab-nav`: a smooth programmatic scroll is an animation the browser may cut short (it did in a
   * right-to-left strip in CI), and nothing would finish it.
   */
  private revealSelected() {
    const header = this.header
    if (!this.scrolling || !header) return
    const tab = this.tabs.find((t) => t.for === this.selectedTab)
    if (!tab) return
    const strip = header.getBoundingClientRect()
    const box = tab.getBoundingClientRect()
    const style = getComputedStyle(header)
    const padStart = parseFloat(style.scrollPaddingLeft) || 0
    const padEnd = parseFloat(style.scrollPaddingRight) || 0
    let delta = 0
    if (box.left < strip.left + padStart) delta = box.left - strip.left - padStart
    else if (box.right > strip.right - padEnd) delta = Math.min(box.right - strip.right + padEnd, box.left - strip.left - padStart)
    if (Math.abs(delta) < 1) return
    header.scrollLeft += delta
  }

  /**
   * Marks the edges of a scrolling strip behind which tabs are hidden, for the fades. Classes on the strip inside the
   * shadow root, written directly: this runs on every scroll frame and must not schedule a render.
   */
  private updateScrollEdges = () => {
    const header = this.header
    if (!header) return
    const scrolling = this.scrolling
    // In a right-to-left strip `scrollLeft` runs from 0 down to negative values, so its magnitude is the distance from the start.
    const fromStart = Math.abs(header.scrollLeft)
    const room = header.scrollWidth - header.clientWidth
    header.classList.toggle('overflow-start', scrolling && fromStart > 1)
    header.classList.toggle('overflow-end', scrolling && room - fromStart > 1)
  }

  private renderHeader() {
    return html`<div
      class=${classMap({ 'c2-tabs-header': true, scrolling: this.scrolling, folding: this.overflow === 'menu' && !this.scrolling })}
      role="tablist"
      aria-label=${this.ariaLabel || nothing}
      @keydown=${this.handleKeydown}
      @scroll=${this.updateScrollEdges}
    >
      <slot name="tab" @slotchange=${this.handleTabSlotChange}></slot>
      <div class="selection-indicator first-position"></div>
    </div>`
  }

  /**
   * The trigger and menu of the folded tabs, after the tab list (a `tablist` owns only tabs), and the measuring slot
   * that keeps the folded tabs laid out at their natural width while they are out of the strip.
   */
  private renderMore() {
    const count = this.folded.length
    const idle = count === 0 || !this.menuReady
    return html`<c2-menu
        class=${classMap({ 'more-menu': true, idle })}
        placement="bottom-end"
        aria-label=${this.msg.t('moreMenu')}
        ?disabled=${idle}
        @menu-select=${this.handleMenuSelect}
      >
        <button slot="trigger" class="more" part="more" type="button" aria-label=${this.msg.t('moreTabs', count)} tabindex=${idle ? '-1' : nothing}>
          <span>${this.msg.t('more')}</span>
          <svg
            class="more-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m6 9 6 6 6-6"></path>
          </svg>
        </button>
        ${repeat(
          this.folded,
          (tab) => tab,
          (tab) => html`<c2-menu-item value=${tab.for} ?disabled=${tab.disabled}>${syncLabel(tab)}</c2-menu-item>`,
        )}
      </c2-menu>
      <div class="measure" aria-hidden="true" inert>
        <div class="measure-row"><slot name=${FOLDED_SLOT} @slotchange=${this.handleTabSlotChange}></slot></div>
      </div>`
  }

  override render() {
    return html`
      <div class="c2-tabs">
        ${this.overflow === 'menu' ? html`<div class="c2-tabs-bar">${this.renderHeader()}${this.renderMore()}</div>` : this.renderHeader()}
        <slot name="tab-content"></slot>
        ${repeat(
          this.panels,
          (panel) => panel,
          (panel) => this.renderPanel(panel),
        )}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tabs': Tabs
  }
}
