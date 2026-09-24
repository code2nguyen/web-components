import { html, isServer, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { query } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { ChartLinkedElement, type ChartLinkTarget } from './chart-link.js'
import type { ChartTooltipContext } from './chart-types.js'
import styles from './chart-tooltip.scss?inline'

/**
 * A tooltip linked to a chart by id. It can float beside the hovered point or render inline wherever it is
 * placed in the document.
 *
 * @tag c2-chart-tooltip
 * @slot - Replaces the generated tooltip body. Use `renderTooltip` for data-driven custom content.
 * @csspart bubble - The tooltip surface.
 * @cssproperty {color} [--c2-chart__tooltip--background-color=#18181b] - Tooltip background.
 * @cssproperty {color} [--c2-chart__tooltip--color=#fafafa] - Tooltip text colour.
 * @cssproperty {font-size} [--c2-chart__tooltip--font-size=12px] - Tooltip font size.
 * @cssproperty {padding} [--c2-chart__tooltip--padding=8px 10px] - Tooltip padding.
 * @cssproperty {border-radius} [--c2-chart__tooltip--border-radius=6px] - Tooltip corner radius.
 * @cssproperty {box-shadow} [--c2-chart__tooltip--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)] - Tooltip shadow.
 * @cssproperty {pixel} [--c2-chart__tooltip--gap=6px] - Gap between tooltip rows.
 * @cssproperty {pixel} [--c2-chart__legend-marker--size=10px] - Size of the colour swatch in a tooltip row.
 * @cssproperty {border-radius} [--c2-chart__legend-marker--border-radius=999px] - Corner radius of a tooltip row's colour swatch.
 */
@customElement('c2-chart-tooltip')
export class ChartTooltip extends ChartLinkedElement {
  static override styles: CSSResultGroup = unsafeCSS(styles)

  /** Whether the tooltip follows the hovered point or occupies its authored HTML position. */
  @property({ type: String, reflect: true }) position: 'floating' | 'inline' = 'floating'

  /** Preferred side of the hovered point when `position="floating"`. Flips at viewport edges. */
  @property({ type: String, reflect: true }) placement: 'top' | 'bottom' | 'start' | 'end' = 'top'

  /** Renders the tooltip body. Property only. */
  @property({ attribute: false }) renderTooltip?: (context: ChartTooltipContext) => unknown

  @query('.bubble') private bubble?: HTMLElement
  #context: ChartTooltipContext | null = null
  #handleViewportChange = (): void => this.#position()

  constructor() {
    super()
    this.hidden = true
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (isServer) return
    window.addEventListener('resize', this.#handleViewportChange)
    window.addEventListener('scroll', this.#handleViewportChange, true)
  }

  override disconnectedCallback(): void {
    if (!isServer) {
      window.removeEventListener('resize', this.#handleViewportChange)
      window.removeEventListener('scroll', this.#handleViewportChange, true)
    }
    super.disconnectedCallback()
  }

  #handleTooltipChange = (event: Event): void => {
    const next = (event as CustomEvent<ChartTooltipContext | null>).detail
    const contentChanged = !sameTooltipContent(this.#context, next)
    this.#context = next
    this.hidden = !next
    if (contentChanged) this.requestUpdate()
    void this.updateComplete.then(() => this.#position())
  }

  protected override chartConnected(chart: ChartLinkTarget): void {
    chart.registerTooltipPresenter(this)
    chart.addEventListener('tooltip-change', this.#handleTooltipChange)
    this.#handleTooltipChange(new CustomEvent('tooltip-change', { detail: chart.getTooltipContext() }))
  }

  protected override chartDisconnected(chart: ChartLinkTarget): void {
    chart.removeEventListener('tooltip-change', this.#handleTooltipChange)
    chart.unregisterTooltipPresenter(this)
    this.#context = null
    this.hidden = true
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    if (changed.has('position') || changed.has('placement') || changed.has('renderTooltip')) this.#position()
  }

  protected override render(): TemplateResult {
    const context = this.#context
    return html`
      <div class="bubble" part="bubble" role="tooltip">
        <slot>
          ${
            context
              ? (this.renderTooltip?.(context) ??
                html`
                  <div>${context.formattedX}</div>
                  ${context.entries.map(
                    (entry) => html`
                      <div class="row">
                        <span class="marker" style="background:${entry.color}"></span>
                        <span class="label">${entry.series.label ?? entry.series.field}</span>
                        <span class="value">${entry.formatted}</span>
                      </div>
                    `,
                  )}
                `)
              : undefined
          }
        </slot>
      </div>
    `
  }

  #position(): void {
    if (this.position === 'inline') {
      this.style.removeProperty('left')
      this.style.removeProperty('top')
      return
    }
    const context = this.#context
    const chart = this.chart
    const bubble = this.bubble
    if (!context || !chart || !bubble) return

    const plot = chart.getPlotBounds()
    const bounds = bubble.getBoundingClientRect()
    const anchorX = plot.left + context.px
    const anchorY = plot.top + context.py
    const gap = 10
    const edge = 8
    let placement = this.placement
    if (placement === 'top' && anchorY - bounds.height - gap < edge) placement = 'bottom'
    else if (placement === 'bottom' && anchorY + bounds.height + gap > window.innerHeight - edge) placement = 'top'
    else if (placement === 'start' && anchorX - bounds.width - gap < edge) placement = 'end'
    else if (placement === 'end' && anchorX + bounds.width + gap > window.innerWidth - edge) placement = 'start'

    let left = anchorX - bounds.width / 2
    let top = placement === 'top' ? anchorY - bounds.height - gap : anchorY + gap
    if (placement === 'start' || placement === 'end') {
      left = placement === 'start' ? anchorX - bounds.width - gap : anchorX + gap
      top = anchorY - bounds.height / 2
    }
    left = Math.max(edge, Math.min(left, window.innerWidth - bounds.width - edge))
    top = Math.max(edge, Math.min(top, window.innerHeight - bounds.height - edge))
    this.style.left = `${left}px`
    this.style.top = `${top}px`
  }
}

function sameTooltipContent(previous: ChartTooltipContext | null, next: ChartTooltipContext | null): boolean {
  if (!previous || !next) return previous === next
  if (previous.index !== next.index || previous.entries.length !== next.entries.length) return false
  return previous.entries.every((entry, index) => entry.seriesIndex === next.entries[index]?.seriesIndex && entry.formatted === next.entries[index]?.formatted)
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chart-tooltip': ChartTooltip
  }
}
