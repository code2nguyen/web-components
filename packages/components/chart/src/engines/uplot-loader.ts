/**
 * Lazy access to uPlot.
 *
 * The library is never imported by an element file, only from inside this function — so importing
 * `c2-line-chart` pulls in no engine, nothing runs at module scope, and the module is safe to evaluate
 * during SSR. `uplot` is a peer dependency and stays external at build time.
 */
import type uPlot from 'uplot'

let pending: Promise<typeof uPlot> | undefined
let loaded: typeof uPlot | undefined

/**
 * Loads uPlot once per page. Ten sparklines mounting at the same time share one request and one module
 * evaluation, because every caller awaits the same promise.
 */
export function loadUplot(): Promise<typeof uPlot> {
  if (!pending)
    pending = import('uplot').then((module) => {
      loaded = module.default
      return loaded
    })
  return pending
}

/**
 * The module, for callers that cannot await it — the path builders, which are read while an option object
 * is being built. `undefined` until the load resolves; every chart builds its options from inside an
 * adapter that already awaited {@link loadUplot}, so by then this is set.
 */
export function loadedUplot(): typeof uPlot | undefined {
  return loaded
}
