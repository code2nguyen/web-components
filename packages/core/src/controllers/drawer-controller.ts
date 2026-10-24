import { isServer } from 'lit'
import type { ReactiveController, ReactiveControllerHost } from '@lit/reactive-element'
import { smartFixedPosition } from '../dom-helper.js'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Whether the last user input was a key press rather than a pointer. WebKit shows `:focus-visible` on any scripted
// focus, so moving focus to the first drawer link after a tap drew a keyboard ring on it; a pointer opening focuses the
// drawer panel instead, which still traps focus and puts Tab on the first link.
let keyboardModality = false
if (!isServer) {
  document.addEventListener('keydown', (event) => (keyboardModality = !event.metaKey && !event.altKey && !event.ctrlKey), true)
  document.addEventListener('pointerdown', () => (keyboardModality = false), true)
}

// How many open overlays hold the page's scroll lock: `smartFixedPosition` is global, so the first lock takes it and
// the last unlock releases it (a shell can have its drawer and its aside sheet open at the same time).
let scrollLocks = 0

/** Whether `node` is `host` or inside it, through any shadow roots in between. */
function isWithin(node: Node | null, host: Element): boolean {
  while (node) {
    if (node === host) return true
    node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null)
  }
  return false
}

/** The focused element, looked up through shadow roots: `document.activeElement` stops at the outermost host. */
function deepActiveElement(): Element | null {
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return active
}

export interface DrawerControllerOptions {
  /** The sliding panel: focused after a pointer opening, and read to decide whether the overlay covers the viewport. */
  panel: () => HTMLElement | null | undefined
  /** Slots whose assigned content holds the first focusable element after a keyboard opening. */
  slots: () => Iterable<HTMLSlotElement | null | undefined>
  /** Escape was pressed while the overlay was open. */
  onEscape: () => void
}

/**
 * The modal half of a navigation drawer, shared by `c2-side-nav` and `c2-app-shell`: while the overlay is open it
 * listens for Escape, locks page scrolling (only when the panel is `position: fixed`, i.e. covers the viewport), and
 * moves focus into the panel; when it closes it unlocks and puts focus back where it was, if focus is still inside the
 * host. The host decides when the overlay is open and calls {@link sync}; keeping the rest of the page `inert` stays
 * with the host, which owns the markup.
 */
export class DrawerController implements ReactiveController {
  private open = false
  private scrollLocked = false
  private previouslyFocused: Element | null = null

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly options: DrawerControllerOptions,
  ) {
    host.addController(this)
  }

  /** Whether the overlay is open as far as the controller knows. */
  get isOpen(): boolean {
    return this.open
  }

  hostDisconnected(): void {
    window.removeEventListener('keydown', this.handleKeydown)
    this.lockScroll(false)
    this.open = false
  }

  /** Call after rendering whenever the overlay may have opened or closed. */
  sync(open: boolean, { force = false } = {}) {
    if (open === this.open && !force) return
    this.open = open
    window.removeEventListener('keydown', this.handleKeydown)
    if (open) {
      window.addEventListener('keydown', this.handleKeydown)
      this.lockScroll(true)
      this.previouslyFocused = deepActiveElement()
      this.focusPanel()
    } else {
      this.lockScroll(false)
      // Only while focus is still inside the host: a click elsewhere that closed the overlay keeps its own focus.
      const focused = deepActiveElement()
      if (this.previouslyFocused instanceof HTMLElement && (focused === null || focused === document.body || isWithin(focused, this.host))) {
        this.previouslyFocused.focus()
      }
      this.previouslyFocused = null
    }
  }

  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.open) {
      event.preventDefault()
      this.options.onEscape()
    }
  }

  private lockScroll(lock: boolean) {
    if (lock === this.scrollLocked) return
    const panel = this.options.panel()
    // Only lock the page when the overlay really covers the viewport (not when it is kept inside a positioned parent).
    if (lock && (isServer || !panel || getComputedStyle(panel).position !== 'fixed')) return
    this.scrollLocked = lock
    scrollLocks += lock ? 1 : -1
    if (lock ? scrollLocks === 1 : scrollLocks === 0) smartFixedPosition(lock)
  }

  private focusPanel() {
    const panel = this.options.panel()
    if (!keyboardModality) {
      panel?.focus({ preventScroll: true })
      return
    }
    for (const slot of this.options.slots()) {
      for (const element of slot?.assignedElements({ flatten: true }) ?? []) {
        const target = element.matches(FOCUSABLE) ? element : element.querySelector(FOCUSABLE)
        if (target instanceof HTMLElement) {
          target.focus()
          return
        }
      }
    }
    panel?.focus()
  }
}
