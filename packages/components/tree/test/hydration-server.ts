// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders a tree to the declarative
// shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements` only: the whole
// DOM shim on `globalThis` would also reach the Vite process this runs in (Sass then takes Node for a browser).
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

/** A row whose label and value are both still empty when the server renders it, as a prerendered binding leaves it. */
export async function renderTree(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/tree')
  return collectResultSync(render(html`<c2-tree aria-label="Files"><c2-tree-item></c2-tree-item></c2-tree>`))
}

/** A tree with no rows, only its `empty` slot filled: the server draws no empty state, the client draws it after hydration. */
export async function renderEmptyTree(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/tree')
  return collectResultSync(render(html`<c2-tree aria-label="Files"><div slot="empty">Nothing yet</div></c2-tree>`))
}
