import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { assignSlot, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { GROUP_ITEM_SIZE_EVENT, groupItemOf, markGroupItemConsumer } from '@c2n/core/controllers/group-item-size.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { state } from 'lit/decorators.js'
// The group lays out chips and badges: register them, so markup that only loads the group still upgrades its items.
import '@c2n/chip'
import '@c2n/badge'
import styles from './chip-group.scss?inline'

/** Events fired by {@link ChipGroup}, keyed for `addEventListener`. */
export interface ChipGroupEventMap {
  'overflow-change': CustomEvent<ChipGroupOverflowDetail>
  'expanded-change': Event
}

export interface ChipGroupOverflowDetail {
  /** Number of items shown in the row. */
  visibleCount: number
  /** Number of items collapsed into the `+N` indicator. */
  hiddenCount: number
}

export interface ChipGroup {
  addEventListener: TypedAddEventListener<ChipGroup, ChipGroupEventMap>
  removeEventListener: TypedRemoveEventListener<ChipGroup, ChipGroupEventMap>
}

/** Slot that holds the items collapsed into the indicator, laid out invisibly so they keep reporting their size. */
const HIDDEN_SLOT = 'c2-chip-group-hidden'

/**
 * One row of `c2-chip`s or `c2-badge`s that never wraps: the items that do not fit collapse into a `+N` indicator at
 * the end. The group does not measure its children. Each chip and badge reports its own size to the group it sits in,
 * and the group adds those sizes up against its own width to decide how many items it can show, so the row adapts
 * when the group is resized, an item's label changes or items are added and removed. `max` caps the count regardless
 * of space. With `expandable` the indicator is a button that reveals every item (the row then wraps) and a second
 * button collapses it again.
 *
 * Give the group a width (it is a block, so it fills its container; in a flex row set `flex: 1` and `min-width: 0`).
 * Collapsed items stay in the DOM but are invisible and out of the accessibility tree; the indicator's label
 * (`3 more`) announces them, and `hiddenItems` lists them for a tooltip or a popover.
 *
 * @tag c2-chip-group
 *
 * @slot - The items: `c2-chip`, `c2-badge`, or any element using `GroupItemSizeController` from `@c2n/core`. Other elements are measured by the group itself.
 *
 * @event overflow-change - The number of collapsed items changed. `detail` has `visibleCount` and `hiddenCount`.
 * @event expanded-change - The user expanded or collapsed an `expandable` group. Read `expanded` on the target.
 *
 * @csspart row - The flex row holding the visible items and the indicator.
 * @csspart overflow - The `+N` indicator, a `<button>` when `expandable`.
 * @csspart collapse - The button that collapses an expanded group.
 *
 * @cssproperty {pixel} [--c2-chip-group--gap=6px] - Space between items, included in the fit calculation.
 * @cssproperty {align-items} [--c2-chip-group--align-items=center]
 *
 * @cssproperty {pixel} [--c2-chip-group__overflow--height=28px]
 * @cssproperty {pixel} [--c2-chip-group__overflow--min-width=28px]
 * @cssproperty {padding} [--c2-chip-group__overflow--padding-left=8px]
 * @cssproperty {padding} [--c2-chip-group__overflow--padding-right=8px]
 * @cssproperty {border-radius} [--c2-chip-group__overflow--border-radius=999px]
 * @cssproperty {border} [--c2-chip-group__overflow--border=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-chip-group__overflow--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-chip-group__overflow--color=#52525b]
 * @cssproperty {font-family} [--c2-chip-group__overflow--font-family=inherit]
 * @cssproperty {pixel} [--c2-chip-group__overflow--font-size=12px]
 * @cssproperty {font-weight} [--c2-chip-group__overflow--font-weight=500]
 *
 * @cssproperty {border} [--c2-chip-group__overflow__hover--border=1px solid #a1a1aa] - Hover border of an `expandable` indicator and of the collapse button.
 * @cssproperty {color} [--c2-chip-group__overflow__hover--color=#18181b]
 * @cssproperty {outline} [--c2-chip-group__overflow__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-chip-group__overflow__focus--outline-offset=2px]
 */
@customElement('c2-chip-group')
export class ChipGroup extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, slotAssignment: 'manual' }

  /** Most items to show, whatever the space. Unset shows as many as fit. */
  @property({ type: Number }) max: number | undefined = undefined

  /** Shows every item, wrapping onto more rows. */
  @property({ type: Boolean, reflect: true }) expanded = false

  /** Makes the indicator a button that expands the group, and adds a button that collapses it. */
  @property({ type: Boolean, reflect: true }) expandable = false

  /** Word after the count in the indicator's accessible name: `3 more`. */
  @property({ attribute: 'more-label' }) moreLabel = 'more'

  /** Text of the button that collapses an expanded group. */
  @property({ attribute: 'collapse-label' }) collapseLabel = 'Show less'

  @state() private items: Element[] = []
  @state() private visibleCount = Infinity

  private readonly internals = this.attachInternals()
  private childObserver?: MutationObserver
  /** Measures the row and the indicator, plus any child that does not report its own size. */
  private resizeObserver?: ResizeObserver
  private fallbackSizes = new WeakMap<Element, number>()
  private fitQueued = false
  // Nothing is collapsed before the first fit, so a group whose items all fit never fires `overflow-change`.
  private reportedHidden = 0

  constructor() {
    super()
    markGroupItemConsumer(this)
    this.internals.role = 'group'
  }

  /** The items currently collapsed into the indicator, in document order. */
  get hiddenItems(): Element[] {
    return this.expanded ? [] : this.items.slice(this.shownCount)
  }

  private get shownCount(): number {
    return Math.min(this.visibleCount, this.items.length)
  }

  override connectedCallback() {
    super.connectedCallback()
    this.addEventListener(GROUP_ITEM_SIZE_EVENT, this.handleItemSize)
    this.resizeObserver ??= new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target.parentElement === this) this.fallbackSizes.set(entry.target, entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width)
      }
      this.queueFit()
    })
    this.childObserver ??= new MutationObserver(() => this.readItems())
    this.childObserver.observe(this, { childList: true })
    this.readItems()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener(GROUP_ITEM_SIZE_EVENT, this.handleItemSize)
    this.childObserver?.disconnect()
    this.resizeObserver?.disconnect()
  }

  override firstUpdated() {
    // The sizer follows the group's width only; the row itself also changes height when the indicator appears,
    // which would re-trigger the observer within the same frame.
    const sizer = this.renderRoot.querySelector('.sizer')
    const meter = this.renderRoot.querySelector('.meter')
    if (sizer) this.resizeObserver?.observe(sizer)
    if (meter) this.resizeObserver?.observe(meter)
  }

  private readItems() {
    const items = [...this.children]
    for (const item of this.items) if (!items.includes(item)) this.resizeObserver?.unobserve(item)
    for (const item of items) {
      const reporter = groupItemOf(item)
      if (reporter) reporter.observe()
      // An element that does not report its size, or a custom element that has not upgraded yet, is measured here.
      else this.resizeObserver?.observe(item)
    }
    this.items = items
    this.queueFit()
  }

  private handleItemSize = (event: Event) => {
    if ((event.target as Element).parentElement !== this) return
    // Keep the protocol event from reaching a group this one is nested in.
    event.stopPropagation()
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

  private itemWidth(item: Element): number {
    const reporter = groupItemOf(item)
    if (reporter) {
      // An item that upgraded after the group was read reports from now on; the fallback stops measuring it.
      this.resizeObserver?.unobserve(item)
      reporter.observe()
      return reporter.size?.width ?? 0
    }
    return this.fallbackSizes.get(item) ?? 0
  }

  /** Decides how many items fit: all of them, or as many as fit next to the indicator. */
  private fit() {
    const row = this.renderRoot.querySelector<HTMLElement>('.row')
    const sizer = this.renderRoot.querySelector<HTMLElement>('.sizer')
    const meter = this.renderRoot.querySelector<HTMLElement>('.meter')
    if (!row || !sizer) return
    const available = sizer.clientWidth + 0.5
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0
    const widths = this.items.map((item) => this.itemWidth(item))
    const limit = this.max !== undefined && this.max >= 0 ? Math.floor(this.max) : Infinity

    const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.filter((width) => width > 0).length - 1)
    let count = widths.length
    if (widths.length > limit || total > available) {
      // Room for the indicator first, then each item and the gap after it, in order.
      let used = meter?.getBoundingClientRect().width ?? 0
      count = 0
      for (const width of widths.slice(0, Math.min(widths.length, limit))) {
        const next = width > 0 ? used + width + gap : used
        if (next > available) break
        used = next
        count++
      }
    }
    if (count >= this.items.length) count = Infinity
    if (count !== this.visibleCount) this.visibleCount = count
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('max') && this.hasUpdated) this.queueFit()
  }

  protected override updated() {
    if ((this.renderRoot as ShadowRoot).slotAssignment !== 'manual') this.assignNamedSlots()
    const hidden = this.hiddenItems.length
    if (hidden === this.reportedHidden) return
    this.reportedHidden = hidden
    const detail: ChipGroupOverflowDetail = { visibleCount: this.items.length - hidden, hiddenCount: hidden }
    this.dispatchEvent(new CustomEvent<ChipGroupOverflowDetail>('overflow-change', { detail }))
  }

  /**
   * A declarative shadow root (server rendering) is always in named mode, where `assign()` has no effect: route the
   * collapsed items by `slot` attribute instead, touching only the attribute this group wrote.
   */
  private assignNamedSlots() {
    const hidden = new Set(this.hiddenItems)
    for (const item of this.items) {
      if (hidden.has(item)) item.setAttribute('slot', HIDDEN_SLOT)
      else if (item.getAttribute('slot') === HIDDEN_SLOT) item.removeAttribute('slot')
    }
  }

  private setExpanded(expanded: boolean) {
    this.expanded = expanded
    this.dispatchEvent(new Event('expanded-change'))
    if (!expanded) this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('.overflow')?.focus())
    else this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('.collapse')?.focus())
  }

  private renderIndicator(hidden: number) {
    if (this.expanded) {
      if (!this.expandable) return nothing
      return html`<button class="indicator collapse" part="collapse" type="button" aria-expanded="true" @click=${() => this.setExpanded(false)}>
        ${this.collapseLabel}
      </button>`
    }
    if (hidden === 0) return nothing
    const label = `${hidden} ${this.moreLabel}`
    return this.expandable
      ? html`<button class="indicator overflow" part="overflow" type="button" aria-expanded="false" aria-label=${label} @click=${() => this.setExpanded(true)}>
          +${hidden}
        </button>`
      : html`<span class="indicator overflow" part="overflow" role="img" aria-label=${label}>+${hidden}</span>`
  }

  override render() {
    const hidden = this.hiddenItems
    const visible = this.expanded ? this.items : this.items.slice(0, this.shownCount)
    return html`
      <div class="sizer"></div>
      <div class="row" part="row">
        <slot ${assignSlot(visible)}></slot>
        ${this.renderIndicator(hidden.length)}
      </div>
      <div class="measure" aria-hidden="true" inert>
        <div class="measure-row">
          <slot name=${HIDDEN_SLOT} ${assignSlot(hidden)}></slot>
          <span class="indicator meter">+${this.items.length}</span>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chip-group': ChipGroup
  }
}
