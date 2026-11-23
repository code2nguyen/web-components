// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders streaming text to the declarative
// shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements` only: the whole
// DOM shim on `globalThis` would also reach the Vite process this runs in (Sass then takes Node for a browser).
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

/** Finished text: the server writes it out, so the page shows it before the element upgrades. */
export async function renderStreamingText(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/streaming-text')
  return collectResultSync(render(html`<c2-streaming-text value="Revenue grew 12% this quarter."></c2-streaming-text>`))
}

/** A stream in progress whose text the framework binds as a property: the client gets it only after it upgrades. */
export async function renderStreamingProperty(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/streaming-text')
  return collectResultSync(render(html`<c2-streaming-text streaming .value=${'Revenue grew 12% this quarter.'}></c2-streaming-text>`))
}
