// Client side of `hydration.spec.ts`: Lit's hydration support has to load before Lit itself, so the components are
// imported only once the test has put the server's markup in the page.
import '@lit-labs/ssr-client/lit-element-hydrate-support.js'

declare global {
  interface Window {
    hydrate(markup: string): Promise<void>
  }
}

window.hydrate = async (markup) => {
  // `setHTMLUnsafe` parses declarative shadow roots, as the page's own HTML parser does.
  document.querySelector('main')!.setHTMLUnsafe(markup)
  await import('../src/week-planner')
  const planner = document.querySelector('c2-week-planner') as Element & { updateComplete: Promise<unknown> }
  await planner.updateComplete
}
document.documentElement.dataset.modulesReady = 'true'
