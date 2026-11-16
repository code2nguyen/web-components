// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders the unit input to the
// declarative shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements`
// only: the whole DOM shim on `globalThis` would also reach the Vite process this runs in (Sass then takes Node for a
// browser).
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

const units = JSON.stringify([
  { value: 'kg', label: 'kg', factor: 1 },
  { value: 'g', label: 'g', factor: 0.001 },
])

/** The page's markup: the `lang` is outside the element, where a server cannot see it. */
export async function renderUnitInput(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/unit-input')
  return collectResultSync(render(html`<div lang="fr"><c2-unit-input aria-label="Farine" value="1130" unit="g" units=${units}></c2-unit-input></div>`))
}
