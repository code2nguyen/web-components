// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders a c2-menu-item to the declarative
// shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements` only: the whole
// DOM shim on `globalThis` would also reach the Vite process this runs in (Sass then takes Node for a browser).
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

/** A row whose label and value are both still empty when the server renders it, as a prerendered binding leaves it. */
export async function renderMenuItem(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('@c2n/menu/menu-item.js')
  return collectResultSync(render(html`<c2-menu-item></c2-menu-item>`))
}
