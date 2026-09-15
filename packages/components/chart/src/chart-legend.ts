import { html, unsafeCSS, type CSSResultGroup, type TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import { ChartLinkedElement, type ChartLinkTarget } from './chart-link.js'
import type { ChartLegendChangeEventDetail, ChartLegendItem } from './chart-base.js'
import styles from './chart-legend.scss?inline'

/**
 * A legend linked to a chart by id. Place it anywhere in the document to control the legend's layout
 * independently from the chart.
 *
 * @tag c2-chart-legend
 * @slot - Replaces the generated legend. Use `renderLegend` or `renderLegendItem` for data-driven custom content.
 * @csspart item - One interactive legend entry.
 * @csspart marker - The colour swatch inside an entry.
 * @cssproperty {pixel} [--c2-chart__legend--gap=12px] - Gap between legend entries.
 * @cssproperty {padding} [--c2-chart__legend--padding=0] - Padding around the legend.
 * @cssproperty {color} [--c2-chart__legend--color=#71717a] - Legend text colour.
 * @cssproperty {font-size} [--c2-chart__legend--font-size=12px] - Legend font size.
 * @cssproperty {opacity} [--c2-chart__legend__disabled--opacity=0.38] - Opacity of a disabled entry.
 * @cssproperty {pixel} [--c2-chart__legend-marker--size=10px] - Size of the colour swatch.
 * @cssproperty {border-radius} [--c2-chart__legend-marker--border-radius=999px] - Radius of the colour swatch.
 */
@customElement('c2-chart-legend')
export class ChartLegend extends ChartLinkedElement {
  static override styles: CSSResultGroup = unsafeCSS(styles)

  /** Renders the complete legend. Property only. */
  @property({ attribute: false }) renderLegend?: (items: ChartLegendItem[]) => unknown

  /** Renders the content of one generated toggle button. Property only. */
  @property({ attribute: false }) renderLegendItem?: (item: ChartLegendItem) => unknown

  @state() private items: ChartLegendItem[] = []

  #handleLegendChange = (event: Event): void => {
    this.items = (event as CustomEvent<ChartLegendChangeEventDetail>).detail.items
  }

  protected override chartConnected(chart: ChartLinkTarget): void {
    chart.registerLegendPresenter(this)
    chart.addEventListener('legend-change', this.#handleLegendChange)
    this.items = chart.getLegendItems()
  }

  protected override chartDisconnected(chart: ChartLinkTarget): void {
    chart.removeEventListener('legend-change', this.#handleLegendChange)
    chart.unregisterLegendPresenter(this)
    this.items = []
  }

  protected override render(): TemplateResult {
    const content =
      this.renderLegend?.(this.items) ??
      this.items.map(
        (item) => html`
          <button class="item" part="item" type="button" aria-pressed=${item.visible ? 'true' : 'false'} @click=${() => item.toggle()}>
            ${
              this.renderLegendItem?.(item) ??
              html`
                <span class="marker" part="marker" style="background:${item.color}"></span>
                <span>${item.label}</span>
              `
            }
          </button>
        `,
      )
    return html`<slot>${content}</slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chart-legend': ChartLegend
  }
}
