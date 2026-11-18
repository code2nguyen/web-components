// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders charts to the declarative
// shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements` only.
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

/**
 * Butterfly charts with their two series declared as children and no `data`: loading, empty and in error. The server
 * cannot see the children, so it must not conclude the chart has too few series.
 */
export async function renderCharts(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/butterfly-chart')
  await import('../src/chart-series')
  const series = html`<c2-chart-series field="men" label="Men"></c2-chart-series><c2-chart-series field="women" label="Women"></c2-chart-series>`
  return collectResultSync(
    render(html`
      <c2-butterfly-chart id="loading" label-field="age" loading>${series}<span slot="loading">Fetching the figures…</span></c2-butterfly-chart>
      <c2-butterfly-chart id="empty" label-field="age">${series}<span slot="empty">Nothing recorded yet.</span></c2-butterfly-chart>
      <c2-butterfly-chart id="invalid" label-field="age"><c2-chart-series field="men" label="Men"></c2-chart-series></c2-butterfly-chart>
    `),
  )
}
