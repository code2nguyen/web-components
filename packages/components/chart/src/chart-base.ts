import { LitElement, html, isServer, nothing, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './chart.scss?inline'
import { ChartFrameBuilder, columnValue, type NormalizeContext } from './chart-data.js'
import { ChartThemeController, PROBE_COLORS, type ChartTheme } from './chart-theme.js'
import type { ChartAdapter, ChartBuildContext } from './chart-adapter.js'
import { SERIES_CHANGE_EVENT, SERIES_TAG, type ChartSeries } from './chart-series.js'
import type {
  ChartDataSource,
  ChartFrame,
  ChartInput,
  ChartPointEventDetail,
  ChartRangeEventDetail,
  ChartSeriesConfig,
  ChartSeriesToggleEventDetail,
  ChartTooltipContext,
  ChartTooltipEntry,
} from './chart-types.js'

/** Properties that only ever move data. A change limited to these takes the fast path. */
const DATA_KEYS: ReadonlySet<string> = new Set(['data', 'revision'])

/**
 * Reactive properties that change only this component's own DOM and never the engine's options.
 *
 * The hover state is the important one. Without it, moving the pointer counts as a presentation change and
 * rebuilds the engine options — and under uPlot `setOptions` destroys and reconstructs the instance, which
 * resets the cursor mid-hover, makes the tooltip impossible to show, and throws away the chart on every
 * mouse move. The legend and the state messages are likewise ours to draw, not the engine's.
 */
const VIEW_ONLY_KEYS: ReadonlySet<string> = new Set([
  'hoverContext',
  // Applied through `adapter.setSeriesVisibility`, which does not rebuild anything.
  'hiddenSeries',
  'engineFailed',
  'loading',
  'error',
  'emptyMessage',
  'tooltip',
  // Changing the legend's position resizes the plot box; the ResizeObserver tells the engine.
  'legend',
  'maxPoints',
  'lazyRender',
  'renderTooltip',
  'renderLegendItem',
  'hasLinkedLegend',
  'hasLinkedTooltip',
  'dataSource',
])

/** One row of the legend. `series` and `index` are what a custom `renderLegendItem` is handed. */
export interface ChartLegendItem {
  label: string
  color: string
  visible: boolean
  toggle: () => void
  series: ChartSeriesConfig
  index: number
}

/** Detail emitted whenever the component-owned legend model changes. */
export interface ChartLegendChangeEventDetail {
  items: ChartLegendItem[]
}

/** `stats.cpu` -> `Cpu`, `unit_price` -> `Unit price`: a readable label for an inferred field. */
function humanize(field: string): string {
  const last = field.split('.').pop() ?? field
  const spaced = last.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** Pixels a resize must exceed before the engine is told; a canvas resize is a full redraw. */
const RESIZE_EPSILON = 1

/** Events fired by every chart, keyed for `addEventListener`. */
export interface ChartEventMap {
  'chart-ready': CustomEvent<{ engine: 'uplot' | 'echarts' }>
  'chart-error': CustomEvent<{ error: unknown }>
  'point-click': CustomEvent<ChartPointEventDetail>
  'point-hover': CustomEvent<ChartPointEventDetail | null>
  'tooltip-change': CustomEvent<ChartTooltipContext | null>
  'legend-change': CustomEvent<ChartLegendChangeEventDetail>
  'range-change': CustomEvent<ChartRangeEventDetail>
  'series-toggle': CustomEvent<ChartSeriesToggleEventDetail>
}

export interface ChartBase {
  addEventListener: TypedAddEventListener<ChartBase, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<ChartBase, ChartEventMap>
}

/**
 * Shared behaviour of every `c2-*-chart`: the chrome and its slots, the resize observer, theme
 * resolution, data normalisation, and the routing that keeps a realtime update off the expensive path.
 * It defines no tag and is never registered — the concrete charts extend it.
 *
 * **Why the data and presentation inputs are separate.** `data` and `revision` are the only properties on
 * the data path; everything else is presentation. A change limited to the data path is pushed straight
 * into the engine from `shouldUpdate`, which returns `false`, so Lit never renders or commits and the
 * canvas container is not touched. Anything else rebuilds the engine options, which is allowed to be
 * expensive. That is what makes a streaming tick cost one engine redraw and nothing more.
 *
 * **Sizing.** A canvas has no intrinsic size, so the host is sized by `--c2-chart--height` (320px by
 * default) rather than by its content. Give the host a height — through the variable, a CSS rule, or a
 * flex parent — or the plot area collapses.
 *
 * @slot default - The series definitions: `c2-chart-series` elements. They render nothing themselves.
 * @slot legend - Replaces the built-in legend. The built-in one is still what `legend` positions.
 * @slot tooltip - Replaces the built-in tooltip body. The hovered point is available through the `renderTooltip` property when a function is easier than markup.
 * @slot actions - Controls pinned to the top-right of the plot area, for a range picker or an export button.
 * @slot empty - Replaces the built-in "no data" message.
 * @slot loading - Replaces the built-in message shown while `loading` is set.
 * @slot error - Replaces the built-in message shown when `error` is set.
 *
 * @slotcomponent c2-chart-series
 *
 * @event {CustomEvent<{ engine: string }>} chart-ready - Fired after the engine has loaded and drawn for the first time. The host also gains `data-chart-ready`, which is what a test should wait on.
 * @event {CustomEvent<{ error: unknown }>} chart-error - Fired when the engine fails to load or to draw. `detail.error` is the underlying failure.
 * @event {CustomEvent<ChartPointEventDetail>} point-click - Fired when a datum is clicked. Does not bubble: several components fire point events, so a listener belongs on the element itself.
 * @event {CustomEvent<ChartPointEventDetail | null>} point-hover - Fired as the pointer moves between data points, and with a `null` detail when it leaves the plot. Does not bubble.
 * @event {CustomEvent<ChartTooltipContext | null>} tooltip-change - Fired with the complete tooltip model as the pointer moves, and with `null` when it leaves. Used by `c2-chart-tooltip`.
 * @event {CustomEvent<ChartLegendChangeEventDetail>} legend-change - Fired when legend entries or visibility change. Used by `c2-chart-legend`.
 * @event {CustomEvent<ChartRangeEventDetail>} range-change - Fired after the user zooms or brushes. `detail.min` and `detail.max` are the new x bounds. Does not bubble.
 * @event {CustomEvent<ChartSeriesToggleEventDetail>} series-toggle - Fired when a legend entry is toggled. Does not bubble.
 *
 * @csspart frame - The outer flex column holding the legend and the plot area.
 * @csspart plot-area - The positioned box the engine draws into.
 * @csspart plot - The engine's container element. Carries no Lit bindings, so the canvas survives every update.
 * @csspart overlay - The non-interactive layer above the canvas that holds the tooltip and the actions.
 * @csspart tooltip - The tooltip bubble.
 * @csspart actions - The container for the `actions` slot.
 * @csspart state - The empty, loading or error message layer.
 * @csspart legend - The legend container.
 * @csspart legend-item - One legend entry, a toggle button.
 * @csspart legend-marker - The colour swatch inside a legend entry.
 *
 * @cssproperty {length} [--c2-chart--width=100%] - Width of the host. The plot is absolutely positioned and has no intrinsic width, so a chart used as a flex item would otherwise collapse to its legend.
 * @cssproperty {pixel} [--c2-chart--height=320px] - Height of the host. A canvas has no intrinsic size, so this is what gives the chart a box.
 * @cssproperty {color} [--c2-chart--background=#ffffff] - Background of the chart surface.
 * @cssproperty {color} [--c2-chart--color=#18181b] - Primary text colour.
 * @cssproperty {font-family} [--c2-chart--font-family=inherit] - Font family used for the chart chrome and the labels the engine draws.
 * @cssproperty {font-size} [--c2-chart--font-size=12px] - Base font size.
 * @cssproperty {padding} [--c2-chart--padding=12px] - Padding around the whole chart.
 *
 * @cssproperty {border} [--c2-chart--border-top=1px solid #e4e4e7] - Top border.
 * @cssproperty {border} [--c2-chart--border-right=1px solid #e4e4e7] - Right border.
 * @cssproperty {border} [--c2-chart--border-bottom=1px solid #e4e4e7] - Bottom border.
 * @cssproperty {border} [--c2-chart--border-left=1px solid #e4e4e7] - Left border.
 * @cssproperty {border-radius} [--c2-chart--border-top-left-radius=8px] - Top-left corner radius.
 * @cssproperty {border-radius} [--c2-chart--border-top-right-radius=8px] - Top-right corner radius.
 * @cssproperty {border-radius} [--c2-chart--border-bottom-left-radius=8px] - Bottom-left corner radius.
 * @cssproperty {border-radius} [--c2-chart--border-bottom-right-radius=8px] - Bottom-right corner radius.
 *
 * @cssproperty {color} [--c2-chart__series-1--color=#0265dc] - Colour of the first series.
 * @cssproperty {color} [--c2-chart__series-2--color=#ea580c] - Colour of the second series.
 * @cssproperty {color} [--c2-chart__series-3--color=#0f766e] - Colour of the third series.
 * @cssproperty {color} [--c2-chart__series-4--color=#db2777] - Colour of the fourth series.
 * @cssproperty {color} [--c2-chart__series-5--color=#a16207] - Colour of the fifth series.
 * @cssproperty {color} [--c2-chart__series-6--color=#7c3aed] - Colour of the sixth series.
 * @cssproperty {color} [--c2-chart__series-7--color=#0891b2] - Colour of the seventh series.
 * @cssproperty {color} [--c2-chart__series-8--color=#52525b] - Colour of the eighth series. Series beyond the eighth reuse the palette from the start.
 *
 * @cssproperty {pixel} [--c2-chart__line--width=2px] - Stroke width of a line series.
 * @cssproperty {pixel} [--c2-chart__point--radius=2.5px] - Radius of a data point marker.
 * @cssproperty {opacity} [--c2-chart__area--opacity=0.15] - Opacity of the fill under an area series.
 * @cssproperty {number} [--c2-chart__bar--border-radius=0] - Roundedness of a bar's value end, from 0 (square) to 0.5 (fully rounded).
 *
 * @cssproperty {color} [--c2-chart__axis--color=#71717a] - Colour of the axis lines and tick labels.
 * @cssproperty {font-size} [--c2-chart__axis--font-size=12px] - Font size of the tick labels.
 * @cssproperty {color} [--c2-chart__grid--color=#e4e4e7] - Colour of the grid lines.
 * @cssproperty {pixel} [--c2-chart__grid--width=1px] - Width of the grid lines.
 * @cssproperty {color} [--c2-chart__crosshair--color=#a1a1aa] - Colour of the cursor crosshair.
 * @cssproperty {pixel} [--c2-chart__crosshair--width=1px] - Width of the cursor crosshair.
 *
 * @cssproperty {color} [--c2-chart__surface--color=#ffffff] - Surface colour handed to the engine, for marker borders and label backdrops.
 * @cssproperty {color} [--c2-chart__muted--color=#71717a] - Secondary text colour.
 * @cssproperty {color} [--c2-chart__positive--color=#16a34a] - Colour for a rising value, used by the candlestick and gauge charts.
 * @cssproperty {color} [--c2-chart__negative--color=#dc2626] - Colour for a falling value, used by the candlestick and gauge charts.
 *
 * @cssproperty {pixel} [--c2-chart__legend--gap=12px] - Gap between legend entries.
 * @cssproperty {padding} [--c2-chart__legend--padding=8px 0 0] - Padding around the legend.
 * @cssproperty {color} [--c2-chart__legend--color=#71717a] - Legend text colour.
 * @cssproperty {font-size} [--c2-chart__legend--font-size=12px] - Legend font size.
 * @cssproperty {opacity} [--c2-chart__legend__disabled--opacity=0.38] - Opacity of a legend entry whose series is hidden.
 * @cssproperty {pixel} [--c2-chart__legend-marker--size=10px] - Size of the legend colour swatch.
 * @cssproperty {border-radius} [--c2-chart__legend-marker--border-radius=999px] - Corner radius of the legend colour swatch.
 *
 * @cssproperty {color} [--c2-chart__tooltip--background-color=#18181b] - Tooltip background.
 * @cssproperty {color} [--c2-chart__tooltip--color=#fafafa] - Tooltip text colour.
 * @cssproperty {font-size} [--c2-chart__tooltip--font-size=12px] - Tooltip font size.
 * @cssproperty {padding} [--c2-chart__tooltip--padding=8px 10px] - Tooltip padding.
 * @cssproperty {border-radius} [--c2-chart__tooltip--border-radius=6px] - Tooltip corner radius.
 * @cssproperty {box-shadow} [--c2-chart__tooltip--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)] - Tooltip shadow.
 * @cssproperty {pixel} [--c2-chart__tooltip--gap=6px] - Gap between tooltip rows.
 *
 * @cssproperty {color} [--c2-chart__state--color=#71717a] - Colour of the empty, loading and error text.
 * @cssproperty {font-size} [--c2-chart__state--font-size=14px] - Font size of the empty, loading and error text.
 */
export abstract class ChartBase extends LitElement {
  static override styles: CSSResultGroup = unsafeCSS(styles)

  @query('.plot') protected plotElement!: HTMLElement | null
  @query('.tooltip') private tooltipElement!: HTMLElement | null

  // ---------------------------------------------------------------- data ---

  /**
   * The data to plot. Row objects, a bare `number[]`, columnar `[xs, ys…]`, or an already-normalised
   * frame. Compared by identity: replace the array, or bump `revision` after mutating it in place.
   */
  @property({ converter: jsonPropertyConverter }) data?: ChartInput

  /** Bump after mutating `data` in place. The cheap escape hatch for a large buffer you own. */
  @property({ type: Number }) revision = 0

  /** Lazy or streaming source used instead of `data`. Property only. */
  @property({ attribute: false }) dataSource?: ChartDataSource

  // -------------------------------------------------------- presentation ---

  /** Series definitions, as an alternative to `c2-chart-series` children. Children win when both are set. */
  @property({ converter: jsonPropertyConverter }) series?: ChartSeriesConfig[]

  /** Row field holding the x value; may be a dotted path. Defaults to the row index. */
  @property({ type: String, attribute: 'x-field' }) xField = ''

  /** Row field holding the category label, for charts that name their slices. */
  @property({ type: String, attribute: 'label-field' }) labelField = ''

  /** How x values are interpreted, which decides the axis and the tooltip format. */
  @property({ type: String, attribute: 'x-type' }) xType: 'time' | 'linear' | 'category' = 'linear'

  /**
   * Where the legend sits, or `none` to hide it. Shown by default: a chart with more than one series is
   * unreadable without one, and a single-series chart simply renders a one-entry legend.
   */
  @property({ type: String }) legend: 'none' | 'top' | 'bottom' | 'start' | 'end' = 'bottom'

  /** Whether the tooltip follows the whole x position or only the hovered datum. */
  @property({ type: String }) tooltip: 'none' | 'item' | 'axis' = 'axis'

  /**
   * Whether the chart animates its initial draw. ECharts uses its native shape animation and uPlot uses a
   * lightweight plot reveal; subsequent data updates stay immediate so a live source does not animate
   * every tick. Named `animation` rather than `animate` because `HTMLElement.animate()` is a method every
   * element already has, and shadowing it breaks the Web Animations API on the host.
   */
  @property({ type: String, reflect: true }) animation: 'none' | 'auto' = 'auto'

  /** BCP 47 locale for the axis and tooltip formatting. Defaults to the browser locale. */
  @property({ type: String }) locale?: string

  /** Shows the loading state instead of the plot. */
  @property({ type: Boolean, reflect: true }) loading = false

  /** Shows an error message instead of the plot. */
  @property({ type: String }) error = ''

  /** Replaces the built-in "no data" text. */
  @property({ type: String, attribute: 'empty-message' }) emptyMessage = 'No data'

  /** Caps how many points a streaming chart keeps; older points fall off the front. `0` keeps everything. */
  @property({ type: Number, attribute: 'max-points' }) maxPoints = 0

  /** Defers loading the engine until the host first scrolls into view. */
  @property({ type: Boolean, attribute: 'lazy-render' }) lazyRender = false

  /** Renders the tooltip body from a function instead of the `tooltip` slot. Property only. */
  @property({ attribute: false }) renderTooltip?: (context: ChartTooltipContext) => unknown

  /** Renders one legend entry from a function instead of the `legend` slot. Property only. */
  @property({ attribute: false }) renderLegendItem?: (series: ChartSeriesConfig, index: number) => unknown

  // --------------------------------------------------------------- state ---

  @state() protected seriesElements: ChartSeries[] = []
  @state() protected hiddenSeries = new Set<number>()
  @state() protected hoverContext: ChartTooltipContext | null = null
  @state() private engineFailed = false
  @state() private hasLinkedLegend = false
  @state() private hasLinkedTooltip = false

  protected themeController = new ChartThemeController(this, () => this.handleThemeChange())
  protected frameBuilder = new ChartFrameBuilder()
  protected frame?: ChartFrame

  protected adapter?: ChartAdapter
  /** Guards against two `createChart` runs racing while the engine chunk is in flight. */
  #creating = false
  #optionsDirty = false
  #optionsMode: 'merge' | 'replace' = 'merge'
  #dataDirty = false
  #appended = 0
  #measured = { width: 0, height: 0 }
  #resizeObserver?: ResizeObserver
  #intersectionObserver?: IntersectionObserver
  #visible = false
  #unsubscribe?: () => void
  #tooltipContext: ChartTooltipContext | null = null
  #legendPresenters = new Set<HTMLElement>()
  #tooltipPresenters = new Set<HTMLElement>()

  // ------------------------------------------------ the engine layer's job ---

  /** Which engine this chart draws with. */
  protected abstract readonly engineName: 'uplot' | 'echarts'

  /** Loads the engine and returns a fresh adapter. */
  protected abstract createAdapter(): Promise<ChartAdapter>

  /** Builds the engine options from the theme and the resolved series. Never sees raw data. */
  protected abstract buildOptions(context: ChartBuildContext): unknown

  /** Projects the normalised frame into the shape this engine consumes. */
  protected abstract projectData(frame: ChartFrame, context: ChartBuildContext): unknown

  /** Restores interaction state after an engine instance is created or replaced. */
  protected restoreVisibility(adapter: ChartAdapter): void {
    for (const index of this.hiddenSeries) adapter.setSeriesVisibility(index, false)
  }

  /** Whether changing chart data can change the legend model. Pie charts use row labels as entries. */
  protected get legendDependsOnData(): boolean {
    return false
  }

  // ------------------------------------------------------------ lifecycle ---

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener(SERIES_CHANGE_EVENT, this.#handleSeriesChange)
    if (isServer) return

    if (typeof ResizeObserver !== 'undefined' && !this.#resizeObserver) {
      this.#resizeObserver = new ResizeObserver((entries) => this.#handleResize(entries))
    }
    // Lit does not re-render on reconnect, so observation is re-bound here rather than in `updated`.
    if (this.plotElement) this.#resizeObserver?.observe(this.plotElement)

    if (this.lazyRender && typeof IntersectionObserver !== 'undefined') {
      if (!this.#intersectionObserver) {
        this.#intersectionObserver = new IntersectionObserver((entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return
          this.#visible = true
          this.#intersectionObserver?.disconnect()
          this.requestUpdate()
        })
      }
      this.#intersectionObserver.observe(this)
    } else {
      this.#visible = true
    }
  }

  /**
   * Client-rendered charts connect before Lit creates their plot node. Observe it after the first render as
   * well, so a chart whose initial layout is zero-sized still draws when its container becomes measurable.
   */
  protected override firstUpdated(): void {
    if (this.plotElement) this.#resizeObserver?.observe(this.plotElement)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener(SERIES_CHANGE_EVENT, this.#handleSeriesChange)
    this.#resizeObserver?.disconnect()
    this.#intersectionObserver?.disconnect()
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
    // uPlot registers its own listeners and ECharts leaks without `dispose`, so the instance goes too.
    this.adapter?.destroy()
    this.adapter = undefined
    this.removeAttribute('data-chart-engine')
    this.removeAttribute('data-chart-ready')
  }

  /**
   * The fast path. A change confined to `data`/`revision` on a live chart is pushed into the engine here
   * and `false` is returned, so Lit skips render and commit entirely and the canvas is never touched.
   */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (!this.hasUpdated || !this.adapter) return true
    for (const key of changed.keys()) if (!DATA_KEYS.has(key as string)) return true
    this.frame = this.frameBuilder.build(this.data, this.normalizeContext())
    this.#flushData()
    return false
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('data') || changed.has('revision')) {
      this.frame = this.frameBuilder.build(this.data, this.normalizeContext())
      this.#dataDirty = true
    }
    if (changed.has('dataSource')) this.#bindDataSource()

    for (const key of changed.keys()) {
      const name = key as string
      if (!DATA_KEYS.has(name) && !VIEW_ONLY_KEYS.has(name)) {
        this.#optionsDirty = true
        break
      }
    }
    // A shrinking series set cannot be merged into ECharts: the removed series would stay on screen.
    if (changed.has('series') || changed.has('seriesElements')) this.#optionsMode = 'replace'
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    if (isServer) return
    void this.#sync()
    if (changed.has('tooltip') && this.tooltip === 'none') {
      this.#tooltipContext = null
      this.#setHover(null)
      this.dispatchEvent(new CustomEvent<ChartTooltipContext | null>('tooltip-change', { detail: null }))
    }
    if ([...changed.keys()].some((key) => key !== 'hoverContext')) this.notifyLegendChange()
  }

  // ----------------------------------------------------------- public API ---

  /**
   * Replaces the data without going through the update queue. Equivalent to assigning `data`, but skips
   * Lit's scheduling — worth it in a tight loop.
   */
  updateData(next: ChartInput): void {
    this.data = next
    this.frame = this.frameBuilder.build(next, this.normalizeContext())
    this.#flushData()
  }

  /**
   * Appends one point across every series at a shared x. The frame grows in place, so nothing is
   * re-normalised and no Lit update is scheduled: a 10 Hz feed costs one engine redraw per tick.
   */
  appendPoint(x: number, values: readonly (number | null)[]): void {
    if (!this.frame) {
      this.frame = this.frameBuilder.build([], this.normalizeContext())
      if (!this.frame) return
    }
    this.frameBuilder.push(this.frame, x, values, this.maxPoints)
    this.#appended += 1
    this.#flushData()
  }

  /** Shows or hides one series, as the legend does. */
  setSeriesVisible(index: number, visible: boolean): void {
    const next = new Set(this.hiddenSeries)
    if (visible) next.delete(index)
    else next.add(index)
    this.hiddenSeries = next
    this.adapter?.setSeriesVisibility(index, visible)
    this.notifyLegendChange()

    const series = this.resolvedSeries[index]
    if (!series) return
    this.dispatchEvent(
      new CustomEvent<ChartSeriesToggleEventDetail>('series-toggle', {
        detail: { seriesIndex: index, series, visible, hidden: [...next] },
      }),
    )
  }

  /** Current entries for a linked `c2-chart-legend`. */
  getLegendItems(): ChartLegendItem[] {
    return this.legendItems()
  }

  /** Current hover model for a linked `c2-chart-tooltip`. */
  getTooltipContext(): ChartTooltipContext | null {
    return this.#tooltipContext
  }

  /** Plot bounds used to place a linked floating tooltip in viewport coordinates. */
  getPlotBounds(): DOMRect {
    return (this.plotElement ?? this).getBoundingClientRect()
  }

  /** Registers an external legend and suppresses the built-in legend until it disconnects. */
  registerLegendPresenter(presenter: HTMLElement): void {
    this.#legendPresenters.add(presenter)
    this.hasLinkedLegend = this.#legendPresenters.size > 0
  }

  /** Removes an external legend registration. */
  unregisterLegendPresenter(presenter: HTMLElement): void {
    this.#legendPresenters.delete(presenter)
    this.hasLinkedLegend = this.#legendPresenters.size > 0
  }

  /** Registers an external tooltip and suppresses the built-in tooltip until it disconnects. */
  registerTooltipPresenter(presenter: HTMLElement): void {
    this.#tooltipPresenters.add(presenter)
    this.hasLinkedTooltip = this.#tooltipPresenters.size > 0
  }

  /** Removes an external tooltip registration. */
  unregisterTooltipPresenter(presenter: HTMLElement): void {
    this.#tooltipPresenters.delete(presenter)
    this.hasLinkedTooltip = this.#tooltipPresenters.size > 0
  }

  /** Notifies linked legends after a subclass changes a data-shaped legend such as pie slices. */
  protected notifyLegendChange(): void {
    this.dispatchEvent(new CustomEvent<ChartLegendChangeEventDetail>('legend-change', { detail: { items: this.getLegendItems() } }))
  }

  /** The series in draw order: `c2-chart-series` children when present, otherwise the `series` property. */
  get resolvedSeries(): ChartSeriesConfig[] {
    if (this.seriesElements.length > 0) {
      return this.seriesElements.filter((element) => !element.hidden).map((element) => element.toConfig())
    }
    if (this.series && this.series.length > 0) return this.series.filter((series) => !series.hidden)
    return this.inferredSeries()
  }

  /**
   * The series to draw when nothing was declared: every numeric field of the first row except the ones
   * already spoken for by `x-field` and `label-field`.
   *
   * This reads `data` rather than the normalised frame on purpose. Deriving it from the frame would be
   * circular — the frame is built *from* the series list — and naming the results positionally would be
   * worse than circular: the next normalisation would look up a field that does not exist in the rows and
   * quietly read every value as a gap.
   */
  protected inferredSeries(): ChartSeriesConfig[] {
    const rows = this.data
    if (!Array.isArray(rows) || rows.length === 0) return []

    const first: unknown = rows[0]
    // A bare `number[]` is one series plotted against its own index.
    if (typeof first === 'number') return [{ field: 'value', label: 'Value' }]
    // Columnar input carries no names; the first column is x, so the rest are the series in order.
    if (Array.isArray(first) || ArrayBuffer.isView(first)) {
      return (rows as unknown[]).slice(1).map((_column, index) => ({ field: `${index}`, label: `Series ${index + 1}` }))
    }

    const row = first as Record<string, unknown>
    return Object.keys(row)
      .filter((key) => typeof row[key] === 'number' && key !== this.xField && key !== this.labelField)
      .map((key) => ({ field: key, label: humanize(key) }))
  }

  /** The colour a series draws with: its own `color`, else its palette slot. */
  protected colorOf(series: ChartSeriesConfig, index: number, theme: ChartTheme = this.themeController.theme): string {
    return series.color ?? theme.palette[index % theme.palette.length]
  }

  // ------------------------------------------------------------ internals ---

  protected normalizeContext(): NormalizeContext {
    const series = this.resolvedSeries
    return {
      xField: this.xField,
      labelField: this.labelField,
      series,
      signature: `${this.xField}|${this.labelField}|${this.xType}|${series.map((item) => item.field).join(',')}`,
    }
  }

  protected buildContext(): ChartBuildContext {
    return {
      theme: this.themeController.theme,
      series: this.resolvedSeries,
      hidden: this.hiddenSeries,
      labels: this.frame?.labels,
      width: this.#measured.width || this.plotElement?.clientWidth || 0,
      height: this.#measured.height || this.plotElement?.clientHeight || 0,
    }
  }

  /** True once there is something to draw and somewhere to draw it. */
  #canRender(): boolean {
    if (!this.#visible || this.engineFailed || this.error || this.loading) return false
    if (!this.plotElement || !this.frame || this.frame.length === 0) return false
    const { width, height } = this.buildContext()
    return width > 0 && height > 0
  }

  async #sync(): Promise<void> {
    if (!this.#canRender()) return
    if (!this.adapter) {
      await this.#createChart()
      return
    }
    let restoreAfterData = false
    if (this.#optionsDirty) {
      this.#optionsDirty = false
      const mode = this.#optionsMode
      this.adapter.setOptions(this.buildOptions(this.buildContext()), mode)
      this.#optionsMode = 'merge'
      restoreAfterData = mode === 'replace'
      // uPlot rebuilds the instance inside `setOptions`, so the data has to go back in.
      this.#dataDirty = true
    }
    if (this.#dataDirty) this.#flushData()
    if (restoreAfterData) this.restoreVisibility(this.adapter)
  }

  async #createChart(): Promise<void> {
    if (this.#creating || !this.plotElement || !this.frame) return
    this.#creating = true
    try {
      const adapter = await this.createAdapter()
      // The element may have been removed, or torn down, while the engine chunk was in flight.
      if (!this.isConnected || !this.plotElement) {
        adapter.destroy()
        return
      }
      const context = this.buildContext()
      await adapter.create(this.plotElement, this.buildOptions(context), this.projectData(this.frame, context), {
        hover: (detail) => this.#handleHover(detail),
        click: (detail) => this.#handleClick(detail),
        rangeChange: (detail) => this.dispatchEvent(new CustomEvent<ChartRangeEventDetail>('range-change', { detail })),
      })
      this.adapter = adapter
      this.#optionsDirty = false
      this.#dataDirty = false
      this.restoreVisibility(adapter)
      this.setAttribute('data-chart-engine', this.engineName)
      this.setAttribute('data-chart-ready', 'true')
      this.dispatchEvent(new CustomEvent('chart-ready', { detail: { engine: this.engineName } }))
    } catch (error) {
      this.engineFailed = true
      this.dispatchEvent(new CustomEvent('chart-error', { detail: { error } }))
    } finally {
      this.#creating = false
    }
  }

  #flushData(): void {
    if (!this.adapter || !this.frame) return
    this.#dataDirty = false
    const projected = this.projectData(this.frame, this.buildContext())
    if (this.#appended > 0 && this.adapter.appendData) this.adapter.appendData(projected, this.#appended)
    else this.adapter.setData(projected)
    this.#appended = 0
    if (this.legendDependsOnData) this.notifyLegendChange()
  }

  #handleResize(entries: ResizeObserverEntry[]): void {
    const rect = entries[entries.length - 1]?.contentRect
    if (!rect) return
    if (Math.abs(rect.width - this.#measured.width) < RESIZE_EPSILON && Math.abs(rect.height - this.#measured.height) < RESIZE_EPSILON) return
    this.#measured = { width: rect.width, height: rect.height }
    // Straight to the engine, never `requestUpdate()`: that would be the observe/render/layout loop.
    if (this.adapter) this.adapter.resize(rect.width, rect.height)
    else void this.#sync()
  }

  private handleThemeChange(): void {
    this.#optionsDirty = true
    this.requestUpdate()
  }

  #handleSeriesChange = (event: Event): void => {
    // The children's change event is internal plumbing; it must not escape the chart.
    event.stopPropagation()
    this.#collectSeries()
  }

  #collectSeries(): void {
    const slot = this.renderRoot?.querySelector<HTMLSlotElement>('slot.definitions')
    if (!slot) return

    const found: ChartSeries[] = []
    for (const element of slot.assignedElements({ flatten: true })) {
      // Matched by tag rather than `instanceof`, and searched at any depth: in the docs site every element
      // of an example is its own Astro island, so a definition arrives wrapped in one or more hosts.
      if (element.localName === SERIES_TAG) found.push(element as ChartSeries)
      else found.push(...Array.from(element.querySelectorAll<ChartSeries>(SERIES_TAG)))
    }

    // An element that has not been upgraded yet has no `toConfig`. The definition is registered by this
    // module, so upgrading is synchronous and makes the collection independent of hydration order.
    if (!isServer && typeof customElements !== 'undefined') {
      for (const element of found) customElements.upgrade(element)
    }

    this.seriesElements = found
  }

  #bindDataSource(): void {
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
    const source = this.dataSource
    if (!source) return

    const controller = new AbortController()
    void source
      .getWindow({ maxPoints: this.maxPoints || 2000, signal: controller.signal })
      .then((result) => {
        this.updateData(result.data)
      })
      .catch((error: unknown) => {
        this.dispatchEvent(new CustomEvent('chart-error', { detail: { error } }))
      })

    if (source.subscribe) {
      const stop = source.subscribe((x, values) => this.appendPoint(x, values))
      this.#unsubscribe = () => {
        controller.abort()
        stop()
      }
    } else {
      this.#unsubscribe = () => controller.abort()
    }
  }

  #handleHover(detail: { index: number; seriesIndex: number; px: number; py: number } | null): void {
    if (!detail || !this.frame) {
      this.#tooltipContext = null
      this.#setHover(null)
      this.dispatchEvent(new CustomEvent<ChartTooltipContext | null>('tooltip-change', { detail: null }))
      this.dispatchEvent(new CustomEvent<ChartPointEventDetail | null>('point-hover', { detail: null }))
      return
    }
    const context = this.#tooltipContextAt(detail)
    const tooltipContext = this.tooltip === 'none' ? null : context
    this.#tooltipContext = tooltipContext
    this.#setHover(this.hasLinkedTooltip ? null : tooltipContext)
    this.dispatchEvent(new CustomEvent<ChartTooltipContext | null>('tooltip-change', { detail: tooltipContext }))
    const point = this.#pointAt(detail.index, detail.seriesIndex)
    if (point) this.dispatchEvent(new CustomEvent<ChartPointEventDetail>('point-hover', { detail: point }))
  }

  /**
   * Positions the tooltip imperatively. A pointer move must not schedule a Lit update, so the transform is
   * written straight to the node; only a change of hovered index re-renders, and only when the body is
   * actually dynamic.
   */
  #setHover(context: ChartTooltipContext | null): void {
    const previous = this.hoverContext
    if (context && this.tooltipElement) {
      this.tooltipElement.style.transform = `translate(${context.px}px, ${context.py}px)`
    }
    // Same datum, new position: the transform above is the whole update, so the template is left alone and
    // a 60 Hz pointer move costs no Lit work at all. Assigning the state property is what schedules a
    // render, so the early return has to skip the assignment too.
    if (
      previous &&
      context &&
      previous.index === context.index &&
      (this.tooltip !== 'item' || previous.entries[0]?.seriesIndex === context.entries[0]?.seriesIndex)
    )
      return
    this.hoverContext = context
  }

  #tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): ChartTooltipContext {
    const frame = this.frame as ChartFrame
    const theme = this.themeController.theme
    const series = this.resolvedSeries
    const x = columnValue(frame.x, detail.index) ?? detail.index
    const entries: ChartTooltipEntry[] = []

    series.forEach((item, index) => {
      if (this.hiddenSeries.has(index)) return
      if (this.tooltip === 'item' && index !== detail.seriesIndex) return
      const column = frame.columns[index]
      if (!column) return
      const value = columnValue(column, detail.index)
      entries.push({
        seriesIndex: index,
        series: item,
        value,
        formatted: value === null ? '—' : (item.format?.(value) ?? this.formatValue(value)),
        color: this.colorOf(item, index, theme),
      })
    })

    return {
      index: detail.index,
      x,
      formattedX: frame.labels?.[detail.index] ?? this.formatX(x),
      entries,
      px: detail.px,
      py: detail.py,
    }
  }

  #pointAt(index: number, seriesIndex: number): ChartPointEventDetail | undefined {
    const frame = this.frame
    const series = this.resolvedSeries[seriesIndex]
    if (!frame || !series) return undefined
    return {
      index,
      seriesIndex,
      series,
      x: columnValue(frame.x, index) ?? index,
      y: frame.columns[seriesIndex] ? columnValue(frame.columns[seriesIndex], index) : null,
      label: frame.labels?.[index],
    }
  }

  #handleClick(detail: { index: number; seriesIndex: number }): void {
    const point = this.#pointAt(detail.index, detail.seriesIndex)
    if (point) this.dispatchEvent(new CustomEvent<ChartPointEventDetail>('point-click', { detail: point }))
  }

  /** Formats an x value for the tooltip. Time charts get a date, everything else a number. */
  protected formatX(value: number): string {
    if (this.xType === 'time') {
      return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    }
    return this.formatValue(value)
  }

  /**
   * How much time the chart currently covers, in milliseconds, or `0` when that is not a meaningful question.
   * Axis labels are chosen from it: a day of five-minute samples and a year of daily ones want different ticks.
   */
  protected xSpan(): number {
    const frame = this.frame
    if (!frame || frame.length < 2) return 0
    const first = Number(frame.x[0])
    const last = Number(frame.x[frame.length - 1])
    return Number.isFinite(first) && Number.isFinite(last) ? Math.abs(last - first) : 0
  }

  /** Formats a y value for the tooltip and the built-in labels. */
  protected formatValue(value: number): string {
    return new Intl.NumberFormat(this.locale, { maximumFractionDigits: 2 }).format(value)
  }

  // --------------------------------------------------------------- render ---

  protected override render(): TemplateResult {
    const legendBefore = !this.hasLinkedLegend && (this.legend === 'top' || this.legend === 'start')
    const legendAfter = !this.hasLinkedLegend && (this.legend === 'bottom' || this.legend === 'end')
    // `start`/`end` are the inline edges: the legend sits beside the plot, not above or below it. Without
    // this the frame stays a column and they differ from `top`/`bottom` only in stacking their own entries.
    const side = this.legend === 'start' || this.legend === 'end'
    return html`
      <div class="frame ${side ? 'frame--side' : ''}" part="frame">
        ${legendBefore ? this.renderLegend() : nothing}
        <div class="plot-area" part="plot-area">
          <!-- No bindings inside: Lit never patches this node, so the engine's canvas survives updates. -->
          <div class="plot" part="plot"></div>
          <div class="overlay" part="overlay">
            <div class="tooltip" part="tooltip" role="tooltip" ?hidden=${!this.hoverContext || this.tooltip === 'none' || this.hasLinkedTooltip}>
              ${this.renderTooltipBody()}
            </div>
            <div class="actions" part="actions"><slot name="actions"></slot></div>
          </div>
          ${this.renderState()}
        </div>
        ${legendAfter ? this.renderLegend() : nothing}
      </div>
      <div class="theme-probe" aria-hidden="true">${PROBE_COLORS.map(() => html`<i></i>`)}</div>
      <slot class="definitions" @slotchange=${this.#collectSeries}></slot>
    `
  }

  /** Named slot, then the renderer property, then the built-in rows — the library's three-layer fallback. */
  private renderTooltipBody(): TemplateResult {
    const context = this.hoverContext
    return html`<slot name="tooltip">${context ? (this.renderTooltip?.(context) ?? this.defaultTooltip(context)) : nothing}</slot>`
  }

  private defaultTooltip(context: ChartTooltipContext): TemplateResult {
    return html`
      <div class="tooltip-title">${context.formattedX}</div>
      ${context.entries.map(
        (entry) => html`
          <div class="tooltip-row">
            <span class="tooltip-marker" style="background:${entry.color}"></span>
            <span class="tooltip-label">${entry.series.label ?? entry.series.field}</span>
            <span class="tooltip-value">${entry.formatted}</span>
          </div>
        `,
      )}
    `
  }

  private renderState(): TemplateResult | typeof nothing {
    if (this.error) return html`<div class="state" part="state"><slot name="error">${this.error}</slot></div>`
    if (this.loading) return html`<div class="state" part="state"><slot name="loading">Loading…</slot></div>`
    if (!this.frame || this.frame.length === 0) {
      return html`<div class="state" part="state"><slot name="empty">${this.emptyMessage}</slot></div>`
    }
    return nothing
  }

  /**
   * What the legend lists. One entry per series for every cartesian chart — but a chart whose data is one
   * dimensional overrides this: a pie has a single series and many slices, and listing "Revenue" above a
   * four-slice donut tells the reader nothing.
   */
  protected legendItems(): ChartLegendItem[] {
    return this.resolvedSeries.map((item, index) => ({
      label: item.label ?? item.field,
      color: this.colorOf(item, index),
      visible: !this.hiddenSeries.has(index),
      toggle: () => this.setSeriesVisible(index, this.hiddenSeries.has(index)),
      series: item,
      index,
    }))
  }

  private renderLegend(): TemplateResult {
    return html`
      <div class="legend legend--${this.legend}" part="legend">
        <slot name="legend">
          ${this.legendItems().map(
            (item) => html`
              <button class="legend-item" part="legend-item" type="button" aria-pressed=${item.visible ? 'true' : 'false'} @click=${item.toggle}>
                ${
                  this.renderLegendItem?.(item.series, item.index) ??
                  html`
                    <span class="legend-marker" part="legend-marker" style="background:${item.color}"></span>
                    <span class="legend-label">${item.label}</span>
                  `
                }
              </button>
            `,
          )}
        </slot>
      </div>
    `
  }
}
