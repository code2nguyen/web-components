import { isServer, LitElement, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import type { ChartLegendItem } from './chart-base.js'
import type { ChartTooltipContext } from './chart-types.js'

/** The small public surface companion elements consume without depending on a concrete chart type. */
export interface ChartLinkTarget extends HTMLElement {
  getLegendItems(): ChartLegendItem[]
  getTooltipContext(): ChartTooltipContext | null
  getPlotBounds(): DOMRect
  registerLegendPresenter(presenter: HTMLElement): void
  unregisterLegendPresenter(presenter: HTMLElement): void
  registerTooltipPresenter(presenter: HTMLElement): void
  unregisterTooltipPresenter(presenter: HTMLElement): void
}

/** Resolves and follows a chart by id within the companion's document or shadow root. */
export abstract class ChartLinkedElement extends LitElement {
  /** Id of the chart this element presents. */
  @property({ type: String, reflect: true }) for = ''

  protected chart?: ChartLinkTarget
  static #watchers = new WeakMap<Node, { elements: Set<ChartLinkedElement>; observer: MutationObserver }>()
  #watchedRoot?: Node

  override connectedCallback(): void {
    super.connectedCallback()
    if (isServer) return
    queueMicrotask(() => this.#resolveChart())
    const root = this.getRootNode()
    const observed = root instanceof Document ? root.documentElement : root
    let watcher = ChartLinkedElement.#watchers.get(root)
    if (!watcher) {
      const elements = new Set<ChartLinkedElement>()
      const observer = new MutationObserver(() => elements.forEach((element) => element.#resolveChart()))
      observer.observe(observed, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] })
      watcher = { elements, observer }
      ChartLinkedElement.#watchers.set(root, watcher)
    }
    watcher.elements.add(this)
    this.#watchedRoot = root
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    if (this.#watchedRoot) {
      const watcher = ChartLinkedElement.#watchers.get(this.#watchedRoot)
      watcher?.elements.delete(this)
      if (watcher?.elements.size === 0) {
        watcher.observer.disconnect()
        ChartLinkedElement.#watchers.delete(this.#watchedRoot)
      }
    }
    this.#watchedRoot = undefined
    this.#setChart(undefined)
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('for') && !isServer) queueMicrotask(() => this.#resolveChart())
  }

  protected chartConnected(_chart: ChartLinkTarget): void {}

  protected chartDisconnected(_chart: ChartLinkTarget): void {}

  #resolveChart(): void {
    const root = this.getRootNode()
    const candidate = this.for && (root instanceof Document || root instanceof ShadowRoot) ? root.getElementById(this.for) : null
    const chart =
      candidate &&
      'getLegendItems' in candidate &&
      'getTooltipContext' in candidate &&
      'getPlotBounds' in candidate &&
      'registerLegendPresenter' in candidate &&
      'unregisterLegendPresenter' in candidate &&
      'registerTooltipPresenter' in candidate &&
      'unregisterTooltipPresenter' in candidate
        ? (candidate as ChartLinkTarget)
        : undefined
    this.#setChart(chart)
  }

  #setChart(chart: ChartLinkTarget | undefined): void {
    if (chart === this.chart) return
    if (this.chart) this.chartDisconnected(this.chart)
    this.chart = chart
    if (chart) this.chartConnected(chart)
    this.requestUpdate()
  }
}
