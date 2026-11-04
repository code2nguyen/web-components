import { html, nothing, svg, unsafeCSS, type CSSResultGroup, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import { ChartBase, type ChartEventMap, type ChartLegendItem } from './chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import { columnValue, type NormalizeContext } from './chart-data.js'
import type { ChartFrame, ChartTooltipContext } from './chart-types.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import { readableOn } from './chart-contrast.js'
import radialStyles from './radial-bar-chart.scss?inline'
import './chart-series.js'

export interface RadialBarChart {
  addEventListener: TypedAddEventListener<RadialBarChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<RadialBarChart, ChartEventMap>
}

/** One ring as drawn: its share of the goal and the colour it is drawn in. */
interface Ring {
  label: string
  value: number | null
  goal: number
  share: number
  color: string
}

/** Rings past this many laps are drawn as two full laps; the tooltip keeps the true value. */
const MAX_LAPS = 2

/** A colour mixed toward black, for the overshoot lap. Canvas cannot read `color-mix()`, so it is done here. */
function darken(color: string, amount = 0.3): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim())
  let channels: number[] | undefined
  if (hex) channels = [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16))
  else if (rgb)
    channels = rgb[1]
      .split(/[\s,/]+/)
      .slice(0, 3)
      .map(Number)
  if (!channels || channels.some((channel) => !Number.isFinite(channel))) return color
  return `rgb(${channels.map((channel) => Math.round(channel * (1 - amount))).join(', ')})`
}

/**
 * Concentric rings, each filling toward its own goal: activity rings, a readiness score, a budget per category.
 * Drawn by ECharts as bars on a polar axis.
 *
 * Each row of `data` is one ring, outermost first: `label-field` names it, the `c2-chart-series` field is its value
 * and `max-field` its goal (or `max` for every ring). A ring starts at twelve o'clock (`start-angle` turns it) and
 * runs clockwise; `sweep="270"` leaves the bottom open, as a dial. A ring past its goal fills the track, then draws a
 * darker second lap for the overshoot, as activity rings do.
 *
 * Each ring takes the next palette colour, or its row's `color-field`. Its name is drawn at its start, in white or
 * black for contrast, and left out when the ring is too short to hold it (`labels="none"` leaves them all out). The
 * `center` slot sits in the hole, for a total or an icon. Ring width, the gap between rings and the track colour are
 * CSS variables. Clicking a ring highlights it and fades the others.
 *
 * ```html
 * <c2-radial-bar-chart label-field="ring" max-field="goal"
 *   data='[{ "ring": "Move", "value": 420, "goal": 600 }, { "ring": "Exercise", "value": 24, "goal": 30 }]'>
 *   <c2-chart-series field="value"></c2-chart-series>
 *   <strong slot="center">420 kcal</strong>
 * </c2-radial-bar-chart>
 * ```
 *
 * @tag c2-radial-bar-chart
 *
 * @slotcomponent c2-chart-series
 *
 * @slot center - Content in the hole: a total, an icon.
 *
 * @csspart center - The box around the `center` slot.
 *
 * @cssproperty {pixel} [--c2-chart__ring--width=16px] - The thickness of a ring. Rings narrow to fit a small chart.
 * @cssproperty {pixel} [--c2-chart__ring--gap=6px] - The space between two rings.
 * @cssproperty {color} [--c2-chart__track--color=#e4e4e7] - The full ring behind each value.
 * @cssproperty {opacity} [--c2-chart__series__dimmed--opacity=0.25] - Opacity the other rings keep while one is highlighted.
 */
@customElement('c2-radial-bar-chart')
export class RadialBarChart extends EchartsChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(radialStyles)]

  protected override readonly features: readonly EchartsFeature[] = ['bar', 'polar']

  /** The goal of every ring, when there is no `max-field`. */
  @property({ type: Number }) max = 100

  /** The row field holding each ring's goal. */
  @property({ type: String, attribute: 'max-field' }) maxField = ''

  /** The row field holding each ring's colour. */
  @property({ type: String, attribute: 'color-field' }) colorField = ''

  /** Where the rings start, in degrees clockwise from twelve o'clock. Ignored with a `sweep` under 360, which centres the gap at the bottom. */
  @property({ type: Number, attribute: 'start-angle' }) startAngle = 0

  /** How much of the circle a full ring covers, in degrees. */
  @property({ type: Number }) sweep = 360

  /** Whether each ring's name is drawn at its start. */
  @property({ type: String }) labels: 'start' | 'none' = 'start'

  /** Text appended to values in the tooltip, such as ` kcal`. */
  @property({ type: String, attribute: 'value-suffix' }) valueSuffix = ''

  /** Maximum number of decimal places in the tooltip values. */
  @property({ type: Number }) precision = 0

  /** Rings switched off from the legend, by label. */
  @state() private hiddenRings = new Set<string>()

  /** The plot's size, rounded: the rings are laid out in pixels, so a resize rebuilds them. */
  @state() private plotSize = 0

  #sizes?: ResizeObserver

  constructor() {
    super()
    this.tooltip = 'item'
    this.legend = 'none'
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (typeof ResizeObserver === 'undefined') return
    this.#sizes = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect
      if (!rect) return
      const size = Math.round(Math.min(rect.width, rect.height) / 4) * 4
      if (size !== this.plotSize) this.plotSize = size
    })
    if (this.plotElement) this.#sizes.observe(this.plotElement)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#sizes?.disconnect()
    this.#sizes = undefined
  }

  protected override firstUpdated(): void {
    super.firstUpdated()
    if (this.plotElement) this.#sizes?.observe(this.plotElement)
  }

  // ------------------------------------------------------------------ data ---

  protected override normalizeContext(): NormalizeContext {
    const base = super.normalizeContext()
    return { ...base, extraFields: this.maxField ? [this.maxField] : [], signature: `${base.signature}|${this.maxField}` }
  }

  /**
   * No data-only fast path: the rings' radii, names and labels and the text list for assistive technology all follow
   * the rows, so new data rebuilds the options and renders.
   */
  protected override isDataKey(): boolean {
    return false
  }

  protected override reshapesFrame(changed: PropertyValues): boolean {
    return super.reshapesFrame(changed) || changed.has('maxField')
  }

  protected override get legendDependsOnData(): boolean {
    return true
  }

  protected override coordinateSystem(): Record<string, unknown> {
    return {}
  }

  protected override dataShape(): 'named' {
    return 'named'
  }

  /** The colour each row names in `color-field`, by row. */
  private rowColors(): (string | undefined)[] {
    if (!this.colorField || !Array.isArray(this.data)) return []
    return (this.data as unknown[]).map((row) => {
      if (typeof row !== 'object' || row === null) return undefined
      const value = (row as Record<string, unknown>)[this.colorField]
      return typeof value === 'string' && value.trim() ? value.trim() : undefined
    })
  }

  private rings(frame: ChartFrame | undefined = this.frame, theme = this.themeController.theme): Ring[] {
    if (!frame) return []
    const column = frame.columns[0]
    const goals = this.maxField ? frame.extras?.[this.maxField] : undefined
    const colors = this.rowColors()
    const rings: Ring[] = []
    for (let row = 0; row < frame.length; row += 1) {
      const value = column ? columnValue(column, row) : null
      const goal = (goals ? columnValue(goals, row) : null) ?? this.max
      const share = value !== null && goal > 0 ? Math.max(0, value / goal) : 0
      rings.push({
        label: frame.labels?.[row] ?? String(row + 1),
        value,
        goal,
        share,
        color: colors[row] ?? theme.palette[row % theme.palette.length],
      })
    }
    return rings
  }

  // ---------------------------------------------------------------- layout ---

  /** Reads a pixel CSS variable off the host. */
  private pixels(name: string, fallback: number): number {
    const value = Number.parseFloat(getComputedStyle(this).getPropertyValue(name))
    return Number.isFinite(value) && value >= 0 ? value : fallback
  }

  /** The polar radii and ring width, in pixels, for `count` rings in a box of `width` × `height`. */
  private layout(count: number, width: number, height: number): { inner: number; outer: number; ring: number; band: number } {
    const outer = Math.max(4, Math.min(width, height) / 2 - 2)
    let ring = this.pixels('--_ring-width', 16)
    let gap = this.pixels('--_ring-gap', 6)
    // Keep at least a fifth of the radius for the hole: rings narrow rather than fill the centre.
    const room = outer * 0.8
    const needed = count * (ring + gap)
    if (needed > room && needed > 0) {
      ring *= room / needed
      gap *= room / needed
    }
    const band = ring + gap
    return { inner: Math.max(0, outer - count * band), outer, ring, band }
  }

  /** Where the arc starts, in ECharts degrees (counter-clockwise from three o'clock). */
  private get echartsStart(): number {
    const sweep = this.clampedSweep
    const clockwiseFromTop = sweep < 360 ? 180 + (360 - sweep) / 2 : this.startAngle || 0
    return 90 - clockwiseFromTop
  }

  private get clampedSweep(): number {
    return Number.isFinite(this.sweep) ? Math.max(30, Math.min(360, this.sweep)) : 360
  }

  // --------------------------------------------------------------- options ---

  /** Unused: `buildOptions` draws the value, the overshoot lap and the track as its own three series. */
  protected override seriesOption(): Record<string, unknown> {
    return {}
  }

  protected override buildOptions(context: ChartBuildContext): unknown {
    const base = super.buildOptions(context) as Record<string, unknown>
    const rings = this.rings(this.frame, context.theme)
    const { inner, outer, ring } = this.layout(rings.length, context.width, context.height)
    const sweep = this.clampedSweep
    const bar = {
      type: 'bar',
      coordinateSystem: 'polar',
      roundCap: true,
      clip: false,
      barWidth: ring,
      animationDuration: (base.animationDuration as number) ?? 0,
    }
    // ECharts lays bars that share a polar axis side by side, taking each one's width out of the band even when they
    // overlap, so the value, its overshoot lap and the track each get their own polar system, all the same size.
    const layers = [0, 1, 2]
    return {
      ...base,
      polar: layers.map(() => ({ radius: [inner, outer], center: ['50%', '50%'] })),
      // A full lap is `360 / sweep` units, so a value of 1 covers the sweep.
      angleAxis: layers.map((index) => ({
        polarIndex: index,
        type: 'value',
        min: 0,
        max: 360 / sweep,
        startAngle: this.echartsStart,
        clockwise: true,
        show: false,
      })),
      radiusAxis: layers.map((index) => ({ polarIndex: index, type: 'category', data: rings.map((item) => item.label), inverse: true, show: false })),
      series: [
        { ...bar, polarIndex: 0, name: this.resolvedSeries[0]?.label ?? this.resolvedSeries[0]?.field ?? 'value', z: 3 },
        { ...bar, polarIndex: 1, name: 'lap', z: 4 },
        { ...bar, polarIndex: 2, name: 'track', z: 2 },
      ],
    }
  }

  protected override projectData(frame: ChartFrame, context: ChartBuildContext): unknown {
    const theme = context.theme
    const rings = this.rings(frame, theme)
    const highlighted = this.highlighted
    const dimmed = (label: string) => highlighted !== null && rings.some((item) => item.label === highlighted) && label !== highlighted
    const track = getComputedStyle(this).getPropertyValue('--_track-color').trim() || theme.gridColor
    const over = (item: Ring) => Math.min(MAX_LAPS, item.share) - 1
    // The ring names are drawn by the element (`renderOverlayExtras`), not by ECharts, whose polar labels get cut short.
    const values = rings.map((item) => {
      if (this.hiddenRings.has(item.label) || item.value === null) return { name: item.label, value: '-' }
      return {
        name: item.label,
        value: Math.min(1, item.share),
        itemStyle: { color: item.color, opacity: dimmed(item.label) ? theme.dimmedOpacity : 1 },
      }
    })
    const laps = rings.map((item) => {
      const lap = over(item)
      if (this.hiddenRings.has(item.label) || item.value === null || lap <= 0) return { name: item.label, value: '-' }
      return { name: item.label, value: lap, itemStyle: { color: darken(item.color), opacity: dimmed(item.label) ? theme.dimmedOpacity : 1 } }
    })
    const tracks = rings.map((item) => ({
      name: item.label,
      value: this.hiddenRings.has(item.label) ? '-' : 1,
      itemStyle: { color: track, opacity: dimmed(item.label) ? theme.dimmedOpacity : 1 },
    }))
    return [values, laps, tracks]
  }

  /** A ring's lap and track are the ring: events report its one series. */
  protected override pointAt(index: number, _seriesIndex: number): ReturnType<ChartBase['pointAt']> {
    return super.pointAt(index, 0)
  }

  /** Every part of a ring (its value, lap or track) is that ring. */
  protected override highlightKeyAt(detail: { index: number; seriesIndex: number }): string | undefined {
    return this.frame?.labels?.[detail.index]
  }

  private format(value: number): string {
    const precision = Math.max(0, Math.min(20, Math.trunc(this.precision) || 0))
    return `${new Intl.NumberFormat(this.locale, { maximumFractionDigits: precision }).format(value)}${this.valueSuffix}`
  }

  /** The tooltip names the ring, its value against its goal and the share, whichever part is hovered. */
  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): ChartTooltipContext {
    const context = super.tooltipContextAt({ ...detail, seriesIndex: 0 })
    const ring = this.rings()[detail.index]
    if (!ring) return context
    const percent = new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: 0 }).format(ring.share)
    return {
      ...context,
      entries: context.entries.map((entry) => ({
        ...entry,
        color: ring.color,
        formatted: ring.value === null ? '—' : `${this.format(ring.value)} / ${this.format(ring.goal)} · ${percent}`,
      })),
    }
  }

  /** The legend lists the rings. */
  protected override legendItems(): ChartLegendItem[] {
    const rings = this.rings()
    if (!rings.length) return super.legendItems()
    const series = this.resolvedSeries[0] ?? { field: '' }
    return rings.map((ring, index) => ({
      label: ring.label,
      color: ring.color,
      visible: !this.hiddenRings.has(ring.label),
      ...this.legendEntryState(ring.label, !this.hiddenRings.has(ring.label), (visible) => this.setRingVisible(ring.label, visible)),
      series,
      index,
    }))
  }

  /** Shows or hides one ring, as the legend does. */
  setRingVisible(label: string, visible: boolean): void {
    const next = new Set(this.hiddenRings)
    if (visible) next.delete(label)
    else next.add(label)
    this.hiddenRings = next
    if (this.frame && this.adapter) this.adapter.setData(this.projectData(this.frame, this.buildContext()) as unknown[])
    this.notifyLegendChange()
  }

  /**
   * Each ring's name at its start, on the arc drawn on top there (the overshoot lap when there is one), in black or
   * white for contrast; left out when that arc is shorter than the text.
   */
  private renderRingLabels(rings: Ring[]): unknown {
    const plot = this.plotElement
    const width = plot?.clientWidth ?? 0
    const height = plot?.clientHeight ?? 0
    if (this.labels !== 'start' || !rings.length || !width || !height) return nothing
    const theme = this.themeController.theme
    const { inner, ring, band } = this.layout(rings.length, width, height)
    if (ring < 9) return nothing
    const sweep = this.clampedSweep
    const start = sweep < 360 ? 180 + (360 - sweep) / 2 : this.startAngle || 0
    const fontSize = Math.min(theme.fontSize, Math.max(8, ring * 0.62))
    const highlighted = this.highlighted !== null && rings.some((item) => item.label === this.highlighted) ? this.highlighted : null
    const labels = rings.flatMap((item, index) => {
      if (this.hiddenRings.has(item.label) || item.value === null) return []
      const lap = Math.min(MAX_LAPS, item.share) - 1
      const share = lap > 0 ? lap : Math.min(1, item.share)
      const radius = inner + (rings.length - index - 0.5) * band
      const arc = ((share * sweep) / 180) * Math.PI * radius
      if (arc < item.label.length * fontSize * 0.62 + ring) return []
      // The name follows the ring's own arc, so its end stays on the ring rather than running off into the gap.
      const from = start
      const to = start + Math.min(share * sweep, 359)
      const point = (angle: number) => {
        const theta = (angle * Math.PI) / 180
        return `${(width / 2 + radius * Math.sin(theta)).toFixed(1)} ${(height / 2 - radius * Math.cos(theta)).toFixed(1)}`
      }
      const path = `M ${point(from)} A ${radius.toFixed(1)} ${radius.toFixed(1)} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to)}`
      const fill = readableOn(lap > 0 ? darken(item.color) : item.color)
      const opacity = highlighted !== null && highlighted !== item.label ? theme.dimmedOpacity : 1
      return [
        svg`<path id="radial-label-${index}" d=${path} fill="none"></path>
          <text fill=${fill} opacity=${opacity} font-size=${fontSize.toFixed(1)}><textPath href="#radial-label-${index}" startOffset="2">${item.label}</textPath></text>`,
      ]
    })
    return html`<svg class="radial-labels" viewBox="0 0 ${width} ${height}" aria-hidden="true">${labels}</svg>`
  }

  /** The hole's content, the ring names, and the rings as text for assistive technology. */
  protected override renderOverlayExtras(): unknown {
    const rings = this.rings()
    return html`${this.renderRingLabels(rings)}
      <div class="radial-center" part="center"><slot name="center"></slot></div>
      <ul class="radial-a11y">
        ${rings.map(
          (ring) =>
            html`<li>
              ${ring.label}:
              ${
                ring.value === null
                  ? '—'
                  : `${this.format(ring.value)} / ${this.format(ring.goal)}, ${new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: 0 }).format(ring.share)}`
              }
            </li>`,
        )}
      </ul>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-radial-bar-chart': RadialBarChart
  }
}
