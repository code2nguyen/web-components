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
