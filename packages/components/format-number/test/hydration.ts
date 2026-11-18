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
  await import('../src/format-number')
  await import('../src/delta')
  const elements = [...document.querySelectorAll('main *')].filter((element) => element.localName.startsWith('c2-'))
  // Twice: the hydrating render, then the redraw in the page's language it requests.
  for (let pass = 0; pass < 2; pass++) {
    await Promise.all(elements.map((element) => (element as Element & { updateComplete?: Promise<unknown> }).updateComplete))
  }
}
document.documentElement.dataset.modulesReady = 'true'
