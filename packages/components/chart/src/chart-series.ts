import { LitElement, css, type PropertyValues } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { ChartSeriesConfig } from './chart-types.js'

/** Fired at the parent chart whenever a series definition changes. */
export const SERIES_CHANGE_EVENT = 'c2-chart-series-change'

/** The tag, so a chart can match a definition by name rather than by class identity. */
export const SERIES_TAG = 'c2-chart-series'

/**
 * One series of a chart, declared as a light-DOM child. The element renders nothing: it is a definition
 * the chart reads, the same way `c2-table` reads its `c2-table-column` children. Everything it exposes as
 * an attribute can also be set as a property, and `format` is property-only.
 *
 * ```html
 * <c2-line-chart x-field="month" data='[{ "month": 1, "revenue": 120, "cost": 80 }]'>
 *   <c2-chart-series field="revenue" label="Revenue"></c2-chart-series>
 *   <c2-chart-series field="cost" label="Cost" color="#ea580c"></c2-chart-series>
 * </c2-line-chart>
 * ```
 *
 * @tag c2-chart-series
 */
@customElement('c2-chart-series')
export class ChartSeries extends LitElement implements ChartSeriesConfig {
  static override styles = css`
    :host {
      display: none;
    }
  `

  /** Key of the value in the row object; may be a dotted path such as `stats.cpu`. */
  @property({ type: String }) field = ''

  /** Legend and tooltip label. Falls back to the field name. */
  @property({ type: String }) label?: string

  /** Explicit colour. Falls back to this series' slot in the chart's palette. */
  @property({ type: String }) color?: string

  /** Stroke width in pixels. Falls back to `--c2-chart__line--width`. */
  @property({ type: Number, attribute: 'line-width' }) lineWidth?: number

  /** Which y axis the series is drawn against. */
  @property({ type: String }) axis: 'left' | 'right' = 'left'

  /** Joins across gaps instead of breaking the line. */
  @property({ type: Boolean, attribute: 'span-gaps' }) spanGaps = false

  /** Leaves the series out of the chart without removing the definition. */
  @property({ type: Boolean, reflect: true }) override hidden = false

  /** Formats this series' values for the tooltip. Property only. */
  @property({ attribute: false }) format?: (value: number) => string

  /** A plain snapshot of this definition, so the chart never holds a reference to the element. */
  toConfig(): ChartSeriesConfig {
    return {
      field: this.field,
      label: this.label,
      color: this.color,
      lineWidth: this.lineWidth,
      axis: this.axis,
      spanGaps: this.spanGaps,
      hidden: this.hidden,
      format: this.format,
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.#notify()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#notify()
  }

  protected override updated(_changed: PropertyValues): void {
    this.#notify()
  }

  /** Composed so it crosses the shadow boundary of a chart that wraps its slot; the chart stops it there. */
  #notify(): void {
    this.dispatchEvent(new CustomEvent(SERIES_CHANGE_EVENT, { bubbles: true, composed: true }))
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chart-series': ChartSeries
  }
}
