import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/select'
import '@c2n/spinner'
import { orderBookMessages } from './messages'
import styles from './order-book.scss?inline'

export { orderBookMessages } from './messages'

/** The buy side (`bid`) or the sell side (`ask`). */
export type OrderBookSide = 'bid' | 'ask'

/** One price level: the size resting at a price. */
export interface OrderBookLevel {
  price: number
  size: number
}

/** A level as a feed sends it: an object or a `[price, size]` pair, with numbers or numeric strings. */
export type OrderBookLevelInput = { price: number | string; size: number | string } | readonly [number | string, number | string]

/** A change to the book: levels to set on each side, where a size of 0 removes the level. */
export interface OrderBookDelta {
  bids?: readonly OrderBookLevelInput[]
  asks?: readonly OrderBookLevelInput[]
}

export interface OrderBookPriceSelectDetail {
  side: OrderBookSide
  price: number
  /** The size at that price (at the grouped price when grouping). */
  size: number
  /** The cumulative size from the best price to this one. */
  total: number
}

/** Events fired by {@link OrderBook}, keyed for `addEventListener`. */
export interface OrderBookEventMap {
  'price-select': CustomEvent<OrderBookPriceSelectDetail>
  'group-change': CustomEvent<{ group: number }>
}

export interface OrderBook {
  addEventListener: TypedAddEventListener<OrderBook, OrderBookEventMap>
  removeEventListener: TypedRemoveEventListener<OrderBook, OrderBookEventMap>
}

interface Row {
  side: OrderBookSide
  price: number
  size: number
  total: number
  depth: number
  own: boolean
  flash?: string
}

/** Fraction digits shown for prices when neither `price-precision` nor `group` decides: never more than this. */
const MAX_DIGITS = 8

const decimalsOf = (value: number | string): number => {
  const text = String(value)
  const exponent = /e-(\d+)$/i.exec(text)
  if (exponent) return Math.min(MAX_DIGITS, Number(exponent[1]))
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : Math.min(MAX_DIGITS, text.length - dot - 1)
}

/** Rounds away the float noise that `Math.floor(price / step) * step` leaves (0.30000000000000004). */
const clean = (value: number): number => Math.round(value * 1e8) / 1e8

/** The price step a level falls in: bids round down to it, asks round up, so a merged level never looks better than it is. */
const bucket = (side: OrderBookSide, price: number, step: number): number =>
  step ? clean((side === 'bid' ? Math.floor(clean(price / step)) : Math.ceil(clean(price / step))) * step) : price

const levelOf = (input: OrderBookLevelInput): [number, number, number | string] | undefined => {
  const [price, size] = Array.isArray(input) ? input : [(input as OrderBookLevel).price, (input as OrderBookLevel).size]
  const p = Number(price)
  const s = Number(size)
  if (!Number.isFinite(p) || !Number.isFinite(s) || s < 0) return undefined
  return [p, s, price as number | string]
}

/**
 * Live bids and asks with depth bars, price grouping and a spread row, like the order books of Binance, Coinbase
 * Advanced and Kraken Pro. Bids are drawn high to low and asks low to high; each row shows the size at its price and
 * the cumulative total from the best price, with a bar sized by that total behind it.
 *
 * `bids` and `asks` take a snapshot (`{ price, size }` objects or the `[price, size]` pairs exchange feeds send, as
 * numbers or numeric strings); `applyDelta()` patches it from a stream, a size of 0 removing a level. Only `depth`
 * levels a side are drawn, so a deep book renders as cheaply as a shallow one. A level whose size changes flashes
 * green when it grew and red when it shrank (not under `prefers-reduced-motion`).
 *
 * `layout` stacks the asks over the bids with the spread between them, or sets them side by side. `group` merges levels
 * into price steps (bids round down, asks round up), and `groups` lists the steps the reader may pick in the header.
 * `last-price` puts the last trade in the spread row instead of the mid price, and `own-prices` marks the prices the
 * user has orders at.
 *
 * Clicking a row, or pressing Enter on it, fires `price-select`: the hook for filling a trade form. The rows share one
 * tab stop, and the arrow keys move between them. Each side is a table, so a screen reader reads its columns; the
 * spread row is not a live region, since a live book would never stop talking.
 *
 * @tag c2-order-book
 *
 * @event {CustomEvent<{ side: 'bid' | 'ask'; price: number; size: number; total: number }>} price-select - Fired when a row is clicked or Enter is pressed on it. Does not bubble.
 * @event {CustomEvent<{ group: number }>} group-change - Fired when the reader picks a price step in the header. Does not bubble.
 *
 * @csspart header - The heading and the price grouping picker.
 * @csspart spread - The row between the two sides: the mid or last price and the spread.
 * @csspart row - Every price level row.
 * @csspart empty - The message shown while the book is empty or loading.
 *
 * @internalcomponent c2-select
 * @internalcomponent c2-spinner
 *
 * @cssproperty {border} [--c2-order-book--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-order-book--border-radius=8px]
 * @cssproperty {color} [--c2-order-book--background=#ffffff]
 * @cssproperty {color} [--c2-order-book--color=#18181b]
 * @cssproperty {font-size} [--c2-order-book--font-size=12px]
 * @cssproperty {font-family} [--c2-order-book--font-family=inherit]
 * @cssproperty {border} [--c2-order-book__divider--border=1px solid #e4e4e7] - The lines under the header, around the spread row and between the sides.
 * @cssproperty {display} [--c2-order-book__header--display=flex] - `none` hides the heading and the grouping picker.
 * @cssproperty {padding} [--c2-order-book__header--padding=8px 12px]
 * @cssproperty {font-size} [--c2-order-book__title--font-size=14px]
 * @cssproperty {font-weight} [--c2-order-book__title--font-weight=600]
 * @cssproperty {pixel} [--c2-order-book__grouping--width=96px] - Width of the price grouping picker.
 * @cssproperty {color} [--c2-order-book__column-header--color=#71717a]
 * @cssproperty {pixel} [--c2-order-book__row--height=20px]
 * @cssproperty {pixel} [--c2-order-book__row--padding-inline=12px]
 * @cssproperty {color} [--c2-order-book__row__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-order-book__row__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {color} [--c2-order-book__bid--color=light-dark(#166534, #4ade80)] - Bid prices; the bid bars and flashes are mixed from it. The light and dark values keep 4.5:1 on the bars.
 * @cssproperty {color} [--c2-order-book__ask--color=light-dark(#b91c1c, #f87171)] - Ask prices; the ask bars and flashes are mixed from it. The light and dark values keep 4.5:1 on the bars.
 * @cssproperty {color} [--c2-order-book__bid-bar--background=color-mix(in srgb, var(--c2-order-book__bid--color, light-dark(#166534, #4ade80)) 14%, transparent)] - The depth bars of the bids.
 * @cssproperty {color} [--c2-order-book__ask-bar--background=color-mix(in srgb, var(--c2-order-book__ask--color, light-dark(#b91c1c, #f87171)) 14%, transparent)] - The depth bars of the asks.
 * @cssproperty {color} [--c2-order-book__flash__up--background=color-mix(in srgb, var(--c2-order-book__bid--color, light-dark(#166534, #4ade80)) 20%, transparent)] - A level whose size grew.
 * @cssproperty {color} [--c2-order-book__flash__down--background=color-mix(in srgb, var(--c2-order-book__ask--color, light-dark(#b91c1c, #f87171)) 20%, transparent)] - A level whose size shrank.
 * @cssproperty {duration} [--c2-order-book__flash--duration=600ms]
 * @cssproperty {pixel} [--c2-order-book__own--size=4px] - The dot after a price the user has an order at.
 * @cssproperty {color} [--c2-order-book__spread--background=#fafafa]
 * @cssproperty {padding} [--c2-order-book__spread--padding=6px 12px]
 * @cssproperty {font-size} [--c2-order-book__spread__price--font-size=16px]
 * @cssproperty {font-weight} [--c2-order-book__spread__price--font-weight=600]
 * @cssproperty {color} [--c2-order-book__spread__label--color=#71717a]
 * @cssproperty {pixel} [--c2-order-book__empty--min-height=160px]
 * @cssproperty {color} [--c2-order-book__empty--color=#71717a]
 */
@customElement('c2-order-book')
export class OrderBook extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The buy side, best first or in any order: a snapshot that replaces the bids. */
  @property({ converter: jsonPropertyConverter }) bids: readonly OrderBookLevelInput[] = []

  /** The sell side, in any order: a snapshot that replaces the asks. */
  @property({ converter: jsonPropertyConverter }) asks: readonly OrderBookLevelInput[] = []

  /** Asks over bids with the spread between (`stacked`), or bids and asks side by side (`split`). */
  @property() layout: 'stacked' | 'split' = 'stacked'

  /** Levels drawn on each side. */
  @property({ type: Number }) depth = 10

  /** The price step levels are merged into: bids round down to it, asks round up. 0 shows every price. */
  @property({ type: Number }) group = 0

  /** Price steps the reader may pick from in the header, as a `;` list (`"0.01;0.1;1;10"`). */
  @property({ converter: arrayPropertyConverter }) groups: string[] = []

  /** The traded asset, for the size header: "Size (BTC)". */
  @property() base = ''

  /** The pricing asset, for the price header: "Price (USD)". */
  @property() quote = ''

  /** Fraction digits of prices. Without it: the group step's, else the most the data has. */
  @property({ attribute: 'price-precision', type: Number }) pricePrecision?: number

  /** Fraction digits of sizes and totals. */
  @property({ attribute: 'size-precision', type: Number }) sizePrecision = 4

  /** The last trade price, shown in the spread row with an arrow against the previous one. Without it: the mid price. */
  @property({ attribute: 'last-price', type: Number }) lastPrice?: number

  /** Prices the user has orders at, as a `;` list: each gets a dot. */
  @property({ attribute: 'own-prices', converter: arrayPropertyConverter }) ownPrices: string[] = []

  /** The heading and accessible name. */
  @property() label = ''

  /** Shows a spinner and "Waiting for the book…" while the book is empty. */
  @property({ type: Boolean }) loading = false

  /** The locale numbers are formatted in. Without it: the nearest `lang`. */
  @property() locale = ''

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, orderBookMessages, () => this.locale)
  private readonly levels: Record<OrderBookSide, Map<number, number>> = { bid: new Map(), ask: new Map() }
  /** Fraction digits the data itself carries, for prices. */
  private dataDigits: Record<OrderBookSide, number> = { bid: 0, ask: 0 }
  private rows: Record<OrderBookSide, Row[]> = { bid: [], ask: [] }
  /** The sizes drawn last time, to tell which levels changed. */
  private shown = new Map<string, number>()
  /** Each changed level's flash class, alternating between two names so a second change replays the animation. */
  private flashes = new Map<string, string>()
  private flashTurn = new Map<string, number>()
  private dataChanged = false
  /** Deltas from `applyDelta`, merged at the next update after any snapshot. */
  private deltas: OrderBookDelta[] = []
  private previousLast?: number
  private lastDirection: 'up' | 'down' | '' = ''
  /** The row holding the tab stop. */
  private focusKey = ''
  private formats = new Map<string, Intl.NumberFormat>()

  constructor() {
    super()
    this.internals.role = 'region'
  }

  /**
   * Patches the book from a stream: each level sets the size at its price, and a size of 0 removes it. Several deltas
   * in one task are drawn in one render.
   */
  applyDelta(delta: OrderBookDelta): void {
    // Queued, not merged now: a snapshot set in the same task (`bids = …` then the buffered deltas) is applied
    // when the element updates, and the deltas have to land on it rather than be wiped by it.
    this.deltas.push(delta)
    this.requestUpdate()
  }

  /** `last-price` when it is a number: a removed attribute reads as `null`, which is no price. */
  private get last(): number | undefined {
    return typeof this.lastPrice === 'number' && Number.isFinite(this.lastPrice) ? this.lastPrice : undefined
  }

  /** The levels drawn on a side, best first, after grouping. */
  levelsOf(side: OrderBookSide): OrderBookLevel[] {
    return this.rows[side].map(({ price, size }) => ({ price, size }))
  }

  private merge(side: OrderBookSide, levels: readonly OrderBookLevelInput[]): void {
    const map = this.levels[side]
    for (const input of levels) {
      const level = levelOf(input)
      if (!level) continue
      const [price, size, raw] = level
      if (size === 0) map.delete(price)
      else {
        map.set(price, size)
        this.dataDigits[side] = Math.max(this.dataDigits[side], decimalsOf(raw))
      }
    }
  }

  private replace(side: OrderBookSide, levels: readonly OrderBookLevelInput[]): void {
    this.levels[side].clear()
    this.dataDigits[side] = 0
    this.merge(side, Array.isArray(levels) ? levels : [])
    this.dataChanged = true
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('bids')) this.replace('bid', this.bids)
    if (changed.has('asks')) this.replace('ask', this.asks)
    for (const delta of this.deltas.splice(0)) {
      if (delta.bids) this.merge('bid', delta.bids)
      if (delta.asks) this.merge('ask', delta.asks)
      this.dataChanged = true
    }
    if (changed.has('lastPrice')) {
      const last = this.last
      const previous = this.previousLast
      if (last === undefined) this.lastDirection = ''
      else if (previous !== undefined && last !== previous) this.lastDirection = last > previous ? 'up' : 'down'
      this.previousLast = last
    }
    // Regrouping or a deeper view redraws levels that did not trade: no flash for those.
    const regrouped = changed.has('group') || changed.has('depth')
    // The levels are regrouped and sorted only when they or the view changed, not for a new last price or label.
    if (this.dataChanged || regrouped || changed.has('ownPrices')) {
      this.rows = { bid: this.build('bid'), ask: this.build('ask') }
      this.track(this.dataChanged && !regrouped && this.hasUpdated)
    }
    this.dataChanged = false
    this.internals.ariaLabel = this.label || this.msg.t('label')
  }

  private build(side: OrderBookSide): Row[] {
    const step = this.group > 0 ? this.group : 0
    let levels: Map<number, number> = this.levels[side]
    if (step) {
      const grouped = new Map<number, number>()
      for (const [price, size] of levels) {
        const key = bucket(side, price, step)
        grouped.set(key, (grouped.get(key) ?? 0) + size)
      }
      levels = grouped
    }
    const depth = Math.max(1, Math.floor(this.depth) || 1)
    const prices = [...levels.keys()].sort((a, b) => (side === 'bid' ? b - a : a - b)).slice(0, depth)
    const own = new Set(
      this.ownPrices
        .map(Number)
        .filter(Number.isFinite)
        .map((price) => bucket(side, price, step)),
    )
    let total = 0
    return prices.map((price) => {
      const size = levels.get(price) ?? 0
      total += size
      return { side, price, size, total, depth: 0, own: own.has(price) }
    })
  }

  /** Sizes the depth bars against the deepest total drawn, and flashes the levels whose size changed. */
  private track(flash: boolean): void {
    const all = [...this.rows.bid, ...this.rows.ask]
    const max = Math.max(0, ...all.map((row) => row.total))
    const next = new Map<string, number>()
    for (const row of all) {
      row.depth = max ? row.total / max : 0
      const key = `${row.side}:${row.price}`
      next.set(key, row.size)
      const before = this.shown.get(key)
      if (flash && before !== undefined && before !== row.size) {
        const turn = ((this.flashTurn.get(key) ?? 0) + 1) % 2
        this.flashTurn.set(key, turn)
        this.flashes.set(key, `flash-${row.size > before ? 'up' : 'down'}-${turn}`)
      }
      row.flash = this.flashes.get(key)
    }
    for (const key of this.flashes.keys()) if (!next.has(key)) this.flashes.delete(key)
    for (const key of this.flashTurn.keys()) if (!next.has(key)) this.flashTurn.delete(key)
    this.shown = next
  }

  private format(value: number, digits: number, style: 'decimal' | 'percent' = 'decimal'): string {
    const locale = this.msg.locale
    const key = `${locale}|${digits}|${style}`
    let format = this.formats.get(key)
    if (!format) {
      try {
        format =
          style === 'percent'
            ? new Intl.NumberFormat(locale, { style, maximumFractionDigits: digits })
            : new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
      } catch {
        format = new Intl.NumberFormat('en', { minimumFractionDigits: digits, maximumFractionDigits: digits })
      }
      this.formats.set(key, format)
    }
    return format.format(value)
  }

  private get priceDigits(): number {
    if (this.pricePrecision !== undefined && Number.isFinite(this.pricePrecision)) return Math.min(MAX_DIGITS, Math.max(0, Math.floor(this.pricePrecision)))
    if (this.group > 0) return decimalsOf(this.group)
    return Math.max(this.dataDigits.bid, this.dataDigits.ask)
  }

  private get sizeDigits(): number {
    return Number.isFinite(this.sizePrecision) ? Math.min(MAX_DIGITS, Math.max(0, Math.floor(this.sizePrecision))) : 4
  }

  private select(row: Row): void {
    this.focusKey = `${row.side}:${row.price}`
    this.dispatchEvent(new CustomEvent('price-select', { detail: { side: row.side, price: row.price, size: row.size, total: row.total } }))
  }

  private handleKeydown(event: KeyboardEvent, row: Row): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.select(row)
      return
    }
    const rows = [...this.renderRoot.querySelectorAll<HTMLElement>('.row')]
    const index = rows.indexOf(event.currentTarget as HTMLElement)
    const targets: Record<string, number> = { ArrowDown: Math.min(rows.length - 1, index + 1), ArrowUp: Math.max(0, index - 1), Home: 0, End: rows.length - 1 }
    if (!(event.key in targets)) return
    event.preventDefault()
    rows[targets[event.key]]?.focus()
  }

  /** Moves the one tab stop to the row that took focus, by keyboard or by a click. */
  private handleFocus(event: FocusEvent): void {
    const row = event.currentTarget as HTMLElement
    this.focusKey = row.dataset.key ?? ''
    for (const element of this.renderRoot.querySelectorAll<HTMLElement>('.row')) element.tabIndex = element === row ? 0 : -1
  }

  private handleGroup(event: CustomEvent<{ value: string[] }>): void {
    const group = Number(event.detail.value[0])
    if (!Number.isFinite(group) || group === this.group) return
    this.group = group
    this.dispatchEvent(new CustomEvent('group-change', { detail: { group } }))
  }

  /** The select inside fires `input`/`change` and enrols in a field: none of that is the book's. */
  private stopInner(event: Event): void {
    event.stopPropagation()
  }

  private renderHead(side: OrderBookSide | 'both', hidden = false) {
    return html`<div role="rowgroup" class=${hidden ? 'visually-hidden' : ''}>
      <div role="row" class="head">${this.renderHeadCells(side, 'columnheader')}</div>
    </div>`
  }

  private renderHeadCells(side: OrderBookSide | 'both', role?: 'columnheader') {
    const price = this.quote ? this.msg.t('priceIn', this.quote) : this.msg.t('price')
    const size = this.base ? this.msg.t('sizeIn', this.base) : this.msg.t('size')
    const cells =
      side === 'bid'
        ? [this.msg.t('total'), size, this.msg.t('bid')]
        : side === 'ask'
          ? [this.msg.t('ask'), size, this.msg.t('total')]
          : [price, size, this.msg.t('total')]
    return cells.map((cell) => html`<span role=${role ?? nothing}>${cell}</span>`)
  }

  private renderRow(row: Row, mirrored: boolean, focusKey: string) {
    const key = `${row.side}:${row.price}`
    const price = html`<span role="rowheader" class="price"
      >${this.format(row.price, this.priceDigits)}${
        row.own ? html`<span class="own" aria-hidden="true"></span><span class="visually-hidden">, ${this.msg.t('own')}</span>` : nothing
      }</span
    >`
    const size = html`<span role="cell">${this.format(row.size, this.sizeDigits)}</span>`
    const total = html`<span role="cell">${this.format(row.total, this.sizeDigits)}</span>`
    return html`<div
      role="row"
      part="row"
      class="row row--${row.side} ${row.flash ?? ''} ${row.own ? 'row--own' : ''}"
      data-key=${key}
      tabindex=${key === focusKey ? 0 : -1}
      style=${styleMap({ '--_depth': row.depth.toFixed(4) })}
      @click=${(event: MouseEvent) => {
        // WebKit does not focus a clicked tabindex="-1" element in a shadow root: focus it, so the tab stop follows.
        ;(event.currentTarget as HTMLElement).focus()
        this.select(row)
      }}
      @keydown=${(event: KeyboardEvent) => this.handleKeydown(event, row)}
      @focus=${this.handleFocus}
    >
      ${mirrored ? html`${total}${size}${price}` : html`${price}${size}${total}`}
    </div>`
  }

  private renderSide(side: OrderBookSide, rows: Row[], focusKey: string, head: 'shown' | 'hidden', mirrored = false) {
    return html`<div role="table" class="side side--${side}" aria-label=${this.msg.t(side === 'bid' ? 'bids' : 'asks')}>
      ${this.renderHead(this.layout === 'split' ? side : 'both', head === 'hidden')}
      <div role="rowgroup">
        ${repeat(
          rows,
          (row) => `${row.side}:${row.price}`,
          (row) => this.renderRow(row, mirrored, focusKey),
        )}
      </div>
    </div>`
  }

  private renderSpread() {
    // A loop, not Math.max(...keys): spreading a deep book's prices as arguments overflows the stack.
    let bid = -Infinity
    let ask = Infinity
    for (const price of this.levels.bid.keys()) if (price > bid) bid = price
    for (const price of this.levels.ask.keys()) if (price < ask) ask = price
    const both = Number.isFinite(bid) && Number.isFinite(ask)
    const mid = both ? (bid + ask) / 2 : undefined
    const last = this.last
    const shown = last ?? mid
    const digits = this.priceDigits
    const spread = both ? clean(ask - bid) : undefined
    const arrow = last !== undefined && this.lastDirection ? (this.lastDirection === 'up' ? '↑' : '↓') : ''
    return html`<div class="spread" part="spread">
      ${
        shown !== undefined
          ? html`<span class="spread__price ${last !== undefined ? `spread__price--${this.lastDirection || 'flat'}` : ''}"
              ><span class="visually-hidden">${this.msg.t(last !== undefined ? 'last' : 'mid')} </span>${this.format(
                shown,
                last === undefined && mid !== undefined ? Math.max(digits, decimalsOf(clean(mid))) : digits,
              )}${arrow ? html`<span aria-hidden="true"> ${arrow}</span>` : nothing}</span
            >`
          : nothing
      }
      ${
        spread !== undefined && mid
          ? html`<span class="spread__label">${this.msg.t('spread', this.format(spread, digits), this.format(spread / mid, 3, 'percent'))}</span>`
          : nothing
      }
    </div>`
  }

  private renderGrouping() {
    if (this.groups.length < 2) return nothing
    const current = this.groups.find((step) => Number(step) === this.group) ?? ''
    return html`<span class="grouping" @c2-field-connect=${this.stopInner} @input=${this.stopInner} @change=${this.stopInner}>
      <c2-select aria-label=${this.msg.t('grouping')} value=${current} @selection-change=${this.handleGroup}>
        ${this.groups.map((step) => html`<c2-list-item value=${step}>${step}</c2-list-item>`)}
      </c2-select>
    </span>`
  }

  override render() {
    const { bid, ask } = this.rows
    const empty = !bid.length && !ask.length
    // The tab stop stays on the row it was on; a row gone from the view hands it to the first row.
    const keys = [...(this.layout === 'split' ? [...bid, ...ask] : [...[...ask].reverse(), ...bid])].map((row) => `${row.side}:${row.price}`)
    const focusKey = keys.includes(this.focusKey) ? this.focusKey : (keys[0] ?? '')
    let body
    if (empty) {
      // Column headers keep the layout steady while the book fills; with no rows there is no table for them to head.
      body = html`<div class="head" aria-hidden="true">${this.renderHeadCells('both')}</div>
        <div class="empty" part="empty" role="status">
          ${this.loading ? html`<c2-spinner aria-hidden="true"></c2-spinner>` : nothing}<span>${this.msg.t(this.loading ? 'loading' : 'empty')}</span>
        </div>`
    } else if (this.layout === 'split') {
      body = html`${this.renderSpread()}
        <div class="sides">${this.renderSide('bid', bid, focusKey, 'shown', true)}${this.renderSide('ask', ask, focusKey, 'shown')}</div>`
    } else {
      body = html`${this.renderSide('ask', [...ask].reverse(), focusKey, 'shown')}${this.renderSpread()}${this.renderSide('bid', bid, focusKey, 'hidden')}`
    }
    return html`<div class="book book--${this.layout === 'split' ? 'split' : 'stacked'}">
      <div class="header" part="header"><span class="title">${this.label || this.msg.t('label')}</span>${this.renderGrouping()}</div>
      ${body}
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-order-book': OrderBook
  }
}
