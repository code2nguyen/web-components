/**
 * Fades in preview canvases (landing gallery, changelog cards) that render component markup as plain tags.
 *
 * Each canvas is revealed as soon as the elements it holds are defined, not when the whole `component-modules` graph has
 * finished: on a phone that graph takes seconds to download, and a single module that fails to load or evaluate rejects
 * the entire import, which used to leave every card blank. Whatever happens to the import, every canvas is revealed when
 * it settles.
 */
export function revealPreviews(canvases: Iterable<Element>, load: () => Promise<unknown>): void {
  const all = [...canvases]
  for (const canvas of all) {
    const tags = new Set([...canvas.querySelectorAll(':not(:defined)')].map((element) => element.localName))
    void Promise.all([...tags].map((tag) => customElements.whenDefined(tag))).then(() => canvas.classList.add('ready'))
  }
  load()
    .catch((error: unknown) => console.error('Some component previews failed to load', error))
    .finally(() => all.forEach((canvas) => canvas.classList.add('ready')))
}
