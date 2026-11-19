// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders an index bar to the declarative
// shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements` only: the whole
// DOM shim on `globalThis` would also reach the Vite process this runs in (Sass then takes Node for a browser).
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

/** An index bar at rest: no bubble, so the bubble's text part is empty in the server render. */
export async function renderIndexBar(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/index-bar')
  return collectResultSync(
    render(
      html`<c2-index-bar items='[{"id":"a","label":"Alpha"},{"id":"m","label":"Mango"}]'></c2-index-bar>
        <h2 id="a">Alpha</h2>
        <h2 id="m">Mango</h2>`,
    ),
  )
}
