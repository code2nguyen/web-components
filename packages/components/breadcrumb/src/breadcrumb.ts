import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
// Registers `c2-link-button`, the natural item element, and provides the ellipsis control.
import '@c2n/link-button'
import styles from './breadcrumb.scss?inline'

const LINK_BUTTON_TAG = 'c2-link-button'
const ITEM_SLOT = 'item-'

/**
 * Navigation trail. Every light-DOM child is one item, typically a `c2-link-button` with an `href`, and the last one
 * is the current page: it is marked `aria-current="page"` (through `selected` on a link button) and styled as text.
 * A separator is drawn between items, a chevron by default or whatever is placed in the `separator` slot. The trail
 * stays on one row: when the items do not fit the available width, some collapse behind an ellipsis, in priority
 * order: the current page is always shown, then the first item, then the items closest to the current page while room
 * remains. `max-items` caps how many are shown even when there is room. Clicking the ellipsis reveals every item
 * (wrapping if needed).
 *
 * @tag c2-breadcrumb
 *
 * @slot - The items, in order. Use `c2-link-button` for links; any element works for the current page.
 * @slot separator - Custom separator, cloned between every pair of items (text such as `/`, or an icon).
 *
 * @cssproperty {pixel} [--c2-breadcrumb--gap=4px] - Space between an item and its separator.
 * @cssproperty {pixel} [--c2-breadcrumb__separator--size=14px] - Icon size and font size of the separator.
 * @cssproperty {color} [--c2-breadcrumb__separator--color=#a1a1aa]
 *
 * @cssproperty {color} [--c2-breadcrumb__item--color=#71717a]
 * @cssproperty {font-size} [--c2-breadcrumb__item--font-size=14px]
 * @cssproperty {font-weight} [--c2-breadcrumb__item--font-weight=500]
 * @cssproperty {padding} [--c2-breadcrumb__item--padding-top=2px]
 * @cssproperty {padding} [--c2-breadcrumb__item--padding-right=4px]
 * @cssproperty {padding} [--c2-breadcrumb__item--padding-bottom=2px]
 * @cssproperty {padding} [--c2-breadcrumb__item--padding-left=4px]
 * @cssproperty {border-radius} [--c2-breadcrumb__item--border-radius=4px]
 * @cssproperty {color} --c2-breadcrumb__item--background-color
 * @cssproperty {color} [--c2-breadcrumb__item__hover--color=#18181b]
 * @cssproperty {color} --c2-breadcrumb__item__hover--background-color
 * @cssproperty {text-decoration} [--c2-breadcrumb__item__hover--text-decoration=none]
 * @cssproperty {color} [--c2-breadcrumb__item__current--color=#18181b]
 * @cssproperty {font-weight} [--c2-breadcrumb__item__current--font-weight=500]
 * @cssproperty {color} --c2-breadcrumb__item__current--background-color
 * @internalcomponent c2-link-button
 * @slotcomponent c2-link-button
 */
@customElement('c2-breadcrumb')
export class Breadcrumb extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Upper bound on visible items (the first, then the last ones behind an ellipsis). `0` lets the width decide alone. */
  @property({ type: Number, attribute: 'max-items' }) maxItems = 0

  /** Accessible name of the navigation landmark. */
  @property({ type: String, attribute: 'aria-label' })
  override ariaLabel!: string

  @state() private itemCount = 0
  @state() private expanded = false
  @state() private separatorNodes: Node[] = []
  /** Render every item invisibly to measure it; the next render shows the trail that fits. */
  @state() private measuring = true
  /** Collapsed layout: whether the first item is shown, and how many trailing items (including the current page). */
  @state() private collapsed: { showFirst: boolean; tail: number } | null = null

  @query('slot[name="separator"]') private separatorSlot!: HTMLSlotElement
  @query('.c2-breadcrumb-list') private list!: HTMLElement

  private observer?: MutationObserver
  private resizeObserver?: ResizeObserver
  private measuredWidth = -1

  override connectedCallback() {
    super.connectedCallback()
    if (!isServer) {
      this.assignItems()
      this.observer ??= new MutationObserver(() => this.assignItems())
      this.observer.observe(this, { childList: true })
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver ??= new ResizeObserver((entries) => {
          const width = entries[0]?.contentRect.width ?? 0
          if (Math.abs(width - this.measuredWidth) > 0.5) this.requestMeasure()
        })
        this.resizeObserver.observe(this)
      }
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.observer?.disconnect()
    this.resizeObserver?.disconnect()
  }

  /** The item elements, in order (everything except the separator content). */
  get items(): HTMLElement[] {
    return [...this.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child.getAttribute('slot') !== 'separator')
  }

  /** Gives every item its own slot so each can sit in a list item with its separator, and marks the last as current. */
  private assignItems() {
    const items = this.items
    items.forEach((item, index) => {
      const name = `${ITEM_SLOT}${index}`
      if (item.getAttribute('slot') !== name) item.setAttribute('slot', name)
    })
    this.itemCount = items.length
    this.markCurrent(items)
  }

  private markCurrent(items: HTMLElement[]) {
    const last = items[items.length - 1]
    if (!last) return
    const explicit = items.some((item) => item !== last && (item.hasAttribute('selected') || item.hasAttribute('aria-current')))
    for (const item of items) {
      const isCurrent = !explicit && item === last
      if (item.localName === LINK_BUTTON_TAG) {
        if (isCurrent) item.setAttribute('selected', '')
        else if (item === last && explicit) item.removeAttribute('selected')
      } else if (isCurrent) {
        item.setAttribute('aria-current', 'page')
      } else if (item === last) {
        item.removeAttribute('aria-current')
      }
    }
  }

  private handleSeparatorChange() {
    this.separatorNodes = this.separatorSlot
      .assignedNodes({ flatten: true })
      .filter((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
  }

  override firstUpdated() {
    this.handleSeparatorChange()
  }

  override updated(changed: PropertyValues) {
    if (changed.has('maxItems') || changed.has('itemCount') || changed.has('separatorNodes')) {
      if (changed.has('itemCount')) this.expanded = false
      this.requestMeasure()
    }
    if (this.measuring && !changed.has('measuring')) return
    if (this.measuring) this.measure()
  }

  private requestMeasure() {
    if (isServer || !this.isConnected || this.expanded) return
    this.measuring = true
  }

  /**
   * Reads the natural width of every item (all rendered, invisible) and decides what fits on one row, in priority
   * order: the current page always, then the first item, then the middle items closest to the current page.
   * `max-items` caps the count. Runs before paint, so there is no flicker.
   */
  private measure() {
    const list = this.list
    if (!list) return
    const items = [...list.querySelectorAll<HTMLElement>('.c2-breadcrumb-item:not(.c2-breadcrumb-item--ellipsis)')]
    const ellipsis = list.querySelector<HTMLElement>('.c2-breadcrumb-item--ellipsis')
    const available = list.clientWidth + 0.5
    this.measuredWidth = this.getBoundingClientRect().width
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0
    const widths = items.map((item) => item.getBoundingClientRect().width)
    const count = widths.length
    const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, count - 1)
    const maxVisible = this.maxItems > 0 ? this.maxItems : Infinity

    if (count < 2 || (total <= available && count <= maxVisible)) {
      this.collapsed = null
    } else {
      const ellipsisWidth = ellipsis?.getBoundingClientRect().width ?? 0
      // Ellipsis + current page is the floor, even when it overflows.
      let width = ellipsisWidth + gap + widths[count - 1]
      let visible = 1
      let tail = 1
      let showFirst = false
      if (visible < maxVisible && width + gap + widths[0] <= available) {
        showFirst = true
        width += gap + widths[0]
        visible++
      }
      for (let index = count - 2; index >= 1; index--) {
        if (visible >= maxVisible || width + gap + widths[index] > available) break
        width += gap + widths[index]
        tail++
        visible++
      }
      this.collapsed = { showFirst, tail }
    }
    this.measuring = false
  }

  private expand() {
    this.expanded = true
    this.updateComplete.then(() => {
      // Move focus to the first revealed item so keyboard users are not dropped.
      const revealed = this.items[1]
      revealed?.focus()
    })
  }

  private renderSeparator() {
    const custom = this.separatorNodes.length ? this.separatorNodes.map((node) => node.cloneNode(true)) : null
    return html`<span class="c2-breadcrumb-separator" part="separator" aria-hidden="true"
      >${
        custom ??
        html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>`
      }</span
    >`
  }

  private renderItem(index: number, last: boolean) {
    return html`<li class="c2-breadcrumb-item" part="item"><slot name=${`${ITEM_SLOT}${index}`}></slot>${last ? nothing : this.renderSeparator()}</li>`
  }

  private renderEllipsis(hidden: number) {
    return html`<li class="c2-breadcrumb-item c2-breadcrumb-item--ellipsis" part="item">
      <c2-link-button class="c2-breadcrumb-ellipsis" part="ellipsis" aria-label=${`Show ${hidden} more items`} @click=${this.expand}>…</c2-link-button>
      ${this.renderSeparator()}
    </li>`
  }

  override render() {
    const count = this.itemCount
    const indexes = [...Array(count).keys()]
    const all = indexes.map((index) => this.renderItem(index, index === count - 1))
    let content
    if (this.measuring) {
      // Everything, plus an ellipsis to measure, hidden by the `is-measuring` class.
      content = [...all, this.renderEllipsis(0)]
    } else if (this.expanded || !this.collapsed) {
      content = all
    } else {
      const { showFirst, tail } = this.collapsed
      const hidden = count - tail - (showFirst ? 1 : 0)
      content = [
        showFirst ? this.renderItem(0, false) : nothing,
        this.renderEllipsis(hidden),
        ...indexes.slice(count - tail).map((index) => this.renderItem(index, index === count - 1)),
      ]
    }
    return html`
      <nav class="c2-breadcrumb" aria-label=${ifDefined(this.ariaLabel ?? 'Breadcrumb')}>
        <ol class=${classMap({ 'c2-breadcrumb-list': true, 'is-measuring': this.measuring, 'is-expanded': this.expanded })} part="list">
          ${content}
        </ol>
      </nav>
      <slot name="separator" class="c2-breadcrumb-separator-source" @slotchange=${this.handleSeparatorChange}></slot>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-breadcrumb': Breadcrumb
  }
}
