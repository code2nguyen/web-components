import { isServer } from 'lit-html/is-server.js'
import type { ReactiveController, ReactiveControllerHost } from 'lit'

export const Breakpoints = {
  Phone: '(max-width: 599.98px)',
  Tablet: '(min-width: 600px) and (max-width: 959.98px)',
  Desktop: '(min-width: 960px)',
}

export function redispatchEvent(host: HTMLElement, event: Event) {
  if (event.bubbles) {
    event.stopPropagation()
  }

  const copy = Reflect.construct(event.constructor, [event.type, event])
  const dispatched = host.dispatchEvent(copy)
  if (!dispatched) {
    event.preventDefault()
  }
  return dispatched
}

/**
 * Whether the host has light-DOM content for a slot — the default slot when `name` is omitted — read from its
 * children rather than from `assignedNodes()`, so the answer is available before the first render.
 *
 * A component that hides a row when its slot is empty needs the flag for the first paint. Reading the slots in
 * `firstUpdated` sets state after an update and costs a second render (Lit's `change-in-update` warning), and a
 * server-rendered slot never fires `slotchange`, so the flag cannot start as `false` and wait for the event. Read
 * this in `willUpdate` before the first update instead, and let `slotchange` keep the flag current afterwards.
 * Returns `false` on the server, where the light DOM is not available.
 */
export function hasSlottedContent(host: Element, name = ''): boolean {
  if (isServer) return false
  for (const node of host.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (((node as Element).getAttribute('slot') ?? '') === name) return true
    } else if (name === '' && node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '') {
      return true
    }
  }
  return false
}

export type SlotPresence = 'unknown' | 'present' | 'empty'

type SlotPresenceHost = HTMLElement & ReactiveControllerHost & { readonly updateComplete: Promise<boolean> }

function hasMeaningfulSlotNode(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== ''
}

/**
 * Tracks whether named light-DOM regions contain meaningful content without hiding authored SSR content.
 *
 * The server cannot inspect a custom element's light DOM, so every region starts as `unknown`, which is rendered
 * conservatively as present. Client-created elements resolve directly from their children before the first update.
 * An element adopting declarative shadow DOM waits until Lit has completed that initial hydration pass, then requests
 * one safe reconciliation update. Later slot changes use the same element/non-whitespace-text predicate.
 */
export class SlotPresenceController implements ReactiveController {
  readonly #host: SlotPresenceHost
  readonly #presence = new Map<string, SlotPresence>()
  #hydrating = false
  #reconciled = false
  #connected = false

  constructor(host: SlotPresenceHost, names: readonly string[]) {
    this.#host = host
    for (const name of names) this.#presence.set(name, 'unknown')
    host.addController(this)
  }

  state(name = ''): SlotPresence {
    return this.#presence.get(name) ?? 'unknown'
  }

  /** Unknown is intentionally visible until the client has authoritative assignment information. */
  has(name = ''): boolean {
    return this.state(name) !== 'empty'
  }

  readonly handleSlotChange = (event: Event): void => {
    const slot = event.target as HTMLSlotElement
    this.#set(slot.name, slot.assignedNodes({ flatten: true }).some(hasMeaningfulSlotNode), true)
  }

  hostConnected(): void {
    if (isServer) return
    if (this.#connected) {
      this.#resolveFromLightDom(true)
      return
    }

    this.#connected = true
    this.#hydrating = Boolean(this.#host.shadowRoot?.hasChildNodes())
    if (!this.#hydrating) this.#resolveFromLightDom(false)
  }

  hostUpdated(): void {
    if (!this.#hydrating || this.#reconciled) return
    this.#reconciled = true
    void this.#host.updateComplete.then(() => this.#resolveFromLightDom(true))
  }

  #resolveFromLightDom(notify: boolean): void {
    for (const name of this.#presence.keys()) this.#set(name, hasSlottedContent(this.#host, name), notify)
  }

  #set(name: string, present: boolean, notify: boolean): void {
    if (!this.#presence.has(name)) return
    const next: SlotPresence = present ? 'present' : 'empty'
    if (this.#presence.get(name) === next) return
    this.#presence.set(name, next)
    if (notify) this.#host.requestUpdate()
  }
}

let scrollLocks = 0
let previousOverflow = ''

/**
 * Counted page-scroll lock, shared by every overlay so nested ones restore in the right order: a sheet that opens a
 * modal and closes after it must not hand the page back while the modal is still up. Call the returned function to
 * release; releasing twice is a no-op.
 */
export function lockPageScroll(): () => void {
  if (isServer) return () => {}
  if (scrollLocks++ === 0) {
    previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--scrollLocks === 0) document.documentElement.style.overflow = previousOverflow
  }
}

/**
 * Whether a keydown belongs to an IME composition (Chinese, Japanese, Korean input…), in which case Enter confirms
 * the candidate text and must not submit, commit or add anything. `isComposing` alone is not enough: Safari fires
 * the confirming Enter's keydown after `compositionend`, with `isComposing` already false, but with the legacy
 * `keyCode` 229 that every engine reports for keys the IME handled.
 */
export function isComposingKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229
}

/**
 * What a form-associated control's `formDisabledCallback(disabled)` should store as "disabled by the form", for the
 * control to OR with its own `disabled` property. The platform's `disabled` combines the control's own `disabled`
 * attribute with a disabled ancestor `<fieldset>`, and the attribute counts even as `disabled="false"` (which the
 * `@property` converter reads as false), so it cannot be stored as given. With the attribute present, only a
 * disabled ancestor fieldset is a reason of the form's own: removing the attribute inside one keeps the control
 * disabled, and `disabled="false"` outside one leaves it enabled.
 */
export function disabledByAncestor(control: Element, disabled: boolean): boolean {
  return disabled && (!control.hasAttribute('disabled') || control.closest('fieldset[disabled]') !== null)
}

export function smartFixedPosition(fixed: boolean) {
  if (isServer) return
  const el = document.documentElement
  const scrollbarWidth = window.innerWidth - document.documentElement.offsetWidth
  if (fixed) {
    el.style.setProperty('--c2n-body-scroll-x', convertToUnit(-el.scrollLeft)!)
    el.style.setProperty('--c2n-body-scroll-y', convertToUnit(-el.scrollTop)!)
    el.style.setProperty('--c2n-scrollbar-offset', convertToUnit(scrollbarWidth)!)

    el.style.setProperty('overflow', 'hidden')
    el.style.setProperty('padding-inline-end', 'var(--c2n-scrollbar-offset)')
    el.style.setProperty('position', 'fixed')
    el.style.setProperty('top', 'var(--c2n-body-scroll-y)')
    el.style.setProperty('left', 'var(--c2n-body-scroll-x)')
    el.style.setProperty('width', '100%')
    el.style.setProperty('height', '100%')
  } else if (el.style.getPropertyValue('--c2n-body-scroll-x')) {
    const x = parseFloat(el.style.getPropertyValue('--c2n-body-scroll-x'))
    const y = parseFloat(el.style.getPropertyValue('--c2n-body-scroll-y'))

    el.style.removeProperty('overflow')
    el.style.removeProperty('padding-inline-end')
    el.style.removeProperty('position')
    el.style.removeProperty('top')
    el.style.removeProperty('left')
    el.style.removeProperty('width')
    el.style.removeProperty('height')

    el.style.removeProperty('--c2n-body-scroll-x')
    el.style.removeProperty('--c2n-body-scroll-y')
    el.style.removeProperty('--c2n-scrollbar-offset')
    el.scrollLeft = -x
    el.scrollTop = -y
  }
}

export function convertToUnit(str: string | number | null | undefined, unit = 'px'): string | undefined {
  if (str == null || str === '') {
    return undefined
  } else if (isNaN(+str!)) {
    return String(str)
  } else if (!isFinite(+str!)) {
    return undefined
  } else {
    return `${Number(str)}${unit}`
  }
}

/** The focused element, looked up through shadow roots: `document.activeElement` stops at the outermost host. */
export function deepActiveElement(): Element | null {
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return active
}

/** The elements Astro wraps every island in (`display: contents` through Astro's own stylesheet). */
const ISLAND_WRAPPER_TAGS = ['astro-island', 'astro-slot', 'astro-static-slot'] as const

/** A selector matching every {@link isIslandWrapper} element, for `querySelectorAll` and `closest`. */
export const ISLAND_WRAPPER_SELECTOR = ISLAND_WRAPPER_TAGS.join(', ')

/**
 * Whether the element is one of a framework's island wrappers (Astro's `astro-island`, `astro-slot`,
 * `astro-static-slot`), recognised by tag alone: the answer does not depend on styles having loaded or on the element
 * being connected. Use it where only those wrappers may be looked through and any other element must count.
 */
export function isIslandWrapper(element: Element): boolean {
  return (ISLAND_WRAPPER_TAGS as readonly string[]).includes(element.localName)
}

/**
 * Whether the element draws no box of its own: an island wrapper ({@link isIslandWrapper}) or any element whose
 * computed `display` is `contents` (a framework's wrapper, an app's `<span style="display: contents">`). Such an
 * element stands for what it holds. Only the tag is checked on the server, which has no styles.
 */
export function isLayoutWrapper(element: Element): boolean {
  if (isIslandWrapper(element)) return true
  return !isServer && getComputedStyle(element).display === 'contents'
}

export interface UnwrapContentsOptions {
  /** What counts as a wrapper to look through. Default {@link isLayoutWrapper}. */
  wrapper?: (element: Element) => boolean
  /**
   * Look through a wrapper only while it holds a single element child (default `true`). `false` steps into the first
   * element child of any wrapper that has one.
   */
  onlyChild?: boolean
}

/**
 * The element a wrapper stands for: `element` itself, or, while it is a wrapper ({@link isLayoutWrapper} by
 * default), its element child, down through nested wrappers. A framework wraps a component in a box that does not
 * render (an Astro island), an app in a `display: contents` span; a component that copies, measures or clicks a
 * slotted element wants what is inside. `null` and `undefined` are returned as they are.
 */
export function unwrapContents<T extends Element | null | undefined>(element: T, options: UnwrapContentsOptions = {}): T | Element {
  const { wrapper = isLayoutWrapper, onlyChild = true } = options
  let current: Element | null | undefined = element
  while (current && (onlyChild ? current.childElementCount === 1 : current.firstElementChild) && wrapper(current)) current = current.firstElementChild
  return current as T | Element
}

export interface FindWrappedOptions {
  /** How many levels below `element` to search (default 1: its children). */
  depth?: number
  /** An element the search does not look inside (a nested list owns its own rows). It may still match itself. */
  skip?: (element: Element) => boolean
}

/**
 * The element a slotted child stands for: itself when `match` accepts it, otherwise the first match among its
 * descendants (depth-first, in document order) within `depth` levels. That is how a row arrives wrapped by a
 * framework island, an app's link or another component (a `c2-swipe-action` around a `c2-list-item`). Unlike
 * {@link unwrapContents} it looks through any element, whatever its display.
 */
export function findWrapped<T extends Element>(element: Element, match: (element: Element) => element is T, options?: FindWrappedOptions): T | undefined
export function findWrapped(element: Element, match: (element: Element) => boolean, options?: FindWrappedOptions): Element | undefined
export function findWrapped(element: Element, match: (element: Element) => boolean, options: FindWrappedOptions = {}): Element | undefined {
  const { depth = 1, skip } = options
  const search = (current: Element, level: number): Element | undefined => {
    if (match(current)) return current
    if (level >= depth || skip?.(current)) return undefined
    for (const child of current.children) {
      const found = search(child, level + 1)
      if (found) return found
    }
    return undefined
  }
  return search(element, 0)
}

export interface FormControlOptions {
  /**
   * Only a control a person enters a value in: no `<input type="hidden">`, no button-like input (`submit`, `reset`,
   * `image`, `button`) and no form-associated element whose tag ends in `button` (`c2-button`, `c2-split-button`).
   */
  entryOnly?: boolean
}

const NOT_ENTRY_INPUT_TYPES = new Set(['hidden', 'submit', 'reset', 'image', 'button'])

/**
 * Whether the element is a form control: a native `<input>`, `<select>` or `<textarea>`, or a form-associated custom
 * element (`static formAssociated = true`, which every `c2-*` control declares). A custom element that has not
 * upgraded yet is not one, and neither are `null` and `undefined`.
 */
export function isFormControl(element: Element | null | undefined, options: FormControlOptions = {}): boolean {
  if (!element) return false
  const name = element.localName
  if (name === 'input') return !options.entryOnly || !NOT_ENTRY_INPUT_TYPES.has((element.getAttribute('type') ?? '').toLowerCase())
  if (name === 'select' || name === 'textarea') return true
  if ((element.constructor as { formAssociated?: boolean }).formAssociated !== true) return false
  return !options.entryOnly || !name.endsWith('button')
}

/**
 * The selection's ranges with their boundaries inside the given shadow roots (`Selection.getComposedRanges()`), or
 * `undefined` when the engine cannot answer. Tries the standard options object first, then the shadow roots as
 * arguments, the form WebKit first shipped (Safari 17). `getComposedRanges` is Baseline newly available (2025): a
 * caller keeps its own fallback (`shadowRoot.getSelection()` in Chromium, `getRangeAt` in Firefox) for `undefined`.
 */
export function composedSelectionRanges(selection: Selection, shadowRoots: ShadowRoot[]): StaticRange[] | undefined {
  if (typeof selection.getComposedRanges !== 'function') return undefined
  try {
    return selection.getComposedRanges({ shadowRoots })
  } catch {
    try {
      const variadic = selection.getComposedRanges as unknown as (...roots: ShadowRoot[]) => StaticRange[]
      return variadic.apply(selection, shadowRoots)
    } catch {
      return undefined
    }
  }
}

/** The first of {@link composedSelectionRanges}, or `undefined` when there is none or the engine cannot answer. */
export function composedSelectionRange(selection: Selection, shadowRoots: ShadowRoot[]): StaticRange | undefined {
  return composedSelectionRanges(selection, shadowRoots)?.[0]
}

/**
 * Makes `detail[key]` a getter that records being read, and returns whether it was. For an event that asks the
 * application to act on a field (`item-drop`: add `items`; `item-move-out`: remove `rows`): a listener that does
 * reads it, so an event nobody acted on can be told apart, whenever and however the listener was added.
 */
export function trackRead<T extends object, K extends keyof T>(detail: T, key: K): () => boolean {
  let value = detail[key]
  let read = false
  Object.defineProperty(detail, key, {
    get() {
      read = true
      return value
    },
    // A listener may replace the field (normalise the items in place): that is acting on it too.
    set(next: T[K]) {
      read = true
      value = next
    },
    enumerable: true,
    configurable: true,
  })
  return () => read
}
