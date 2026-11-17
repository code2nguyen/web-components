import type { Citation } from './citation'
import type { CitationSource } from './citation-list'

// Loaded by `c2-citation-list` with `import()` once it is in a page: reading and following the markers is browser-only
// work, so the list's entry carries only what draws it.

/** What the collector needs of its list. */
export interface MarkerCollectorHost extends HTMLElement {
  readonly for: string
  readonly sources: CitationSource[]
}

/** Attributes of a marker that change what the list shows. */
const WATCHED = ['index', 'href', 'source-title', 'snippet', 'site', 'favicon']

/** The details of a source a later marker can fill in when the first one left them out. */
const FIELDS = ['title', 'snippet', 'site', 'favicon'] as const

/**
 * Whether `parent` holds nothing but the one element the list is in: no other element (a `template`, as an island keeps
 * for its slots, aside) and no text. Such a wrapper is not the answer, so the list looks past it.
 */
function isWrapper(parent: Element): boolean {
  let elements = 0
  for (const node of parent.childNodes) {
    if (node instanceof HTMLTemplateElement) continue
    if (node.nodeType === Node.ELEMENT_NODE) elements++
    else if (node.nodeType === Node.TEXT_NODE && node.textContent!.trim()) return false
  }
  return elements === 1
}

/** What makes two markers the same source: the address, else the number. */
const keyOf = (source: CitationSource) => source.href || (source.index === undefined ? '' : `#${source.index}`)

/** A marker's source, read from its properties once upgraded and from its attributes before. */
function readMarker(marker: Element): CitationSource {
  const element = marker as Partial<Citation>
  const attribute = (name: string) => marker.getAttribute(name) ?? ''
  const index = element.index ?? (marker.hasAttribute('index') ? Number(attribute('index')) : undefined)
  return {
    index: typeof index === 'number' && Number.isFinite(index) ? index : undefined,
    href: element.href ?? attribute('href'),
    title: element.sourceTitle ?? attribute('source-title'),
    snippet: element.snippet ?? attribute('snippet'),
    site: element.site ?? attribute('site'),
    favicon: element.favicon ?? attribute('favicon'),
  }
}

/** Reads the `c2-citation` markers of a list's answer, follows them, and highlights the ones a card points at. */
export class MarkerCollector {
  private observer?: MutationObserver
  /** Where the markers are read: what `scope()` found when the collector last started watching. */
  private scopeNode: ParentNode | null = null
  private queued = false
  private last = '[]'
  private highlighted: Citation[] = []

  private readonly host: MarkerCollectorHost
  private readonly collected: (sources: CitationSource[]) => void

  constructor(host: MarkerCollectorHost, collected: (sources: CitationSource[]) => void) {
    this.host = host
    this.collected = collected
  }

  /**
   * The node whose markers are listed: the element `for` names, else the parent (an element or a shadow root), past
   * any wrapper that holds nothing but the list.
   */
  private scope(): ParentNode | null {
    const host = this.host
    if (host.for) return (host.getRootNode() as Document | ShadowRoot).getElementById?.(host.for) ?? null
    let scope = host.parentNode
    while (scope instanceof Element && scope.parentNode && isWrapper(scope)) scope = scope.parentNode
    return scope
  }

  /**
   * Observes the scope for markers coming, going and changing. While the element `for` names does not exist, it
   * observes the root for that element to appear (inserted, or given the `id`) and starts over then.
   */
  watch() {
    this.disconnect()
    if (!this.host.isConnected) return
    const scope = (this.scopeNode = this.scope())
    if (scope) {
      this.observer = new MutationObserver(() => this.queue())
      this.observer.observe(scope as Node, { childList: true, subtree: true, attributes: true, attributeFilter: WATCHED })
    } else {
      this.observer = new MutationObserver(() => {
        if (this.scope()) this.watch()
      })
      this.observer.observe(this.host.getRootNode(), { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] })
    }
    this.collect()
  }

  disconnect() {
    this.observer?.disconnect()
    this.observer = undefined
    this.highlight()
    this.scopeNode = null
  }

  private markers(): Citation[] {
    return [...(this.scopeNode?.querySelectorAll('c2-citation') ?? [])]
  }

  /** Collects once per task, however many changes a streaming answer makes in it. */
  private queue() {
    if (this.queued) return
    this.queued = true
    queueMicrotask(() => {
      this.queued = false
      this.collect()
    })
  }

  /**
   * One source per address (or number), in the order of their numbers. A detail the first marker of a source leaves
   * out (a repeat marker often carries only the number and the address) is taken from the next one that has it.
   */
  collect() {
    // Given sources win: the markers are not shown, so not read.
    if (this.host.sources?.length) return
    const byKey = new Map<string, CitationSource>()
    for (const marker of this.markers()) {
      const source = readMarker(marker)
      const key = keyOf(source)
      if (!key) continue
      const known = byKey.get(key)
      if (!known) byKey.set(key, source)
      else for (const field of FIELDS) known[field] ||= source[field]
    }
    const next = [...byKey.values()].sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity))
    const json = JSON.stringify(next)
    if (json === this.last) return
    this.last = json
    this.collected(next)
  }

  /** Highlights the markers that cite `source`, and clears the ones highlighted before. */
  highlight(source?: CitationSource) {
    for (const marker of this.highlighted) marker.highlighted = false
    const key = source && keyOf(source)
    this.highlighted = key ? this.markers().filter((marker) => keyOf(readMarker(marker)) === key) : []
    for (const marker of this.highlighted) marker.highlighted = true
  }
}
