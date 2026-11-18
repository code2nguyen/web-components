// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders the planner to the declarative
// shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements` only: the whole
// DOM shim on `globalThis` would also reach the Vite process this runs in (Sass then takes Node for a browser).
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

/** A month grid and an agenda of the same month, drawn on a server whose clock knows nothing of the visitor's today. */
export async function renderPlanners(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/month-planner')
  const events = JSON.stringify([{ title: 'Offsite', start: '2026-09-03' }])
  // The server's clock is on a day of the month shown (the 20th), unlike the visitor's (the 15th, in the browser): a
  // marker drawn on the server would show in the markup.
  const RealDate = globalThis.Date
  const serverNow = new RealDate(2026, 8, 20, 10).getTime()
  globalThis.Date = class extends RealDate {
    constructor(...args: ConstructorParameters<typeof RealDate> | []) {
      if (args.length) super(...(args as ConstructorParameters<typeof RealDate>))
      else super(serverNow)
    }
    static override now() {
      return serverNow
    }
  } as DateConstructor
  try {
    return collectResultSync(
      render(
        html`<c2-month-planner id="grid" locale="en-US" month="2026-09" events=${events}></c2-month-planner>
          <c2-month-planner id="agenda" locale="en-US" month="2026-09" view="agenda" events=${events}></c2-month-planner>
          <c2-month-planner id="current" locale="en-US" events=${events}></c2-month-planner>`,
      ),
    )
  } finally {
    globalThis.Date = RealDate
  }
}
