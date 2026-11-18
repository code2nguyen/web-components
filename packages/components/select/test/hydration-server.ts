// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders the select to the declarative
// shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements` only: the whole
// DOM shim on `globalThis` would also reach the Vite process this runs in (Sass then takes Node for a browser).
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

/** A select with a value, its options server-rendered as well, each in a `display: contents` wrapper like an island. */
export async function renderSelect(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/select')
  await import('@c2n/list-item')
  return collectResultSync(
    render(
      html`<c2-select value="system" aria-label="Theme"
        ><div style="display: contents"><c2-list-item value="light">Light</c2-list-item></div>
        <div style="display: contents"><c2-list-item value="system">System</c2-list-item></div>
        <div style="display: contents"><c2-list-item value="dark">Dark</c2-list-item></div></c2-select
      >`,
    ),
  )
}
