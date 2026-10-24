import { html, nothing, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import type uPlot from 'uplot'
import type { Options } from 'uplot'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import depthStyles from './depth-chart.scss?inline'
import { ChartBase, type ChartEventMap } from './chart-base.js'
import { UplotChartBase, type UplotSeriesStyle } from './uplot-chart-base.js'
import { steppedPaths, withAlpha } from './engines/uplot-paths.js'
import { depthMessages } from './messages.js'
import {
  buildDepthBook,
  depthAt,
  depthReadout,
  depthSeries,
  depthWindow,
  mirrorReadout,
  type DepthBook,
  type DepthLevelInput,
  type DepthPoint,
  type DepthReadout,
  type DepthSeries,
} from './depth-model.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { ChartFrame, ChartRangeEventDetail, ChartSeriesConfig, ChartTooltipContext } from './chart-types.js'

export type { DepthLevelInput, DepthReadout, DepthSide } from './depth-model.js'

/** What `renderTooltip`, `tooltip-change` and a linked `c2-chart-tooltip` receive from a depth chart. */
export interface DepthTooltipContext extends ChartTooltipContext {
  /** The hovered level's readout; absent on the mid price between the two sides. */
  readout?: DepthReadout
  /** The other side's readout at the same distance from the mid price, while `mirror` is on. */
  mirror?: DepthReadout
}

/** Events of `c2-depth-chart`: the shared chart events plus `price-select`. */
export interface DepthChartEventMap extends ChartEventMap {
  'price-select': CustomEvent<DepthReadout>
}

export interface DepthChart {
  addEventListener: TypedAddEventListener<DepthChart, DepthChartEventMap>
  removeEventListener: TypedRemoveEventListener<DepthChart, DepthChartEventMap>
}

/** What the engine reports on hover, as `ChartBase.handleEngineHover` receives it. */
type EngineHoverDetail = { index: number; seriesIndex: number; px: number; py: number; name?: string; component?: string; dataType?: string }

/** The zoom steps `+` and `-` (and ctrl or ⌘ + wheel) move between, as a share of the mid price either side. */
const RANGE_STEPS = [0.001, 0.0025, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25]

/**
 * A market depth chart: the cumulative size resting in an order book on each side of the mid price, bids rising to
 * the left and asks to the right, drawn by uPlot.
 *
 * `bids` and `asks` take the levels as an exchange sends them, `[price, size]` pairs or `{ price, size }` rows,
 * numbers or numeric strings, in any order; the chart sorts and sums them. A new book is a data-only update: it
 * redraws without rebuilding the chart, so a live feed can assign one on every message.
 *
 * ```html
 * <c2-depth-chart range="0.02" base-label="BTC" quote-label="USD"
 *   bids='[["67410.5", "1.204"], ["67410.0", "0.500"]]'
 *   asks='[["67414.5", "0.820"], ["67415.0", "2.000"]]'>
 * </c2-depth-chart>
 * ```
 *
 * Hovering shows the cumulative size and notional to that price, the average price a market order that far would
 * fill at and its price impact, and marks the same distance on the other side. A click, or Enter on a level reached
 * with the arrow keys, fires `price-select`. `+` and `-`, or ctrl or ⌘ with the wheel, zoom by changing `range`.
 * `data`, `series` and `c2-chart-series` children are not read.
 *
 * @tag c2-depth-chart
 *
 * @event {CustomEvent<DepthReadout>} price-select - Fired when a price is clicked, or picked with Enter: the price, its side, the cumulative size and notional to it, the average fill price and the price impact. Does not bubble.
 *
 * @csspart mirror-marker - The marker at the same distance from the mid price on the other side, while hovering.
 * @csspart focus-marker - The marker on the level reached with the arrow keys.
 *
 * @cssproperty {color} [--c2-chart__bid--color=#16a34a] - Colour of the bid curve and its fill. Falls back to `--c2-chart__positive--color`.
 * @cssproperty {color} [--c2-chart__ask--color=#dc2626] - Colour of the ask curve and its fill. Falls back to `--c2-chart__negative--color`.
 * @cssproperty {opacity} [--c2-chart__area--opacity=0.15] - Opacity of the fill under each curve.
 * @cssproperty {pixel} [--c2-chart__line--width=2px] - Stroke width of the two curves.
 * @cssproperty {pixel} [--c2-chart__grid--width=1px] - Width of the grid lines.
 * @cssproperty {color} [--c2-chart__mid-line--color=#a1a1aa] - Colour of the dashed line at the mid price.
 * @cssproperty {color} [--c2-chart__mid-label--background-color=#18181b] - Background of the mid price label.
 * @cssproperty {color} [--c2-chart__mid-label--color=#fafafa] - Text colour of the mid price label.
 * @cssproperty {pixel} [--c2-chart__mirror-marker--size=8px] - Diameter of the mirror and focus markers.
 * @cssproperty {color} [--c2-chart__mirror-marker--background-color=#ffffff] - Fill of the mirror marker, ringed in the other side's colour.
 * @cssproperty {outline} [--c2-chart__plot__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the plot, the chart's tab stop.
 */
@customElement('c2-depth-chart')
export class DepthChart extends UplotChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(depthStyles)]

  /** Bid levels, `[price, size]` pairs or `{ price, size }` rows, in any order. A size of 0 is ignored. */
  @property({ converter: jsonPropertyConverter }) bids?: DepthLevelInput[]

  /** Ask levels, in the same shapes as `bids`. */
  @property({ converter: jsonPropertyConverter }) asks?: DepthLevelInput[]

  /** How far either side of the mid price the chart reaches, as a fraction of it: `0.02` shows ±2%. */
  @property({ type: Number }) range = 0.02

  /** The centre of the chart, such as an index or mark price. Defaults to the midpoint of the best bid and best ask. */
  @property({ type: Number }) mid?: number

  /** Whether the curves sum size in the base currency or notional (`price × size`) in the quote currency. */
  @property({ type: String }) unit: 'base' | 'quote' = 'base'

  /** `step` draws each level as a step, as exchanges do; `linear` joins the levels directly. */
  @property({ type: String }) curve: 'step' | 'linear' = 'step'

  /** Marks the same distance from the mid price on the other side while hovering, and adds it to the tooltip. */
  @property({ type: Boolean }) mirror = true

  /** Name of the base currency (`BTC`), printed after sizes. */
  @property({ type: String, attribute: 'base-label' }) baseLabel = ''

  /** Name of the quote currency (`USD`), printed after prices and notionals. */
  @property({ type: String, attribute: 'quote-label' }) quoteLabel = ''

  /** Decimals of a price. Defaults to the most any input price carries. */
  @property({ type: Number, attribute: 'price-precision' }) pricePrecision?: number

  /** Decimals of a size. Defaults to the most any input size carries, at most 8. */
  @property({ type: Number, attribute: 'size-precision' }) sizePrecision?: number

  private readonly msg = new LocalizeController(this, depthMessages, () => this.locale)

  #book: DepthBook = buildDepthBook([], [])
  #series: DepthSeries = { points: [], x: [], bids: [], asks: [] }
  #window = { min: 0, max: 0 }
  /** The y scale's top, as the range function last set it: what the markers are placed against. */
  #yMax = 1
  /** The point reached with the arrow keys, or `-1`. */
  #focused = -1
  #announceTimer?: ReturnType<typeof setTimeout>
  #formats = new Map<string, Intl.NumberFormat>()

  constructor() {
    super()
    this.legend = 'none'
  }

  // ------------------------------------------------------------- the model ---

  /** The summed book currently drawn. */
  get book(): DepthBook {
    return this.#book
  }

  /** The price window currently drawn, `range` either side of the mid price. */
  get visibleRange(): { min: number; max: number } {
    return { ...this.#window }
  }

  protected override isDataKey(key: string): boolean {
    return key === 'bids' || key === 'asks' || super.isDataKey(key)
  }

  protected override reshapesFrame(changed: PropertyValues): boolean {
    return ['bids', 'asks', 'range', 'mid', 'unit'].some((key) => changed.has(key)) || super.reshapesFrame(changed)
  }

  protected override buildFrame(): ChartFrame | undefined {
    if (this.bids === undefined && this.asks === undefined) return undefined
    this.#book = buildDepthBook(this.bids, this.asks, this.mid)
    this.#window = depthWindow(this.#book, this.range)
    this.#series = depthSeries(this.#book, this.#window, this.unit)
    const { x, bids, asks } = this.#series
    // A fresh frame per book: nothing caches on it, so identity alone says it is new.
    return { x: Float64Array.from(x), columns: [bids, asks], length: x.length, capacity: x.length, revision: 0 }
  }

  protected override projectData(): unknown {
    const { x, bids, asks } = this.#series
    return [x, bids, asks]
  }

  override get resolvedSeries(): ChartSeriesConfig[] {
    return [
      { field: 'bids', label: this.msg.t('bids'), color: this.#sideColor('bid') },
      { field: 'asks', label: this.msg.t('asks'), color: this.#sideColor('ask') },
    ]
  }

  protected override inferredSeries(): ChartSeriesConfig[] {
    return this.resolvedSeries
  }

  #sideColor(side: 'bid' | 'ask'): string {
    const theme = this.themeController.theme
    return side === 'bid'
      ? this.themeController.resolveColor('var(--c2-chart__bid--color, var(--c2-chart__positive--color, #16a34a))', theme.positive)
      : this.themeController.resolveColor('var(--c2-chart__ask--color, var(--c2-chart__negative--color, #dc2626))', theme.negative)
  }

  // ----------------------------------------------------------- the engine ---

  protected override seriesStyle(series: ChartSeriesConfig, index: number, context: ChartBuildContext): UplotSeriesStyle {
    const color = this.colorOf(series, index, context.theme)
    const raw = parseFloat(getComputedStyle(this).getPropertyValue('--c2-chart__area--opacity'))
    const opacity = Number.isFinite(raw) ? raw : 0.15
    return {
      stroke: color,
      width: context.theme.lineWidth,
      fill: withAlpha(color, opacity),
      // Bids are summed right to left, so between two levels the curve takes the value of the one nearer the mid.
      paths: this.curve === 'step' ? steppedPaths(index === 0 ? -1 : 1) : undefined,
      spanGaps: false,
      points: { show: false },
    }
  }

  /** Two sides of one book: a click picks a price, it does not set one side apart. */
  protected override highlightKeyAt(): string | undefined {
    return undefined
  }

  protected override decorateOptions(options: Options): Options {
    const scales = options.scales ?? {}
    return {
      ...options,
      scales: {
        ...scales,
        x: { ...scales.x, range: () => [this.#window.min, this.#window.max] },
        // Depth starts at zero; the top leaves room for the mid price label.
        y:
          this.yMin === undefined && this.yMax === undefined
            ? {
                ...scales.y,
                range: (_self: uPlot, _min: number, max: number) => {
                  this.#yMax = max > 0 ? max * 1.12 : 1
                  return [0, this.#yMax]
                },
              }
            : scales.y,
      },
      hooks: { ...options.hooks, draw: [...(options.hooks?.draw ?? []), (self: uPlot) => this.#drawMid(self)] },
    }
  }

  /** The dashed line and the label at the mid price, drawn on the canvas after each redraw. */
  #drawMid(self: uPlot): void {
    const book = this.#book
    if (!(book.mid > 0)) return
    const context = self.ctx
    const ratio = self.bbox.width / Math.max(1, self.over.clientWidth || self.bbox.width)
    const x = Math.round(self.valToPos(book.mid, 'x', true)) + 0.5
    const { top, height } = self.bbox
    const lineColor = this.themeController.resolveColor('var(--c2-chart__mid-line--color, #a1a1aa)', this.themeController.theme.crosshairColor)
    context.save()
    context.strokeStyle = lineColor
    context.lineWidth = ratio
    context.setLineDash([4 * ratio, 4 * ratio])
    context.beginPath()
    context.moveTo(x, top)
    context.lineTo(x, top + height)
    context.stroke()
    context.setLineDash([])

    const theme = this.themeController.theme
    const fontSize = theme.axisFontSize * ratio
    const family = theme.fontFamily === 'inherit' ? 'system-ui, sans-serif' : theme.fontFamily
    context.font = `600 ${fontSize}px ${family}`
    const label = this.msg.t('midLabel', this.#formatPrice(book.mid))
    const padX = 7 * ratio
    const labelWidth = context.measureText(label).width + padX * 2
    const labelHeight = fontSize + 8 * ratio
    const left = Math.min(Math.max(self.bbox.left, x - labelWidth / 2), self.bbox.left + self.bbox.width - labelWidth)
    context.fillStyle = this.themeController.resolveColor('var(--c2-chart__mid-label--background-color, #18181b)', theme.tooltipBackground)
    context.beginPath()
    context.roundRect(left, top + 2 * ratio, labelWidth, labelHeight, labelHeight / 2)
    context.fill()
    context.fillStyle = this.themeController.resolveColor('var(--c2-chart__mid-label--color, #fafafa)', theme.tooltipColor)
    context.textBaseline = 'middle'
    context.fillText(label, left + padX, top + 2 * ratio + labelHeight / 2)
    context.restore()
  }

  // -------------------------------------------------------------- formats ---

  #format(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
    let format = this.#formats.get(key)
    if (!format) {
      format = new Intl.NumberFormat(this.locale, options)
      this.#formats.set(key, format)
    }
    return format
  }

  #priceDecimals(): number {
    return Math.max(0, Math.min(8, this.pricePrecision ?? this.#book.priceDecimals))
  }

  #formatPrice(value: number): string {
    const digits = this.#priceDecimals()
    return this.#format(`price:${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
  }

  #formatSize(value: number): string {
    const digits = Math.max(0, Math.min(8, this.sizePrecision ?? this.#book.sizeDecimals))
    const text = this.#format(`size:${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
    return this.baseLabel ? `${text} ${this.baseLabel}` : text
  }

  #formatNotional(value: number): string {
    const text = this.#format('notional', { notation: Math.abs(value) >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: 2 }).format(value)
    return this.quoteLabel ? `${text} ${this.quoteLabel}` : text
  }

  #formatImpact(value: number): string {
    return this.#format('impact', { style: 'percent', minimumFractionDigits: 3, maximumFractionDigits: 3, signDisplay: 'exceptZero' }).format(value)
  }

  /** Axis ticks: prices on x; y in the summed unit, compact once it runs to six figures. */
  protected override formatAxisX(value: number): string {
    return this.#format(`tick:${this.#priceDecimals()}`, { maximumFractionDigits: this.#priceDecimals() }).format(value)
  }

  protected override formatValue(value: number): string {
    return this.#format('value', { notation: Math.abs(value) >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: 2 }).format(value)
  }

  protected override formatX(value: number): string {
    return this.#formatPrice(value)
  }

  // ---------------------------------------------------------- interaction ---

  #readoutAt(point: DepthPoint | undefined): DepthReadout | undefined {
    if (!point?.level || point.side === 'mid') return undefined
    return depthReadout(this.#book, point.side, point.price, point.level)
  }

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): DepthTooltipContext {
    const base = super.tooltipContextAt(detail)
    const point = this.#series.points[detail.index]
    const readout = this.#readoutAt(point)
    const mirror = readout && this.mirror ? mirrorReadout(this.#book, readout.side, readout.price) : undefined
    // One entry, for the side the point is on: the shared tooltip and a linked one list it under the price.
    const entries = base.entries.filter((entry) => entry.value !== null && (point?.side === 'mid' || entry.seriesIndex === (point?.side === 'bid' ? 0 : 1)))
    return { ...base, entries: point?.side === 'mid' ? [] : entries, formattedX: this.#formatPrice(base.x), readout, mirror }
  }

  protected override defaultTooltip(context: ChartTooltipContext): TemplateResult {
    const { readout, mirror } = context as DepthTooltipContext
    const row = (label: string, value: string, color?: string) => html`
      <div class="tooltip-row">
        ${color ? html`<span class="tooltip-marker" style="background:${color}"></span>` : nothing}
        <span class="tooltip-label">${label}</span>
        <span class="tooltip-value">${value}</span>
      </div>
    `
    const book = this.#book
    if (!readout) {
      return html`
        <div class="tooltip-title">${this.msg.t('mid')} ${this.#formatPrice(book.mid)}</div>
        ${book.bestBid !== undefined ? row(this.msg.t('bestBid'), this.#formatPrice(book.bestBid), this.#sideColor('bid')) : nothing}
        ${book.bestAsk !== undefined ? row(this.msg.t('bestAsk'), this.#formatPrice(book.bestAsk), this.#sideColor('ask')) : nothing}
        ${book.bestBid !== undefined && book.bestAsk !== undefined ? row(this.msg.t('spread'), this.#formatPrice(book.bestAsk - book.bestBid)) : nothing}
      `
    }
    return html`
      <div class="tooltip-title">${this.msg.t(readout.side)} · ${this.#formatPrice(readout.price)}</div>
      ${row(this.msg.t('total'), this.#formatSize(readout.cumulative), this.#sideColor(readout.side))}
      ${row(this.msg.t('notional'), this.#formatNotional(readout.notional))} ${row(this.msg.t('averagePrice'), this.#formatPrice(readout.averagePrice))}
      ${row(this.msg.t('impact'), this.#formatImpact(readout.impact))}
      ${mirror ? row(this.msg.t(mirror.side === 'bid' ? 'mirrorBids' : 'mirrorAsks'), this.#formatSize(mirror.cumulative), this.#sideColor(mirror.side)) : nothing}
    `
  }

  protected override handleEngineHover(detail: EngineHoverDetail | null): void {
    super.handleEngineHover(detail)
    if (detail && this.#focused >= 0 && detail.index !== this.#focused) this.#placeMarker('focus', undefined)
    const point = detail ? this.#series.points[detail.index] : undefined
    const readout = this.#readoutAt(point)
    const mirror = readout && this.mirror ? mirrorReadout(this.#book, readout.side, readout.price) : undefined
    this.#placeMarker('mirror', mirror)
  }

  protected override handleEngineClick(detail: { index: number; seriesIndex: number }): void {
    super.handleEngineClick(detail)
    this.#select(detail.index)
  }

  /**
   * The x window is the chart's own (`range` around the mid price): uPlot rescales it with every new book, which is not
   * a zoom. `range-change` fires from {@link #zoom} instead.
   */
  protected override handleEngineRangeChange(): void {}

  #select(index: number): void {
    const readout = this.#readoutAt(this.#series.points[index])
    if (readout) this.dispatchEvent(new CustomEvent<DepthReadout>('price-select', { detail: readout }))
  }

  /** Places a marker at a readout's price and cumulative value, or hides it. Written straight to the node: no update. */
  #placeMarker(kind: 'mirror' | 'focus', readout: DepthReadout | undefined): void {
    const marker = this.renderRoot?.querySelector<HTMLElement>(`.depth-marker--${kind}`)
    if (!marker) return
    const position = readout ? this.#position(readout.price, this.unit === 'quote' ? readout.notional : readout.cumulative) : undefined
    if (!readout || !position) {
      marker.hidden = true
      return
    }
    marker.hidden = false
    marker.style.left = `${position.x}px`
    marker.style.top = `${position.y}px`
    marker.style.setProperty('--_side', this.#sideColor(readout.side))
  }

  /** Where a price and value land over the plot, in the overlay's pixels, or `undefined` outside the window. */
  #position(price: number, value: number): { x: number; y: number } | undefined {
    const geometry = this.adapter?.xGeometry?.([price])
    const offset = geometry?.offsets[0]
    if (!geometry || offset === null || offset === undefined || offset < -0.5 || offset > geometry.plot.width + 0.5) return undefined
    const { plot } = geometry
    return { x: plot.left + offset, y: plot.top + plot.height * (1 - Math.min(1, value / this.#yMax)) }
  }

  /** Zooms in (`1`, a narrower window) or out (`-1`) to the next step; a range between two steps moves to the nearer one that way. */
  #zoom(direction: 1 | -1): void {
    const epsilon = 1e-12
    const next =
      direction > 0 ? [...RANGE_STEPS].reverse().find((step) => step < this.range - epsilon) : RANGE_STEPS.find((step) => step > this.range + epsilon)
    if (next === undefined) return
    this.range = next
    const window = depthWindow(this.#book, next)
    this.dispatchEvent(new CustomEvent<ChartRangeEventDetail>('range-change', { detail: { min: window.min, max: window.max } }))
  }

  #handleKeydown = (event: KeyboardEvent): void => {
    const points = this.#series.points
    if (points.length === 0) return
    const midIndex = points.findIndex((point) => point.side === 'mid')
    let next: number | undefined
    switch (event.key) {
      case 'ArrowLeft':
        next = this.#focused < 0 ? Math.max(0, midIndex - 1) : Math.max(0, this.#focused - 1)
        break
      case 'ArrowRight':
        next = this.#focused < 0 ? Math.min(points.length - 1, midIndex + 1) : Math.min(points.length - 1, this.#focused + 1)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = points.length - 1
        break
      case '+':
      case '=':
        event.preventDefault()
        this.#zoom(1)
        return
      case '-':
      case '_':
        event.preventDefault()
        this.#zoom(-1)
        return
      case 'Enter':
      case ' ':
        if (this.#focused < 0) return
        event.preventDefault()
        this.#select(this.#focused)
        return
      case 'Escape':
        if (this.#focused < 0) return
        event.preventDefault()
        this.#focus(-1)
        return
      default:
        return
    }
    event.preventDefault()
    this.#focus(next)
  }

  #handleWheel = (event: WheelEvent): void => {
    // A bare wheel scrolls the page; ctrl or ⌘ (and a trackpad pinch, which arrives as ctrl + wheel) zooms.
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    if (event.deltaY !== 0) this.#zoom(event.deltaY < 0 ? 1 : -1)
  }

  #handleBlur = (): void => this.#focus(-1)

  /** Moves the keyboard focus to a point: the tooltip and markers follow it, and the readout is announced. */
  #focus(index: number): void {
    this.#focused = index
    const point = this.#series.points[index]
    if (!point) {
      this.handleEngineHover(null)
      this.#placeMarker('focus', undefined)
      this.#announce('')
      return
    }
    const readout = this.#readoutAt(point)
    const value = readout ? (this.unit === 'quote' ? readout.notional : readout.cumulative) : 0
    const position = this.#position(point.price, value) ?? { x: 0, y: 0 }
    this.handleEngineHover({ index, seriesIndex: point.side === 'ask' ? 1 : 0, px: position.x, py: position.y })
    this.#placeMarker('focus', readout)
    if (readout) {
      this.#announce(
        this.msg.t(
          'levelAnnouncement',
          this.msg.t(readout.side),
          this.#formatPrice(readout.price),
          this.#formatSize(readout.cumulative),
          this.#formatImpact(readout.impact),
        ),
      )
    } else {
      this.#announce(`${this.msg.t('mid')} ${this.#formatPrice(this.#book.mid)}`)
    }
  }

  #announce(text: string): void {
    clearTimeout(this.#announceTimer)
    // Settles before speaking, so holding an arrow key does not queue one announcement per level.
    this.#announceTimer = setTimeout(() => {
      const region = this.renderRoot?.querySelector<HTMLElement>('.depth-a11y')
      if (region) region.textContent = text
    }, 250)
  }

  // ------------------------------------------------------------ lifecycle ---

  protected override firstUpdated(): void {
    super.firstUpdated()
    const plot = this.plotElement
    if (!plot) return
    // The plot is the chart's one tab stop. It is inside the shadow root, so nothing is written on the host.
    plot.tabIndex = 0
    plot.setAttribute('role', 'group')
    plot.addEventListener('keydown', this.#handleKeydown)
    plot.addEventListener('wheel', this.#handleWheel, { passive: false })
    plot.addEventListener('blur', this.#handleBlur)
  }

  protected override willUpdate(changed: PropertyValues): void {
    // The formatters are cached by their digits; only the locale invalidates them.
    if (changed.has('locale')) this.#formats.clear()
    super.willUpdate(changed)
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    this.#describe()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    clearTimeout(this.#announceTimer)
  }

  /** The plot's accessible name: spread and depth either side. Also refreshed by a data-only update, which skips `updated`. */
  #describe(): void {
    const plot = this.plotElement
    if (!plot) return
    const book = this.#book
    const window = this.#window
    const bidDepth = depthAt(book, 'bid', window.min)
    const askDepth = depthAt(book, 'ask', window.max)
    const spread = book.bestBid !== undefined && book.bestAsk !== undefined ? this.#formatPrice(book.bestAsk - book.bestBid) : '—'
    const range = this.#format('range', { style: 'percent', maximumFractionDigits: 2 }).format(this.range)
    const label = this.msg.t('summary', spread, this.#formatSize(bidDepth?.cumulative ?? 0), this.#formatSize(askDepth?.cumulative ?? 0), range)
    if (plot.getAttribute('aria-label') !== label) plot.setAttribute('aria-label', label)
    const roleDescription = this.msg.t('roleDescription')
    if (plot.getAttribute('aria-roledescription') !== roleDescription) plot.setAttribute('aria-roledescription', roleDescription)
  }

  protected override shouldUpdate(changed: PropertyValues): boolean {
    const update = super.shouldUpdate(changed)
    // The fast path returned false and skipped `updated`: the new book still needs its name, and a held marker moves.
    if (!update) {
      this.#describe()
      if (this.#focused >= this.#series.points.length) this.#focused = -1
      if (this.#focused >= 0) this.#focus(this.#focused)
    }
    return update
  }

  protected override renderOverlayExtras(): unknown {
    return html`
      <div class="depth-marker depth-marker--mirror" part="mirror-marker" hidden></div>
      <div class="depth-marker depth-marker--focus" part="focus-marker" hidden></div>
    `
  }

  protected override render(): TemplateResult {
    // The live region has no bindings, so a server render and the first client render agree; it is filled imperatively.
    return html`${super.render()}
      <div class="depth-a11y" aria-live="polite"></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-depth-chart': DepthChart
  }
}
