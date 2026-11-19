import { html, type ReactiveController, type ReactiveControllerHost, type TemplateResult } from 'lit'

/** The SVG elements whose `href` names a resource they draw. */
const SVG_REFERENCES = new Set(['use', 'image', 'textPath', 'feImage', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'mpath'])

/**
 * Copies into the clone what its `<use href="#id">` and `url(#id)` point at in the author's document: inside the shadow
 * root an id resolves in that tree only, so an icon drawn from a page-level SVG sprite would come out blank.
 */
function inlineReferences(copy: Element, host: Node): void {
  const scope = host.getRootNode() as Document | ShadowRoot
  if (typeof scope.getElementById !== 'function') return
  const svg = copy.localName === 'svg' ? copy : copy.querySelector('svg')
  if (!svg) return
  const referenced = (element: Element): string[] =>
    [element, ...element.querySelectorAll('*')].flatMap((node) =>
      [...node.attributes].flatMap((attribute) =>
        // `href` only on the SVG elements that draw what it points at: an `<a href="#main">` is a link, not a resource.
        attribute.localName === 'href' && SVG_REFERENCES.has(node.localName)
          ? [/^#(.+)$/.exec(attribute.value)?.[1] ?? '']
          : [...attribute.value.matchAll(/url\(\s*['"]?#([^'")\s]+)/g)].map((m) => m[1]),
      ),
    )
  const own = new Set([copy, ...copy.querySelectorAll('[id]')].map((element) => element.id).filter(Boolean))
  const defs = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'defs')
  // Followed as deep as it goes: a symbol may itself fill with a page-level gradient or clip with a mask.
  const pending = referenced(copy)
  for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
    if (!id || own.has(id)) continue
    own.add(id)
    const target = scope.getElementById(id)
    if (!target) continue
    const clone = target.cloneNode(true) as Element
    // Ids inside the target come with it: a reference to one of them is satisfied, not copied again.
    for (const inner of clone.querySelectorAll('[id]')) own.add(inner.id)
    defs.append(clone)
    pending.push(...referenced(clone))
  }
  if (defs.childNodes.length) svg.prepend(defs)
}

/**
 * Gives every `id` inside a copy a suffix and points its references (`url(#id)`, `href="#id"`) at the new one: copies
 * share a shadow root, and an SVG gradient or clip path repeated under one id would resolve to the first copy only.
 */
function uniqueIds(root: Element, suffix: string): void {
  const elements = [root, ...root.querySelectorAll('*')]
  const renamed = new Map<string, string>()
  for (const element of elements) {
    if (!element.id) continue
    renamed.set(element.id, `${element.id}${suffix}`)
    element.id = `${element.id}${suffix}`
  }
  if (renamed.size === 0) return
  for (const element of elements)
    for (const attribute of [...element.attributes]) {
      // `url(#id)` anywhere; a bare `#id` only in a reference attribute (`fill="#fff"` is a colour, not an id).
      const reference = attribute.localName === 'href'
      const value = attribute.value.replace(
        reference ? /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)|^#(.+)$/g : /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g,
        (match, inUrl?: string, whole?: string) => {
          const id = inUrl ?? whole
          const next = id === undefined ? undefined : renamed.get(id)
          return next === undefined ? match : inUrl !== undefined ? `url(#${next})` : `#${next}`
        },
      )
      if (value !== attribute.value) element.setAttribute(attribute.name, value)
    }
}

/**
 * Draws what the author slotted under one name in many places of the shadow root, such as an icon in every row's
 * remove button. A light-DOM node is assigned to one slot only: a `<slot name="remove-icon">` per row shows the
 * author's icon in the first row and the built-in fallback in every other one.
 *
 * Render `source()` once (a hidden slot that collects the author's content), then, wherever the content belongs,
 * `assigned ? copy(key) : <built-in fallback>`. A copy is a deep clone without its `slot` attribute, marked
 * `aria-hidden` (it is decoration: the control that holds it keeps its own name), kept per key so a redraw reuses it.
 * Copies follow the author's content when it changes. They live in the shadow root, so a page stylesheet's class
 * rules do not reach them: inline styles, attributes and inherited custom properties do.
 */
export class SlotCopies implements ReactiveController {
  #nodes: Element[] = []
  #copies = new Map<string, Node[]>()
  #read = false
  /** Numbers the copies, for the ids inside them: never reused, even after `retain` drops some. */
  #serial = 0
  /** The pending rebuild after the slotted content changed, if any. */
  #rebuild = 0
  // Copies are clones: when the author changes the slotted content (an attribute, a child), they are made again.
  #observer?: MutationObserver

  constructor(
    private readonly host: ReactiveControllerHost & { readonly renderRoot?: ParentNode },
    /** The slot name the author writes (`slot="remove-icon"`). */
    readonly name: string,
  ) {
    host.addController(this)
  }

  hostConnected(): void {
    this.#observe()
    // The content may have changed while the host was detached, unobserved: draw it afresh.
    if (this.#nodes.length > 0 && this.#copies.size > 0) {
      this.#copies.clear()
      this.host.requestUpdate()
    }
  }

  hostDisconnected(): void {
    this.#observer?.disconnect()
    if (this.#rebuild > 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.#rebuild)
    this.#rebuild = 0
  }

  /**
   * Reads the slot once it exists. A server-rendered element hydrates with the slot already filled, and its
   * `slotchange` fired before the listener was bound, so waiting for the event would never show the author's content.
   */
  hostUpdated(): void {
    if (this.#read) return
    const slot = this.host.renderRoot?.querySelector<HTMLSlotElement>(`slot[name="${this.name}"][hidden]`)
    if (!slot) return
    this.#read = true
    // After this update, not inside it: a request from here would be a change-in-update.
    queueMicrotask(() => this.#take(slot))
  }

  /** Whether the author slotted anything under the name. */
  get assigned(): boolean {
    return this.#nodes.length > 0
  }

  /** The hidden slot that collects the author's content. Render it exactly once. */
  source(): TemplateResult {
    return html`<slot name=${this.name} hidden @slotchange=${this.#handleSlotChange}></slot>`
  }

  /** The copy drawn for `key` (a row, a tag): the same nodes on every redraw of that key. */
  copy(key: string): Node[] {
    let copies = this.#copies.get(key)
    if (!copies) {
      const suffix = `-${this.name}-${++this.#serial}`
      copies = this.#nodes.map((node) => {
        const copy = node.cloneNode(true) as Element
        copy.removeAttribute('slot')
        copy.setAttribute('aria-hidden', 'true')
        inlineReferences(copy, this.host as unknown as Node)
        uniqueIds(copy, suffix)
        return copy
      })
      this.#copies.set(key, copies)
    }
    return copies
  }

  /** Forgets the copies of keys that are gone. */
  retain(keys: Iterable<string>): void {
    if (this.#copies.size === 0) return
    const kept = new Set(keys)
    for (const key of this.#copies.keys()) if (!kept.has(key)) this.#copies.delete(key)
  }

  #handleSlotChange = (event: Event): void => {
    this.#read = true
    this.#take(event.target as HTMLSlotElement)
  }

  #take(slot: HTMLSlotElement): void {
    const nodes = slot.assignedElements({ flatten: true })
    if (nodes.length === this.#nodes.length && nodes.every((node, index) => node === this.#nodes[index])) return
    this.#copies.clear()
    this.#nodes = nodes
    this.#observe()
    this.host.requestUpdate()
  }

  #observe(): void {
    this.#observer?.disconnect()
    if (this.#nodes.length === 0 || typeof MutationObserver === 'undefined') return
    // A burst of changes (an icon upgrading, a framework render) rebuilds the copies once, on the next frame.
    this.#observer ??= new MutationObserver(() => {
      if (this.#rebuild) return
      const rebuild = () => {
        this.#rebuild = 0
        this.#copies.clear()
        this.host.requestUpdate()
      }
      // The microtask fallback checks that this rebuild is still the pending one (a disconnect cancels it).
      const id = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(rebuild) : -1
      this.#rebuild = id
      if (id === -1) queueMicrotask(() => this.#rebuild === -1 && rebuild())
    })
    for (const node of this.#nodes) this.#observer.observe(node, { attributes: true, childList: true, subtree: true, characterData: true })
  }
}
