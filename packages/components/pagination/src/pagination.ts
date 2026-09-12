import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { consume } from '@lit/context'
import { PAGER_CONNECT_EVENT, pagerContext, type PagerConnectEventDetail, type PagerContext } from '@c2n/core/contexts/pager.js'
// Registers `c2-select` and its `c2-list-item` options, the rows-per-page control of the `compact` variant.
import '@c2n/select'
import '@c2n/list-item'
import styles from './pagination.scss?inline'

/** Which layout the pagination renders. */
export type PaginationVariant = 'numbered' | 'simple' | 'compact'

export interface PageChangeEventDetail {
  /** The page now shown, 1-based. */
  page: number
  /** The page that was shown before, 1-based. */
  previousPage: number
  /** Items per page at the moment of the change. */
  pageSize: number
  /** Total number of pages. */
  pageCount: number
  /** Zero-based index of the first item of the page: `items.slice(startIndex, endIndex)`. */
  startIndex: number
  /** Zero-based index after the last item of the page. Equals `startIndex` when the total is unknown. */
  endIndex: number
}

export interface PageSizeChangeEventDetail {
  /** Items per page now. */
  pageSize: number
  /** Items per page before the change. */
  previousPageSize: number
  /** The page shown after the change; the pagination keeps the first item of the old page visible. */
  page: number
}

type PaginationItem =
  | { kind: 'page'; page: number }
  /** `from`..`to` are the pages this ellipsis hides; `target` is the one clicking it jumps to. */
  | { kind: 'ellipsis'; key: 'start-ellipsis' | 'end-ellipsis'; from: number; to: number; target: number }

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

/** `page-size-options="10,25,50"`; invalid and non-positive entries are dropped. */
const numberListConverter = {
  toAttribute: (value: number[]) => (Array.isArray(value) && value.length > 0 ? value.join(',') : null),
  fromAttribute: (value: string | null) =>
    (value ?? '')
      .split(',')
      .map((entry) => Number(entry.trim()))
      .filter((entry) => Number.isFinite(entry) && entry > 0),
}

/** Substitutes `{page}`, `{pageCount}`, `{start}`, `{end}` and `{total}` in a label template. */
function format(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index)
}

const chevronLeft = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="15 18 9 12 15 6"></polyline>
</svg>`

const chevronRight = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="9 18 15 12 9 6"></polyline>
</svg>`

const chevronsLeft = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="11 17 6 12 11 7"></polyline>
  <polyline points="18 17 13 12 18 7"></polyline>
</svg>`

const chevronsRight = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="13 17 18 12 13 7"></polyline>
  <polyline points="6 17 11 12 6 7"></polyline>
</svg>`

/**
 * Page navigation for a list, a table or search results, in three layouts chosen with `variant`:
 *
 * - `numbered` (default) — previous/next controls around the page numbers, with an ellipsis standing in for the pages
 *   that do not fit. `sibling-count` and `boundary-count` decide how many numbers surround the current page and each
 *   end of the range.
 * - `simple` — previous/next around a "Page 2 of 10" status, for narrow toolbars.
 * - `compact` — the table-footer layout: a rows-per-page select, the range of items on show ("21–30 of 100") and two
 *   arrow buttons.
 *
 * `simple` and `compact` show no page numbers, so `show-first-last` adds the jumps to either end that the numbers
 * would otherwise provide.
 *
 * The row of controls never wraps. When the requested page numbers do not fit the host's width, the component sheds
 * them — siblings first, then boundaries — until they do, and puts them back when the container grows again; the
 * current page always survives. Only the three groups of the `compact` variant may drop onto a second line.
 *
 * The ellipsis is a control, not decoration: it jumps into the middle of the pages it hides, which is what keeps
 * those pages one click away once the row has shed its numbers. It shows the direction of that jump on hover and
 * keyboard focus.
 *
 * How many pages there are comes from `total-items` and `page-size`, or from `total-pages` when the total item count
 * is unknown. The element keeps `page` itself and reflects it, so listening to `page-change` is enough; setting `page`
 * back from the outside works the same way. Every label is an attribute, and `range-template` / `page-template` /
 * `page-label-template` hold the text around the numbers, so the whole element can be translated without a slot.
 *
 * @tag c2-pagination
 *
 * @slot previous-icon - Icon of the previous-page control. Defaults to a chevron.
 * @slot next-icon - Icon of the next-page control. Defaults to a chevron.
 * @slot first-icon - Icon of the first-page control (`show-first-last`). Defaults to a double chevron.
 * @slot last-icon - Icon of the last-page control (`show-first-last`). Defaults to a double chevron.
 *
 * @event {CustomEvent<PageChangeEventDetail>} page-change - Fired after the shown page changes, by a control or by a page-size change. `detail.startIndex` / `detail.endIndex` slice the items of the new page.
 * @event {CustomEvent<PageSizeChangeEventDetail>} page-size-change - Fired after the user picks another rows-per-page value.
 *
 * @cssproperty {pixel} [--c2-pagination--gap=4px] - Space between the controls.
 * @cssproperty {pixel} [--c2-pagination--section-gap=24px] - Space between the groups of the `compact` variant.
 * @cssproperty {justify-content} [--c2-pagination--justify-content=flex-start] - Where the controls sit in the host's width.
 *
 * @cssproperty {pixel} [--c2-pagination__item--min-width=36px]
 * @cssproperty {pixel} [--c2-pagination__item--height=36px]
 * @cssproperty {padding} [--c2-pagination__item--padding-left=8px]
 * @cssproperty {padding} [--c2-pagination__item--padding-right=8px]
 * @cssproperty {color} [--c2-pagination__item--color=#18181b]
 * @cssproperty {color} [--c2-pagination__item--background-color=transparent]
 * @cssproperty {border} [--c2-pagination__item--border=1px solid transparent]
 * @cssproperty {border-radius} [--c2-pagination__item--border-radius=8px]
 * @cssproperty {font-size} [--c2-pagination__item--font-size=14px]
 * @cssproperty {font-weight} [--c2-pagination__item--font-weight=500]
 * @cssproperty {color} [--c2-pagination__item__hover--color=#18181b]
 * @cssproperty {color} [--c2-pagination__item__hover--background-color=#f4f4f5]
 * @cssproperty {border} [--c2-pagination__item__hover--border=1px solid transparent]
 * @cssproperty {color} [--c2-pagination__item__selected--color=#18181b]
 * @cssproperty {color} [--c2-pagination__item__selected--background-color=#ffffff]
 * @cssproperty {border} [--c2-pagination__item__selected--border=1px solid #e4e4e7]
 * @cssproperty {font-weight} [--c2-pagination__item__selected--font-weight=500]
 * @cssproperty {outline} [--c2-pagination__item__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-pagination__item__focus--outline-offset=1px]
 * @cssproperty {opacity} [--c2-pagination__item__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-pagination__nav--gap=6px] - Space between a previous/next icon and its label.
 * @cssproperty {padding} [--c2-pagination__nav--padding-left=10px]
 * @cssproperty {padding} [--c2-pagination__nav--padding-right=10px]
 * @cssproperty {color} [--c2-pagination__nav--color=#18181b]
 * @cssproperty {color} [--c2-pagination__nav--background-color=transparent]
 * @cssproperty {border} [--c2-pagination__nav--border=1px solid transparent]
 * @cssproperty {border-radius} [--c2-pagination__nav--border-radius=8px]
 * @cssproperty {font-size} [--c2-pagination__nav--font-size=14px]
 * @cssproperty {font-weight} [--c2-pagination__nav--font-weight=500]
 * @cssproperty {color} [--c2-pagination__nav__hover--color=#18181b]
 * @cssproperty {color} [--c2-pagination__nav__hover--background-color=#f4f4f5]
 * @cssproperty {border} [--c2-pagination__nav__hover--border=1px solid transparent]
 *
 * @cssproperty {pixel} [--c2-pagination__icon--size=16px]
 * @cssproperty {color} --c2-pagination__icon--color - Defaults to the colour of the control it sits in.
 *
 * @cssproperty {color} [--c2-pagination__ellipsis--color=#71717a]
 * @cssproperty {pixel} [--c2-pagination__ellipsis--min-width=36px]
 *
 * @cssproperty {color} [--c2-pagination__label--color=#71717a]
 * @cssproperty {font-size} [--c2-pagination__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-pagination__label--font-weight=500]
 * @cssproperty {pixel} [--c2-pagination__label--gap=8px] - Space between the rows-per-page label and its select.
 * @cssproperty {pixel} [--c2-pagination__page-size-list--min-width=56px] - Floor for the rows-per-page dropdown: room for a three-digit option, so a one-digit one does not open a sliver.
 *
 * @internalcomponent c2-select
 * @internalcomponent c2-list-item
 */
@customElement('c2-pagination')
export class Pagination extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Layout of the controls: page numbers, a "Page 2 of 10" status, or the table-footer row. */
  @property({ type: String, reflect: true }) variant: PaginationVariant = 'numbered'

  /** The page on show, 1-based. Reflected, and clamped to the available range. */
  @property({ type: Number, reflect: true }) page = 1

  /** Items per page. Together with `total-items` it decides how many pages there are. */
  @property({ type: Number, attribute: 'page-size' }) pageSize = 10

  /** Total number of items to page through. */
  @property({ type: Number, attribute: 'total-items' }) totalItems = 0

  /** Number of pages, when the item count is unknown. Takes precedence over `total-items`. */
  @property({ type: Number, attribute: 'total-pages' }) totalPages = 0

  /** How many page numbers are shown on each side of the current page. */
  @property({ type: Number, attribute: 'sibling-count' }) siblingCount = 1

  /** How many page numbers are always shown at each end of the range. */
  @property({ type: Number, attribute: 'boundary-count' }) boundaryCount = 1

  /** Rows-per-page choices of the `compact` variant. Empty hides the select. */
  @property({ attribute: 'page-size-options', converter: numberListConverter })
  pageSizeOptions: number[] = DEFAULT_PAGE_SIZE_OPTIONS

  /** Hide the rows-per-page select of the `compact` variant. */
  @property({ type: Boolean, attribute: 'hide-page-size' }) hidePageSize = false

  /** Hide the range status ("21–30 of 100") of the `compact` variant. */
  @property({ type: Boolean, attribute: 'hide-range' }) hideRange = false

  /**
   * Add first-page and last-page controls around the previous/next pair. Meant for `simple` and `compact`, which show
   * no page numbers; in the `numbered` variant the pinned boundary numbers already reach both ends, unless
   * `boundary-count` is `0`.
   */
  @property({ type: Boolean, attribute: 'show-first-last' }) showFirstLast = false

  /** Keep the previous/next icons but drop their visible text; the accessible name is unchanged. */
  @property({ type: Boolean, attribute: 'hide-nav-labels' }) hideNavLabels = false

  /** Dim every control and ignore interaction. */
  @property({ type: Boolean, reflect: true }) disabled = false

  @property({ type: String, attribute: 'previous-label' }) previousLabel = 'Previous'
  @property({ type: String, attribute: 'next-label' }) nextLabel = 'Next'
  @property({ type: String, attribute: 'first-label' }) firstLabel = 'First'
  @property({ type: String, attribute: 'last-label' }) lastLabel = 'Last'
  /** Text before the rows-per-page select. A trailing colon is dropped from the select's accessible name. */
  @property({ type: String, attribute: 'page-size-label' }) pageSizeLabel = 'Rows per page:'
  /** Range status of the `compact` variant. Placeholders: `{start}`, `{end}`, `{total}`. */
  @property({ type: String, attribute: 'range-template' }) rangeTemplate = '{start}–{end} of {total}'
  /** Status of the `simple` variant. Placeholders: `{page}`, `{pageCount}`. */
  @property({ type: String, attribute: 'page-template' }) pageTemplate = 'Page {page} of {pageCount}'
  /** Accessible name of a page number. Placeholder: `{page}`. */
  @property({ type: String, attribute: 'page-label-template' }) pageLabelTemplate = 'Go to page {page}'
  /** Accessible name of an ellipsis. Placeholders: `{page}` (where it jumps), `{from}`, `{to}`, `{count}` (pages hidden). */
  @property({ type: String, attribute: 'jump-label-template' }) jumpLabelTemplate = 'Jump to page {page}, skipping {count} pages'

  /** Accessible name of the navigation landmark. */
  @property({ type: String, attribute: 'aria-label' }) override ariaLabel!: string

  /** The nav control the user last pressed, so focus can follow it when the press disables it. */
  private lastPressedNav: 'previous' | 'next' | null = null

  /**
   * The paging host this pager sits inside — a `c2-table` — or `undefined` when it stands alone. While it is set the
   * pager is a controlled view: it reports every request upward and renders whatever the host pushes back.
   */
  @consume({ context: pagerContext, subscribe: true })
  @state()
  private pagerHost: PagerContext | undefined

  /** Upper bound on page numbers that the measured width allows; `null` means the requested counts fit. */
  @state() private maxNumbers: number | null = null

  /** Render the requested counts invisibly for one frame so `measure` can read their natural width. */
  @state() private measuring = false

  @query('.c2-pagination-list') private list?: HTMLElement

  private resizeObserver?: ResizeObserver
  private measuredWidth = -1

  /** Number of pages, from `total-pages` when given, otherwise from `total-items` and `page-size`. At least 1. */
  get pageCount(): number {
    if (this.totalPages > 0) return Math.max(1, Math.floor(this.totalPages))
    const size = Math.max(1, Math.floor(this.pageSize))
    if (this.totalItems > 0) return Math.max(1, Math.ceil(this.totalItems / size))
    return 1
  }

  /** `page` clamped to `1..pageCount`; this is the page the element actually shows. */
  get currentPage(): number {
    return Math.min(Math.max(1, Math.floor(this.page) || 1), this.pageCount)
  }

  /** Zero-based index of the first item of the current page. */
  get startIndex(): number {
    return (this.currentPage - 1) * Math.max(1, Math.floor(this.pageSize))
  }

  /** Zero-based index after the last item of the current page; equals `startIndex` when the total is unknown. */
  get endIndex(): number {
    if (this.totalItems <= 0) return this.startIndex
    return Math.min(this.totalItems, this.startIndex + Math.max(1, Math.floor(this.pageSize)))
  }

  /**
   * The page numbers and ellipses actually rendered: the requested `sibling-count` / `boundary-count`, narrowed by
   * whatever the measured width allows (see `measure`). Reading it tells you what the row shows right now.
   */
  get items(): PaginationItem[] {
    let sibling = Math.max(0, Math.floor(this.siblingCount))
    let boundary = Math.max(0, Math.floor(this.boundaryCount))
    let items = this.itemsFor(sibling, boundary)
    if (this.maxNumbers === null) return items
    // Drop the siblings first, then the boundaries: the current page is the one the user needs to keep seeing.
    while (items.filter((item) => item.kind === 'page').length > this.maxNumbers && (sibling > 0 || boundary > 0)) {
      if (sibling > 0) sibling--
      else boundary--
      items = this.itemsFor(sibling, boundary)
    }
    return items
  }

  /**
   * The page numbers and ellipses for one pair of counts: both ends show `boundary` numbers, the current page shows
   * `sibling` numbers on each side, and everything left over collapses into an ellipsis. An ellipsis standing for a
   * single page is replaced by that page, so the row never grows a gap it did not need, and the number of slots stays
   * the same as the current page moves.
   */
  private itemsFor(sibling: number, boundary: number): PaginationItem[] {
    const count = this.pageCount
    const page = this.currentPage

    const startPages = range(1, Math.min(boundary, count))
    const endPages = range(Math.max(count - boundary + 1, boundary + 1), count)
    const siblingsStart = Math.max(Math.min(page - sibling, count - boundary - sibling * 2 - 1), boundary + 2)
    const siblingsEnd = Math.min(Math.max(page + sibling, boundary + sibling * 2 + 2), endPages.length > 0 ? endPages[0] - 2 : count - 1)

    const pages: (number | 'start-ellipsis' | 'end-ellipsis')[] = [
      ...startPages,
      ...(siblingsStart > boundary + 2 ? (['start-ellipsis'] as const) : boundary + 1 < count - boundary ? [boundary + 1] : []),
      ...range(siblingsStart, siblingsEnd),
      ...(siblingsEnd < count - boundary - 1 ? (['end-ellipsis'] as const) : count - boundary > boundary ? [count - boundary] : []),
      ...endPages,
    ]
    return pages.map((entry, index): PaginationItem => {
      if (typeof entry === 'number') return { kind: 'page', page: entry }
      // The gap runs from just after the number on the left to just before the one on the right; with no number on
      // that side (boundary 0) it runs to the end of the range. Clicking lands in the middle of it.
      const before = pages[index - 1]
      const after = pages[index + 1]
      const from = typeof before === 'number' ? before + 1 : 1
      const to = typeof after === 'number' ? after - 1 : count
      return { kind: 'ellipsis', key: entry, from, to, target: Math.floor((from + to) / 2) }
    })
  }

  /** Show `page`, clamped to the available range. Fires `page-change` when the page actually moves. */
  goToPage(page: number) {
    const previousPage = this.currentPage
    const next = Math.min(Math.max(1, Math.floor(page) || 1), this.pageCount)
    if (next === previousPage && next === this.page) return
    this.page = next
    // A hosted pager only asks; the host clamps, loads, and pushes the settled page back through the context.
    this.pagerHost?.pageChanged(next)
    if (next === previousPage) return
    this.dispatchEvent(
      new CustomEvent<PageChangeEventDetail>('page-change', {
        bubbles: true,
        composed: true,
        detail: {
          page: next,
          previousPage,
          pageSize: this.pageSize,
          pageCount: this.pageCount,
          startIndex: this.startIndex,
          endIndex: this.endIndex,
        },
      }),
    )
  }

  private handleNav(target: number, control: 'previous' | 'next' | null) {
    if (this.disabled) return
    this.lastPressedNav = control
    this.goToPage(target)
  }

  /** Picking another page size keeps the first item of the current page on screen, the way a table footer does. */
  private handlePageSizeChange(event: Event) {
    const detail = (event as CustomEvent<{ value: string[] }>).detail
    const next = Number(detail.value[0])
    const previousPageSize = this.pageSize
    if (!Number.isFinite(next) || next <= 0 || next === previousPageSize) return
    const firstItem = this.startIndex
    const previousPage = this.currentPage
    this.pageSize = next
    this.page = Math.floor(firstItem / next) + 1
    this.pagerHost?.pageSizeChanged(next)
    const page = this.currentPage
    this.dispatchEvent(
      new CustomEvent<PageSizeChangeEventDetail>('page-size-change', {
        bubbles: true,
        composed: true,
        detail: { pageSize: next, previousPageSize, page },
      }),
    )
    if (page !== previousPage) {
      this.dispatchEvent(
        new CustomEvent<PageChangeEventDetail>('page-change', {
          bubbles: true,
          composed: true,
          detail: { page, previousPage, pageSize: next, pageCount: this.pageCount, startIndex: this.startIndex, endIndex: this.endIndex },
        }),
      )
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    // Let a paging host claim this pager. A host that has no page size of its own adopts the one here, which is what
    // makes `<c2-table><c2-pagination slot="footer"></c2-pagination></c2-table>` page with no other configuration.
    this.announce()
    if (isServer || typeof ResizeObserver === 'undefined') return
    this.resizeObserver ??= new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (Math.abs(width - this.measuredWidth) > 0.5) this.requestMeasure()
    })
    this.resizeObserver.observe(this)
    void this.retryAnnounce()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    this.pagerHost = undefined
  }

  private announce() {
    this.dispatchEvent(new CustomEvent<PagerConnectEventDetail>(PAGER_CONNECT_EVENT, { bubbles: true, composed: true, detail: { pageSize: this.pageSize } }))
  }

  /**
   * A host that has not been upgraded yet hears nothing: both the connect event and the context request reach the
   * document and die. That happens whenever this module is evaluated before the host's, which is a bundler's choice,
   * not the author's — so wait for every custom-element ancestor to be defined and then ask once more.
   */
  private async retryAnnounce() {
    if (isServer) return
    const pending: Promise<unknown>[] = []
    for (let node: Element | null = this.parentOf(this); node; node = this.parentOf(node)) {
      const tag = node.localName
      if (tag.includes('-') && !customElements.get(tag)) pending.push(customElements.whenDefined(tag))
    }
    if (pending.length === 0) return
    await Promise.all(pending)
    if (this.isConnected && !this.pagerHost) this.announce()
  }

  private parentOf(node: Element): Element | null {
    const root = node.parentNode
    return node.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
  }

  /** A hosted pager shows the host's paging state, not its own; its own properties are only the standalone fallback. */
  protected override willUpdate(_changed: PropertyValues) {
    const host = this.pagerHost
    if (!host) return
    this.page = host.page
    this.pageSize = host.pageSize
    this.totalItems = host.totalItems
    this.disabled = host.busy
  }

  /** Start over from the requested counts, so a container that grew back gets its page numbers back. */
  private requestMeasure() {
    if (isServer || !this.isConnected || this.variant === 'compact') return
    this.maxNumbers = null
    this.measuring = true
  }

  override updated(changed: PropertyValues) {
    if (changed.has('variant') || changed.has('siblingCount') || changed.has('boundaryCount') || changed.has('showFirstLast') || changed.has('hideNavLabels')) {
      this.requestMeasure()
    }
    if (this.measuring) this.measure()
    this.restoreFocus()
  }

  /**
   * The row never wraps, so when the requested page numbers do not fit the host, work out how many do and let `items`
   * shed siblings and boundaries until they do. One pass: the widest rendered number plus a gap is the cost of a slot,
   * and the overflow divided by that is how many slots have to go. Runs before paint, so there is no flicker.
   */
  private measure() {
    const list = this.list
    this.measuring = false
    if (!list) return
    this.measuredWidth = this.getBoundingClientRect().width
    const available = list.clientWidth + 0.5
    const total = list.scrollWidth
    const numbers = [...list.querySelectorAll<HTMLElement>('.c2-pagination-item')]
    if (total <= available || numbers.length === 0) return
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0
    const slot = Math.max(...numbers.map((number) => number.getBoundingClientRect().width)) + gap
    const drop = slot > 0 ? Math.ceil((total - available) / slot) : numbers.length
    this.maxNumbers = Math.max(1, numbers.length - drop)
  }

  /**
   * Reaching the first or the last page disables the control that was just pressed, which would otherwise drop focus
   * to the document. Hand it to the opposite control so the keyboard user stays in the pagination.
   */
  private restoreFocus() {
    const pressed = this.lastPressedNav
    if (!pressed) return
    this.lastPressedNav = null
    const active = this.shadowRoot?.activeElement
    const button = this.shadowRoot?.querySelector<HTMLButtonElement>(`[data-nav="${pressed}"]`)
    if (!button || button !== active || !button.disabled) return
    this.shadowRoot?.querySelector<HTMLButtonElement>(`[data-nav="${pressed === 'previous' ? 'next' : 'previous'}"]`)?.focus()
  }

  private renderNav(control: 'first' | 'previous' | 'next' | 'last', target: number, disabled: boolean, icon: TemplateResult, label: string) {
    const isPrevNext = control === 'previous' || control === 'next'
    const showLabel = isPrevNext && !this.hideNavLabels && this.variant !== 'compact'
    return html`<button
      class="c2-pagination-control c2-pagination-nav"
      part="nav"
      type="button"
      data-nav=${control}
      aria-label=${label}
      ?disabled=${disabled || this.disabled}
      @click=${() => this.handleNav(target, isPrevNext ? control : null)}
    >
      ${control === 'next' || control === 'last' ? nothing : html`<span class="c2-pagination-icon"><slot name="${control}-icon">${icon}</slot></span>`}
      ${showLabel ? html`<span class="c2-pagination-nav-label">${label}</span>` : nothing}
      ${control === 'next' || control === 'last' ? html`<span class="c2-pagination-icon"><slot name="${control}-icon">${icon}</slot></span>` : nothing}
    </button>`
  }

  private renderPrevious(page: number) {
    return this.renderNav('previous', page - 1, page <= 1, chevronLeft, this.previousLabel)
  }

  private renderNext(page: number, count: number) {
    return this.renderNav('next', page + 1, page >= count, chevronRight, this.nextLabel)
  }

  private renderPages(page: number) {
    return repeat(
      this.items,
      (item) => (item.kind === 'page' ? `page-${item.page}` : item.key),
      (item) =>
        item.kind === 'ellipsis'
          ? html`<li>${this.renderEllipsis(item)}</li>`
          : html`<li>
              <button
                class="c2-pagination-control c2-pagination-item"
                part="item"
                type="button"
                aria-label=${format(this.pageLabelTemplate, { page: item.page })}
                aria-current=${item.page === page ? 'page' : nothing}
                ?disabled=${this.disabled}
                @click=${() => this.handleNav(item.page, null)}
              >
                ${item.page}
              </button>
            </li>`,
    )
  }

  /**
   * The ellipsis is a control, not decoration: it jumps into the middle of the pages it hides, which is the only way
   * to reach them in one move once the row has shed its numbers. It reads as "…" until it is hovered or focused, and
   * then shows the direction it will take you, so the affordance is visible before the click.
   */
  private renderEllipsis(item: Extract<PaginationItem, { kind: 'ellipsis' }>) {
    const backwards = item.key === 'start-ellipsis'
    return html`<button
      class="c2-pagination-control c2-pagination-ellipsis"
      part="ellipsis"
      type="button"
      aria-label=${format(this.jumpLabelTemplate, { page: item.target, from: item.from, to: item.to, count: item.to - item.from + 1 })}
      ?disabled=${this.disabled}
      @click=${() => this.handleNav(item.target, null)}
    >
      <span class="c2-pagination-ellipsis-dots" aria-hidden="true">…</span>
      <span class="c2-pagination-ellipsis-jump c2-pagination-icon" aria-hidden="true">${backwards ? chevronsLeft : chevronsRight}</span>
    </button>`
  }

  private renderNumbered(page: number, count: number) {
    return html`<ul class=${classMap({ 'c2-pagination-list': true, 'is-measuring': this.measuring })}>
      ${this.showFirstLast ? html`<li>${this.renderNav('first', 1, page <= 1, chevronsLeft, this.firstLabel)}</li>` : nothing}
      <li>${this.renderPrevious(page)}</li>
      ${this.renderPages(page)}
      <li>${this.renderNext(page, count)}</li>
      ${this.showFirstLast ? html`<li>${this.renderNav('last', count, page >= count, chevronsRight, this.lastLabel)}</li>` : nothing}
    </ul>`
  }

  private renderSimple(page: number, count: number) {
    return html`<ul class=${classMap({ 'c2-pagination-list': true, 'is-measuring': this.measuring })}>
      ${this.showFirstLast ? html`<li>${this.renderNav('first', 1, page <= 1, chevronsLeft, this.firstLabel)}</li>` : nothing}
      <li>${this.renderPrevious(page)}</li>
      <li class="c2-pagination-status" part="label" aria-live="polite">${format(this.pageTemplate, { page, pageCount: count })}</li>
      <li>${this.renderNext(page, count)}</li>
      ${this.showFirstLast ? html`<li>${this.renderNav('last', count, page >= count, chevronsRight, this.lastLabel)}</li>` : nothing}
    </ul>`
  }

  private renderPageSize() {
    if (this.hidePageSize || this.pageSizeOptions.length === 0) return nothing
    const options = this.pageSizeOptions.includes(this.pageSize) ? this.pageSizeOptions : [...this.pageSizeOptions, this.pageSize].sort((a, b) => a - b)
    return html`<div class="c2-pagination-page-size">
      <span class="c2-pagination-label" part="label">${this.pageSizeLabel}</span>
      <c2-select
        class="c2-pagination-page-size-select"
        part="page-size"
        aria-label=${this.pageSizeLabel.replace(/\s*:\s*$/, '')}
        ?disabled=${this.disabled}
        .value=${[String(this.pageSize)]}
        @selection-change=${this.handlePageSizeChange}
      >
        ${options.map((option) => html`<c2-list-item value=${String(option)}>${option}</c2-list-item>`)}
      </c2-select>
    </div>`
  }

  private renderCompact(page: number, count: number) {
    const total = this.totalItems
    const start = total > 0 ? this.startIndex + 1 : 0
    return html`
      ${this.renderPageSize()}
      ${
        this.hideRange
          ? nothing
          : html`<span class="c2-pagination-label c2-pagination-status" part="label" aria-live="polite"
              >${format(this.rangeTemplate, { start, end: this.endIndex, total })}</span
            >`
      }
      <div class="c2-pagination-arrows">
        ${this.showFirstLast ? this.renderNav('first', 1, page <= 1, chevronsLeft, this.firstLabel) : nothing} ${this.renderPrevious(page)}
        ${this.renderNext(page, count)} ${this.showFirstLast ? this.renderNav('last', count, page >= count, chevronsRight, this.lastLabel) : nothing}
      </div>
    `
  }

  override render() {
    const count = this.pageCount
    const page = this.currentPage
    return html`<nav class="c2-pagination" part="pagination" aria-label=${this.ariaLabel ?? 'Pagination'}>
      ${this.variant === 'compact' ? this.renderCompact(page, count) : this.variant === 'simple' ? this.renderSimple(page, count) : this.renderNumbered(page, count)}
    </nav>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-pagination': Pagination
  }
}
