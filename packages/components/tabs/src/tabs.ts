import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { provide } from '@lit/context'
import { isServer } from 'lit-html/is-server.js'
import styles from './tabs.scss?inline'
import { selectedTabContext } from './tab-context'
// Registers `c2-tab` so consumers of the strip alone get the child element too (same pattern as select → list-item).
import './tab'
import type { Tab } from './tab'

const TAB_TAG = 'c2-tab'

/**
 * Tab strip that shows one content panel at a time.
 *
 * Light-DOM children are split in two groups: every `<c2-tab for="…">` becomes a tab in the header
 * (they slot themselves into `tab`), every other child is a panel whose `id` matches a tab's `for`.
 * Only the panel of the selected tab is rendered. The header is a `tablist`: Arrow keys, Home and
 * End move between tabs, Enter and Space activate the focused one.
 *
 * @tag c2-tabs
 *
 * @slot tab - The `<c2-tab>` elements (assigned automatically).
 * @slot tab-content - The panel of the selected tab (assigned automatically from the child whose `id` matches `selected-tab`).
 *
 * @event {CustomEvent<{ value: string }>} change - Fired after the user selects another tab. `detail.value` is the new `selected-tab`. Not fired for programmatic changes.
 *
 * @cssproperty {box-shadow} [--c2-tabs--box-shadow=inset 0px -2px 0px 0px rgb(230, 230, 230)]
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

  /** `for` value of the selected tab (and `id` of the visible panel). Falls back to the first enabled tab. */
  @provide({ context: selectedTabContext })
  @property({ type: String, attribute: 'selected-tab' })
  selectedTab = ''

  @query('.c2-tabs-header')
  private header!: HTMLElement

  @query('slot[name="tab"]')
  private tabsSlot!: HTMLSlotElement

  @state()
  private indicatorStyle = ''

  /** False until the indicator has been placed once: the first placement must not animate. */
  @state()
  private measured = false

  private resizeObserver?: ResizeObserver

  override connectedCallback() {
    super.connectedCallback()
    if (!isServer && typeof ResizeObserver !== 'undefined' && !this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => this.updateIndicator())
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
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
    this.dispatchEvent(new CustomEvent('change', { detail: { value }, bubbles: true, composed: true }))
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
    }

    for (const child of this.children) {
      if (child.localName === TAB_TAG) continue
      if (child.id && child.id === this.selectedTab) {
        child.setAttribute('slot', 'tab-content')
        if (!child.hasAttribute('role')) child.setAttribute('role', 'tabpanel')
        if (selected && !child.hasAttribute('aria-labelledby')) {
          if (!selected.id) selected.id = `${child.id}-tab`
          child.setAttribute('aria-labelledby', selected.id)
        }
      } else if (child.getAttribute('slot') === 'tab-content') {
        child.removeAttribute('slot')
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
        <div class="c2-tabs-header" role="tablist" @tab-change=${this.handleTabChange} @keydown=${this.handleKeydown}>
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
