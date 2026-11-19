import { LitElement, html, unsafeCSS } from 'lit'
import { query } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotReplayController } from '@c2n/core/lit-helper.js'
import styles from './tab-nav.scss?inline'
// Registers `c2-tab`, the element every link of the strip is.
import './tab'
import type { Tab } from './tab'

/**
 * A row of tabs that are links, for navigation between pages: a repository's Code / Issues / Settings, the sections
 * of an account. It has the look of `<c2-tabs>` but not its behaviour: there are no panels and no selection; each
 * `<c2-tab href="…">` is a link the user follows, and the one marked `current` is the page being shown.
 *
 * It is a navigation landmark (name it with `aria-label`) holding a list of links, the `current` one announced as
 * `aria-current="page"`. Every link is a Tab stop of its own; there are no arrow keys, which belong to a `tablist`.
 * The current tab's indicator is its bottom border, drawn with CSS, so a server-rendered strip shows it before any
 * script runs. When the tabs do not fit, the strip scrolls sideways with its scrollbar hidden; an edge with more tabs
 * beyond it fades out, and the current tab is scrolled into view.
 *
 * Mark the current tab where the page is rendered (`<c2-tab href="/issues" current>`), or move `current` from the
 * application's router. The strip sets nothing on its tabs.
 *
 * @tag c2-tab-nav
 *
 * @slotcomponent c2-tab
 *
 * @slot - The `<c2-tab href="…">` links.
 *
 * @csspart list - The scrolling row wrapping the default slot of links; it draws the strip's line and does not style inside the assigned tabs.
 *
 * @cssproperty {box-shadow} [--c2-tab-nav--box-shadow=inset 0px -2px 0px 0px rgb(213, 213, 213)] - The line under the strip.
 * @cssproperty {justify-content} [--c2-tab-nav--justify-content=flex-start]
 * @cssproperty {background-color} --c2-tab-nav--background-color
 * @cssproperty {pixel} --c2-tab-nav--gap - Space between the tabs.
 * @cssproperty {padding} --c2-tab-nav--padding
 * @cssproperty {pixel} [--c2-tab-nav__fade--width=32px] - Width of the fade at an edge with more tabs beyond it.
 *
 * @cssproperty {color} [--c2-tab-nav__indicator--color=rgb(109, 109, 109)] - The current tab's bottom border.
 * @cssproperty {pixel} [--c2-tab-nav__indicator--height=2px]
 *
 * @cssproperty {pixel} [--c2-tab-nav__tab--gap=8px] - Space between an icon and the label inside a tab.
 * @cssproperty {padding} [--c2-tab-nav__tab--padding-top=8px]
 * @cssproperty {padding} [--c2-tab-nav__tab--padding-right=16px]
 * @cssproperty {padding} [--c2-tab-nav__tab--padding-bottom=8px]
 * @cssproperty {padding} [--c2-tab-nav__tab--padding-left=16px]
 * @cssproperty {font-weight} --c2-tab-nav__tab--font-weight
 * @cssproperty {font-size} --c2-tab-nav__tab--font-size
 * @cssproperty {color} --c2-tab-nav__tab--color
 * @cssproperty {background-color} --c2-tab-nav__tab--background-color
 * @cssproperty {border-radius} --c2-tab-nav__tab--border-radius
 *
 * @cssproperty {color} [--c2-tab-nav__tab__hover--color=rgb(2, 101, 220)]
 * @cssproperty {background-color} --c2-tab-nav__tab__hover--background-color
 *
 * @cssproperty {color} [--c2-tab-nav__tab__current--color=rgb(2, 101, 220)]
 * @cssproperty {background-color} --c2-tab-nav__tab__current--background-color
 * @cssproperty {font-weight} --c2-tab-nav__tab__current--font-weight
 *
 * @cssproperty {outline} [--c2-tab-nav__tab__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-tab-nav__tab__focus--outline-offset=-2px]
 */
@customElement('c2-tab-nav')
export class TabNav extends LitElement {
  static override styles = unsafeCSS(styles)

  // The landmark lives on ElementInternals, not a host attribute, so a server-rendered strip hydrates without a
  // mismatch. The author's `aria-label` on the host names it.
  private readonly internals = this.attachInternals()

  @query('.list')
  private list!: HTMLElement

  /** Reports whether the first and the last tab are fully in view, to fade the edges that are not. */
  private edges?: IntersectionObserver

  constructor() {
    super()
    // A server-rendered strip assigned its tabs before this element hydrated, so its `slotchange` was never heard.
    new SlotReplayController(this, () => void this.handleSlotChange(), { always: true, immediate: true })
    this.internals.role = 'navigation'
  }

  /** The `<c2-tab>` links, in DOM order. */
  get tabs(): Tab[] {
    return [...this.children].filter((child): child is Tab => child.localName === 'c2-tab')
  }

  /** Brings the moved tab into view when the application moves `current` (a router), which fires no `slotchange`. */
  private currentObserver?: MutationObserver

  override connectedCallback() {
    super.connectedCallback()
    if (typeof MutationObserver !== 'undefined') {
      this.currentObserver ??= new MutationObserver(() => this.revealCurrent())
      this.currentObserver.observe(this, { subtree: true, attributeFilter: ['current'] })
    }
    // Reconnected (moved in the DOM): slot assignment did not change, so no `slotchange` rebuilds the edge observer.
    if (this.hasUpdated) void this.handleSlotChange()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.edges?.disconnect()
    this.edges = undefined
    this.currentObserver?.disconnect()
  }

  private async handleSlotChange() {
    const tabs = this.tabs
    // Measured below: wait until the tabs have rendered their labels.
    await Promise.all(tabs.map((tab) => tab.updateComplete))
    if (!this.isConnected) return
    if (typeof IntersectionObserver !== 'undefined') {
      this.edges?.disconnect()
      let first = true
      this.edges = new IntersectionObserver(
        (entries) => {
          // The first report comes after layout has settled (fonts, a hydrating page): reveal the current tab again.
          if (first) this.revealCurrent()
          first = false
          for (const { target, intersectionRatio } of entries) {
            // Each edge tab is observed once; when there is a single tab it is both.
            const hidden = intersectionRatio < 1
            if (target === tabs[0]) this.list.classList.toggle('more-start', hidden)
            if (target === tabs[tabs.length - 1]) this.list.classList.toggle('more-end', hidden)
          }
        },
        // The margin absorbs sub-pixel widths, which would otherwise leave an edge tab a hair short of fully visible.
        { root: this.list, threshold: 1, rootMargin: '1px' },
      )
      for (const tab of new Set([tabs[0], tabs[tabs.length - 1]])) if (tab) this.edges.observe(tab)
    }
    this.revealCurrent()
  }

  /**
   * Scrolls the strip, and only the strip, so the current tab is in view. Not `scrollIntoView`: without its `container`
   * option (Newly available) it would scroll the page too.
   */
  private revealCurrent() {
    if (!this.list) return
    const tab = this.tabs.find((t) => t.current)
    if (!tab) return
    const list = this.list.getBoundingClientRect()
    const rect = tab.getBoundingClientRect()
    const margin = parseFloat(getComputedStyle(this.list).scrollPaddingInlineStart) || 0
    if (rect.left < list.left) this.list.scrollLeft -= list.left - rect.left + margin
    else if (rect.right > list.right) this.list.scrollLeft += rect.right - list.right + margin
  }

  override render() {
    return html`<div class="list" part="list" role="list"><slot @slotchange=${this.handleSlotChange}></slot></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tab-nav': TabNav
  }
}
