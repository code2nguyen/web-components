import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { css, unsafeCSS } from 'lit'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { Options } from 'uplot'
import styles from './chart.scss?inline'
import { UplotChartBase, type UplotSeriesStyle } from './uplot-chart-base.js'
import { linePaths, withAlpha } from './engines/uplot-paths.js'
import type { ChartEventMap } from './chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { ChartSeriesConfig } from './chart-types.js'

export interface Sparkline {
  addEventListener: TypedAddEventListener<Sparkline, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<Sparkline, ChartEventMap>
}

/**
 * A chromeless trend line sized for a table cell, a list row or the `trend` slot of a `c2-stat`: no axes,
 * no grid, no legend and no tooltip, so the whole box is the data.
 *
 * It takes the bare `number[]` shape as well as rows, which is usually all a cell has:
 *
 * ```html
 * <c2-sparkline data="[3, 5, 4, 8, 6, 11]" tone="auto"></c2-sparkline>
 * ```
 *
 * uPlot is what makes a sparkline per row affordable — the engine loads once for the page, and each
 * instance is a single canvas.
 *
 * @tag c2-sparkline
 *
 * @slotcomponent c2-chart-series
 *
 * @cssproperty {color} [--c2-chart__tone-positive--color=#16a34a] - Stroke when `tone` resolves to positive. Falls back to `--c2-chart__positive--color`.
 * @cssproperty {color} [--c2-chart__tone-negative--color=#dc2626] - Stroke when `tone` resolves to negative. Falls back to `--c2-chart__negative--color`.
 * @cssproperty {pixel} [--c2-chart__line--width=2px] - Stroke width of the line.
 * @cssproperty {opacity} [--c2-chart__area--opacity=0.18] - Opacity of the fill under the line when `type="area"`.
 */
@customElement('c2-sparkline')
export class Sparkline extends UplotChartBase {
  static override styles = [
    unsafeCSS(styles),
    // A sparkline is chrome-free and inline-sized. These are `:host` rules, so an outer author rule or a
    // `--c2-chart--*` override from the page still wins.
    css`
      :host {
        /* Redefined, not merely defaulted: the base sets these variables, so a fallback would never apply.
           An author rule on the element still wins, because it beats :host. */
        --c2-chart--width: 120px;
        --c2-chart--height: 32px;
        --c2-chart--padding: 0;
        display: inline-flex;
        border: none;
        background: none;
      }
    `,
  ]

  /** How the line is drawn. */
  @property({ type: String }) type: 'line' | 'area' = 'line'

  /**
   * Colours the line by direction. `auto` compares the last value with the first and uses the positive or
   * negative tone; `neutral` keeps the palette colour.
   */
  @property({ type: String }) tone: 'auto' | 'positive' | 'negative' | 'neutral' = 'neutral'

  constructor() {
    super()
    // A sparkline is defined by what it leaves out. These stay writable, so a consumer can put a tooltip
    // back on if they want one.
    this.axes = 'none'
    this.grid = 'none'
    this.cursor = 'none'
    this.legend = 'none'
    this.tooltip = 'none'
  }

  protected override seriesStyle(series: ChartSeriesConfig, index: number, context: ChartBuildContext): UplotSeriesStyle {
    const color = this.resolveTone(series, index, context)
    return {
      stroke: color,
      width: series.lineWidth ?? context.theme.lineWidth,
      paths: linePaths('smooth'),
      points: { show: false },
      ...(this.type === 'area' ? { fill: withAlpha(color, this.areaOpacity()) } : {}),
    }
  }

  /**
   * Reads `--c2-chart__area--opacity` off the host, as `c2-area-chart` does. The sparkline's own default is a touch
   * stronger (0.18 against 0.15), because its fill is a few pixels tall.
   */
  private areaOpacity(): number {
    const raw = parseFloat(getComputedStyle(this).getPropertyValue('--c2-chart__area--opacity'))
    return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.18
  }

  /**
   * The tone colours. Each falls back to the chart-wide `--c2-chart__positive--color` / `--c2-chart__negative--color`,
   * so a sparkline follows a page that sets only those.
   */
  private toneColor(tone: 'positive' | 'negative', context: ChartBuildContext): string {
    return tone === 'positive'
      ? this.themeController.resolveColor('var(--c2-chart__tone-positive--color, var(--c2-chart__positive--color, #16a34a))', context.theme.positive)
      : this.themeController.resolveColor('var(--c2-chart__tone-negative--color, var(--c2-chart__negative--color, #dc2626))', context.theme.negative)
  }

  /**
   * Strips every remaining pixel of chrome, so the line fills the whole box.
   *
   * The axes are left alone on purpose: `this.axes = 'none'` already builds them with `show: false`, which
   * is what makes uPlot skip both the axis element and its gutter. Handing it `axes: []` would do the
   * opposite — uPlot fills a short array back up to two axes with its own defaults, which are *visible* —
   * and a 120x32 sparkline would spend 52px of its width on a y axis it never asked for.
   */
  protected override decorateOptions(options: Options, _context: ChartBuildContext): Options {
    return { ...options, padding: [2, 2, 2, 2] }
  }

  private resolveTone(series: ChartSeriesConfig, index: number, context: ChartBuildContext): string {
    if (this.tone === 'neutral') return this.colorOf(series, index, context.theme)
    if (this.tone === 'positive') return this.toneColor('positive', context)
    if (this.tone === 'negative') return this.toneColor('negative', context)

    const column = this.frame?.columns[index]
    if (!column || !this.frame || this.frame.length < 2) return this.colorOf(series, index, context.theme)
    const first = Number(column[0])
    const last = Number(column[this.frame.length - 1])
    if (!Number.isFinite(first) || !Number.isFinite(last) || first === last) {
      return this.colorOf(series, index, context.theme)
    }
    return this.toneColor(last > first ? 'positive' : 'negative', context)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-sparkline': Sparkline
  }
}
