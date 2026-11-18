// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders the elements to the declarative
// shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements` only: the whole
// DOM shim on `globalThis` would also reach the Vite process this runs in (Sass then takes Node for a browser).
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

/**
 * The page's markup: the `lang` is outside the elements, where a server cannot see it, and none sets `locale`. A
 * percentage has one more part in French ("12,4 %", with a space) than in English ("12.4%").
 */
export async function renderNumbers(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/format-number')
  await import('../src/delta')
  return collectResultSync(
    render(
      html`<p lang="fr">
        <c2-format-number id="number" type="percent" value="0.124" maximum-fraction-digits="1"></c2-format-number>
        <c2-delta id="delta" type="percent" value="0.124" maximum-fraction-digits="1"></c2-delta>
      </p>`,
    ),
  )
}
