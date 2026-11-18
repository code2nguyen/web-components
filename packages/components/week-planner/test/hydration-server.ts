// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders the planner to the declarative
// shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements` only: the whole
// DOM shim on `globalThis` would also reach the Vite process this runs in (Sass then takes Node for a browser).
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

/** A planner with its own `locale`, which the server can see: it should draw French there already. */
export async function renderPlanner(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/week-planner')
  return collectResultSync(render(html`<c2-week-planner locale="fr" alternate-weeks parity="odd"></c2-week-planner>`))
}
