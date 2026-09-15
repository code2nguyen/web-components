import { property, state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import type { ChartLegendItem } from './chart-base.js'
import type { ChartEventMap } from './chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { ChartAdapter } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import './chart-series.js'

export interface PieChart {
  addEventListener: TypedAddEventListener<PieChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<PieChart, ChartEventMap>
}

/**
 * A pie or donut chart, drawn by ECharts. `label-field` names each slice and the single series supplies
 * its value, so one row is one slice.
 *
 * ```html
 * <c2-pie-chart label-field="channel" inner-radius="0.6" legend="end"
 *   data='[{ "channel": "Direct", "revenue": 4200 }, { "channel": "Search", "revenue": 3100 }]'>
 *   <c2-chart-series field="revenue"></c2-chart-series>
 * </c2-pie-chart>
 * ```
 *
 * @tag c2-pie-chart
 *
 * @cssproperty {border} [--c2-chart__slice--border=2px solid #ffffff] - Border drawn between adjacent slices.
 */
@customElement('c2-pie-chart')
export class PieChart extends EchartsChartBase {
  protected override readonly features: readonly EchartsFeature[] = ['pie']

  /** Hole in the middle, from 0 (a full pie) to 1. Anything above 0 makes it a donut. */
  @property({ type: Number, attribute: 'inner-radius' }) innerRadius = 0

  /** Outer edge as a share of the available box, from 0 to 1. */
  @property({ type: Number, attribute: 'outer-radius' }) outerRadius = 0.75

  /** Angle the first slice starts at, in degrees, counter-clockwise from three o'clock. */
  @property({ type: Number, attribute: 'start-angle' }) startAngle = 90

  /** Where the slice labels are drawn, or `none` to leave them off. */
  @property({ type: String }) labels: 'none' | 'inside' | 'outside' = 'none'

  /** Orders the slices by value rather than keeping the data order. */
  @property({ type: String }) sort: 'none' | 'asc' | 'desc' = 'none'

  constructor() {
    super()
    // A pie has no axis to follow, so the tooltip is per slice and a legend is usually wanted.
    this.tooltip = 'item'
    this.legend = 'end'
  }

  /** Slices the reader has switched off from the legend, by label. */
  @state() private hiddenSlices = new Set<string>()

  protected override get legendDependsOnData(): boolean {
    return true
  }

  /** A pie has no grid and no axes at all: contributing them would draw an empty cartesian frame. */
  protected override coordinateSystem(): Record<string, unknown> {
    return {}
  }

  /**
   * A pie's legend is its slices, not its series: there is only ever one series, so the inherited legend
   * would render a single entry ("Revenue") above a four-slice donut.
   */
  protected override legendItems(): ChartLegendItem[] {
    const labels = this.frame?.labels
    if (!labels || labels.length === 0) return super.legendItems()
    const series = this.resolvedSeries[0] ?? { field: '' }
    const theme = this.themeController.theme
    return labels.map((label, index) => ({
      label,
      color: theme.palette[index % theme.palette.length],
      visible: !this.hiddenSlices.has(label),
      toggle: () => this.setSliceVisible(label, this.hiddenSlices.has(label)),
      series,
      index,
    }))
  }

  /** Shows or hides one slice, as the legend does. ECharts selects by name, which is the slice's label. */
  setSliceVisible(label: string, visible: boolean): void {
    const next = new Set(this.hiddenSlices)
    if (visible) next.delete(label)
    else next.add(label)
    this.hiddenSlices = next
    this.adapter?.setDatumVisibility?.(label, visible)
    this.notifyLegendChange()
  }

  protected override restoreVisibility(adapter: ChartAdapter): void {
    super.restoreVisibility(adapter)
    for (const label of this.hiddenSlices) adapter.setDatumVisibility?.(label, false)
  }

  protected override dataShape(): 'pairs' | 'values' | 'named' {
    return 'named'
  }

  protected override seriesOption(_index: number, context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    return {
      type: 'pie',
      radius: [`${this.innerRadius * 100}%`, `${this.outerRadius * 100}%`],
      startAngle: this.startAngle,
      label: {
        show: this.labels !== 'none',
        position: this.labels === 'inside' ? 'inside' : 'outside',
        color: this.labels === 'inside' ? theme.surface : theme.color,
        fontSize: theme.fontSize,
      },
      labelLine: { show: this.labels === 'outside' },
      // `--c2-chart__slice--border` is a documented variable, so it has to be the thing that draws the gap
      // between slices; the surface colour is only the fallback when it is unset.
      itemStyle: sliceBorder(this, theme.surface),
      // The slice names ride on each datum from the `named` projection, so no extra wiring is needed.
      sort: this.sort === 'none' ? undefined : this.sort === 'asc' ? 'ascending' : 'descending',
    }
  }
}

/** Reads `--c2-chart__slice--border` off the host as ECharts' `{ borderColor, borderWidth }`. */
function sliceBorder(host: HTMLElement, fallbackColor: string): { borderColor: string; borderWidth: number } {
  const value = getComputedStyle(host).getPropertyValue('--c2-chart__slice--border').trim()
  if (!value || value === 'none') return { borderColor: 'transparent', borderWidth: 0 }
  const width = parseFloat(value)
  // The colour is whatever is left once the width and the line style are taken off the shorthand.
  const color = value.replace(/^\s*[\d.]+[a-z%]*\s*/i, '').replace(/^(solid|dashed|dotted|double|groove|ridge|inset|outset)\s*/i, '')
  return { borderColor: color || fallbackColor, borderWidth: Number.isFinite(width) ? width : 2 }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-pie-chart': PieChart
  }
}
