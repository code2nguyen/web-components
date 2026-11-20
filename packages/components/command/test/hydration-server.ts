// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders a command group to the declarative
// shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements` only.
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

/** A group whose heading is still empty when the server renders it, as a prerendered binding leaves it. */
export async function renderCommand(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/command')
  return collectResultSync(render(html`<c2-command-group></c2-command-group>`))
}
