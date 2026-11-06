/**
 * Loads a component module the first time a section that uses it comes near the viewport: the plain-JavaScript
 * counterpart of Astro's `client:visible` for custom elements, which need no framework island. Until then the tags
 * stay undefined and render their light DOM, styled by `:not(:defined)` rules in site.css so nothing jumps.
 */
export function whenNear(selector: string, load: () => Promise<unknown>, margin = '400px 0px'): void {
  const sections = new Set<Element>()
  for (const element of document.querySelectorAll(selector)) sections.add(element.closest('section, footer, c2-backdrop') ?? element)
  if (sections.size === 0) return
  if (!('IntersectionObserver' in window)) {
    void load()
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      void load()
    },
    { rootMargin: margin },
  )
  for (const section of sections) observer.observe(section)
}

/** Wraps a loader so it runs once, on first use; every later call gets the same promise. */
export function onFirstUse<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => (pending ??= load())
}
