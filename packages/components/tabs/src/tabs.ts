import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { assignSlot, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { repeat } from 'lit/directives/repeat.js'
import { provide } from '@lit/context'
import styles from './tabs.scss?inline'
import { selectedTabContext } from './tab-context'
// Registers `c2-tab` so consumers of the strip alone get the child element too (same pattern as select → list-item).
import './tab'
import type { Tab } from './tab'

const TAB_TAG = 'c2-tab'

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
 * the tab list sideways.
 */
export type TabsOverflow = 'visible' | 'scroll'

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
   * tab list scrolls sideways, keeps the selected tab in view and fades the edges where tabs are hidden.
   */
  @property({ reflect: true }) overflow: TabsOverflow = 'visible'

  /** Whether the remembered `sync-key` choice has been looked up. */
  private restored = false

  @query('.c2-tabs-header')
  private header!: HTMLElement

  @query('slot[name="tab"]')
  private tabsSlot!: HTMLSlotElement

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
      this.resizeObserver = new ResizeObserver(() => {
        this.updateIndicator()
        this.revealSelected(false)
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

  override disconnectedCallback() {
    super.disconnectedCallback()
    if (!isServer) window.removeEventListener(SYNC_EVENT, this.handleSync)
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
    // Collected before rendering, not in `updated`: a state change there would schedule a second update every time.
    if (!isServer && this.manualSlots) this.collectPanels()
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
      // The first selection is placed at once; a later one glides into view.
      this.revealSelected(changed.get('selectedTab') !== undefined && this.hasUpdated)
    }
    if (changed.has('overflow')) {
      this.revealSelected(false)
      this.updateScrollEdges()
    }
  }

  /**
   * Scrolls a scrolling strip so the selected tab is wholly in view, `--c2-tabs__fade--width` (the scroll padding) away
   * from either edge. Only the tab list moves: unlike `scrollIntoView`, the page never scrolls.
   */
  private revealSelected(smooth: boolean) {
    const header = this.header
    if (this.overflow !== 'scroll' || !header) return
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
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    header.scrollBy({ left: delta, behavior: smooth && !reduced ? 'smooth' : 'instant' })
  }

  /**
   * Marks the edges of a scrolling strip behind which tabs are hidden, for the fades. Classes on the strip inside the
   * shadow root, written directly: this runs on every scroll frame and must not schedule a render.
   */
  private updateScrollEdges = () => {
    const header = this.header
    if (!header) return
    const scrolling = this.overflow === 'scroll'
    // In a right-to-left strip `scrollLeft` runs from 0 down to negative values, so its magnitude is the distance from the start.
    const fromStart = Math.abs(header.scrollLeft)
    const room = header.scrollWidth - header.clientWidth
    header.classList.toggle('overflow-start', scrolling && fromStart > 1)
    header.classList.toggle('overflow-end', scrolling && room - fromStart > 1)
  }

  override render() {
    return html`
      <div class="c2-tabs">
        <div
          class="c2-tabs-header"
          role="tablist"
          aria-label=${this.ariaLabel || nothing}
          @tab-change=${this.handleTabChange}
          @keydown=${this.handleKeydown}
          @scroll=${this.updateScrollEdges}
        >
          <slot name="tab" @slotchange=${this.handleTabSlotChange}></slot>
          <div class="selection-indicator first-position"></div>
        </div>
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
