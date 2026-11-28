// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders the player to the declarative
// shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements` only: the whole
// DOM shim on `globalThis` would also reach the Vite process this runs in (Sass then takes Node for a browser).
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

/** A player with its own video: the server cannot know whether the visitor's browser has full screen or picture in picture. */
export async function renderPlayer(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/video-player')
  return collectResultSync(render(html`<c2-video-player label="Product tour" src="/apps/ui/public/media/tour.webm"></c2-video-player>`))
}
