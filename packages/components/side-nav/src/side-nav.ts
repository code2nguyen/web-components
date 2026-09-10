import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { isServer } from 'lit-html/is-server.js'
import { classMap } from 'lit/directives/class-map.js'
import styles from './side-nav.scss?inline'
import { BreakpointsObserver } from '@c2n/core/controllers/breakpoints-observer.js'
import { Breakpoints, smartFixedPosition } from '@c2n/core/dom-helper.js'

export type DisplayMode = 'over' | 'side'
export type SideNavPosition = 'start' | 'end'
export type SideNavBreakpoint = 'phone' | 'tablet' | 'desktop'

export interface OpenedChangeEventDetail {
  opened: boolean
}

const BREAKPOINT_QUERIES = [Breakpoints.Phone, Breakpoints.Tablet, Breakpoints.Desktop]
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A layout shell with a navigation drawer beside the page content. The drawer goes in the `side-nav-content` slot, the
 * page in the default slot, and the host stretches both to its own height. In `side` mode the drawer collapses in the
 * flow and pushes the content; in `over` mode it slides over the content with a backdrop, locks page scrolling, traps
 * focus as a dialog and closes on Escape or a backdrop click. Phones always use `over`; `tablet-mode` and
 * `desktop-mode` pick the mode for the two larger breakpoints (600px and 960px), and the drawer remembers whether it
 * was open when the viewport crosses them.
 *
 * Any element inside the side nav (drawer or content) carrying a `side-nav-toggle` attribute toggles the nearest enclosing side nav when
 * clicked, so a menu button in the page or a collapse button in the drawer header needs no script. With a non-zero
 * `--c2-side-nav__close--width` the collapsed drawer becomes an icon rail; the reflected `opened` attribute lets your
 * CSS hide the labels in that state (`c2-side-nav:not([opened]) .label { display: none }`).
 *
 * @tag c2-side-nav
 *
 * @slot side-nav-content - The drawer content: a `c2-list` of links, a logo, anything.
 * @slot default - The page content beside the drawer.
 *
 * @event {CustomEvent<OpenedChangeEventDetail>} opened-change - Fired when the user or a breakpoint change opens or closes the drawer (not when `opened` is set from code). `detail.opened` is the new state.
 *
 * @cssproperty {pixel} [--c2-side-nav__open--width=240px]
 * @cssproperty {pixel} [--c2-side-nav__close--width=0px] - Width of the collapsed drawer; a non-zero value gives a rail.
 * @cssproperty {time} [--c2-side-nav--transition-duration=250ms]
 *
 * @cssproperty {color} [--c2-side-nav--background-color=#fafafa]
 * @cssproperty {color} --c2-side-nav--color
 *
 * @cssproperty {border-radius} --c2-side-nav--border-top-left-radius
 * @cssproperty {border-radius} --c2-side-nav--border-top-right-radius
 * @cssproperty {border-radius} --c2-side-nav--border-bottom-left-radius
 * @cssproperty {border-radius} --c2-side-nav--border-bottom-right-radius
 *
 * @cssproperty {padding} [--c2-side-nav--padding-top=16px]
 * @cssproperty {padding} [--c2-side-nav--padding-right=16px]
 * @cssproperty {padding} [--c2-side-nav--padding-bottom=16px]
 * @cssproperty {padding} [--c2-side-nav--padding-left=16px]
 *
 * @cssproperty {border} --c2-side-nav--border-top
 * @cssproperty {border} --c2-side-nav--border-right
 * @cssproperty {border} --c2-side-nav--border-bottom
 * @cssproperty {border} --c2-side-nav--border-left
 *
 * @cssproperty {pixel} [--c2-side-nav__divider--width=1px] - Line between the drawer and the content, on whichever side the drawer is.
 * @cssproperty {color} [--c2-side-nav__divider--color=#e4e4e7]
 *
 * @cssproperty {color} [--c2-side-nav__scrollbar--color=rgba(0, 0, 0, 0.2)]
 *
 * @cssproperty {position} [--c2-side-nav__over--position=fixed] - `absolute` keeps the overlay inside a positioned parent.
 * @cssproperty {pixel} [--c2-side-nav__over--top=0px]
 * @cssproperty {pixel} [--c2-side-nav__over--height=100dvh]
 * @cssproperty {pixel} --c2-side-nav__over--width - Defaults to the open width.
 * @cssproperty {color} --c2-side-nav__over--background-color - Defaults to the drawer background.
 * @cssproperty {box-shadow} [--c2-side-nav__over--box-shadow=0 12px 40px rgba(0, 0, 0, 0.18)]
 * @cssproperty {border-radius} --c2-side-nav__over--border-top-left-radius
 * @cssproperty {border-radius} --c2-side-nav__over--border-top-right-radius
 * @cssproperty {border-radius} --c2-side-nav__over--border-bottom-left-radius
 * @cssproperty {border-radius} --c2-side-nav__over--border-bottom-right-radius
 * @cssproperty {padding} --c2-side-nav__over--padding-top
 * @cssproperty {padding} --c2-side-nav__over--padding-right
 * @cssproperty {padding} --c2-side-nav__over--padding-bottom
 * @cssproperty {padding} --c2-side-nav__over--padding-left
 *
 * @cssproperty {color} [--c2-side-nav__backdrop--background-color=rgba(0, 0, 0, 0.32)]
 * @cssproperty {filter} [--c2-side-nav__backdrop--backdrop-filter=none]
 * @cssproperty {number} [--c2-side-nav__backdrop--z-index=1000]
 */
@customElement('c2-side-nav')
export class SideNav extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Whether the drawer is open. On phones (and on tablets unless `tablet-mode` is set explicitly) the initial value is ignored and the drawer starts closed. */
  @property({ type: Boolean, reflect: true }) opened = false

  /** How the drawer behaves at 960px and up: `side` pushes the content, `over` slides above it. */
  @property({ type: String, reflect: true, attribute: 'desktop-mode' }) desktopMode: DisplayMode = 'side'

  /** How the drawer behaves between 600px and 959px. */
  @property({ type: String, reflect: true, attribute: 'tablet-mode' }) tabletMode: DisplayMode = 'over'

  /** Also collapse the drawer on tablets in `side` mode when the viewport shrinks to that size. */
  @property({ type: Boolean, reflect: true, attribute: 'responsive-tablet' }) responsiveTablet = false

  /** Which edge the drawer is on: `start` (left in LTR) or `end`. */
  @property({ type: String, reflect: true }) position: SideNavPosition = 'start'

  @state() private breakpoint: SideNavBreakpoint = 'desktop'
  @state() private ready = false

  @query('.drawer') private drawer!: HTMLElement
  @query('.content') private contentElement!: HTMLElement

  /** The state the user wants in `side` mode, restored when the viewport grows back. */
  private preferredOpened = false
  private previouslyFocused: Element | null = null
  private scrollLocked = false

  private breakpointsController = new BreakpointsObserver(this, BREAKPOINT_QUERIES, (isInitial) => this.handleBreakpoint(isInitial))

  /** The mode in effect for the current viewport: `over` on phones, otherwise `tablet-mode` / `desktop-mode`. */
  get mode(): DisplayMode {
    if (this.breakpoint === 'phone') return 'over'
    if (this.breakpoint === 'tablet') return this.tabletMode
    return this.desktopMode
  }

  /** Opens or closes the drawer as a user action would (fires `opened-change`). */
  toggle(opened = !this.opened) {
    this.setOpened(opened, true)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.preferredOpened = this.opened
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    window.removeEventListener('keydown', this.handleKeydown)
    this.lockScroll(false)
  }

  private collapsesAt(breakpoint: SideNavBreakpoint): boolean {
    if (breakpoint === 'phone') return true
    if (breakpoint === 'tablet') return this.tabletMode === 'over' || this.responsiveTablet
    return this.desktopMode === 'over'
  }

  /**
   * On load the `opened` attribute is meant for the layout the author designed for: it is ignored on phones and for the
   * implicit tablet overlay, but honoured when an overlay mode was chosen explicitly (`desktop-mode="over"`).
   */
  private closesOnLoadAt(breakpoint: SideNavBreakpoint): boolean {
    if (breakpoint === 'phone') return true
    if (breakpoint === 'tablet') return this.responsiveTablet || (this.tabletMode === 'over' && !this.hasAttribute('tablet-mode'))
    return false
  }

  private handleBreakpoint(isInitial?: boolean) {
    const query = this.breakpointsController.currentBreakpoint
    this.breakpoint = query === Breakpoints.Phone ? 'phone' : query === Breakpoints.Tablet ? 'tablet' : 'desktop'

    if (isInitial) {
      this.preferredOpened = this.opened
      if (this.closesOnLoadAt(this.breakpoint)) this.opened = false
      this.updateComplete.then(() => requestAnimationFrame(() => (this.ready = true)))
      return
    }

    if (this.collapsesAt(this.breakpoint)) {
      if (this.opened) {
        this.preferredOpened = true
        this.setOpened(false, true)
      }
    } else if (this.opened !== this.preferredOpened) {
      this.setOpened(this.preferredOpened, true)
    }
  }

  private setOpened(opened: boolean, emit: boolean) {
    if (this.opened === opened) return
    this.opened = opened
    if (this.mode === 'side') this.preferredOpened = opened
    if (emit) {
      this.dispatchEvent(new CustomEvent<OpenedChangeEventDetail>('opened-change', { bubbles: true, composed: true, detail: { opened } }))
    }
  }

  private handleBackdropClick = () => {
    this.setOpened(false, true)
  }

  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.opened && this.mode === 'over') {
      event.preventDefault()
      this.setOpened(false, true)
    }
  }

  /** Click delegation for `[side-nav-toggle]` elements anywhere in the light DOM (drawer or content). */
  private handleToggleClick(event: Event) {
    const path = event.composedPath()
    const triggerIndex = path.findIndex((node) => node instanceof Element && node.hasAttribute('side-nav-toggle'))
    if (triggerIndex === -1 || path[triggerIndex] === this) return
    // A toggle belongs to the nearest enclosing side nav: with nested side navs (a demo inside an app shell) the click
    // must not bubble into the outer drawer as well.
    const owner = path.slice(triggerIndex + 1).find((node) => node instanceof Element && node.localName === this.localName)
    if (owner !== this) return
    this.toggle()
  }

  private lockScroll(lock: boolean) {
    if (lock === this.scrollLocked) return
    // Only lock the page when the overlay really covers the viewport (not when it is kept inside a positioned parent).
    if (lock && (isServer || getComputedStyle(this.drawer).position !== 'fixed')) return
    this.scrollLocked = lock
    smartFixedPosition(lock)
  }

  private syncOverlayState() {
    const overlayOpen = this.opened && this.mode === 'over'
    window.removeEventListener('keydown', this.handleKeydown)
    if (overlayOpen) {
      window.addEventListener('keydown', this.handleKeydown)
      this.lockScroll(true)
      this.previouslyFocused = document.activeElement
      this.focusDrawer()
    } else {
      this.lockScroll(false)
      const focused = document.activeElement
      if (focused && this.previouslyFocused instanceof HTMLElement && (focused === this || this.contains(focused))) {
        this.previouslyFocused.focus()
      }
      this.previouslyFocused = null
    }
  }

  private focusDrawer() {
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot[name="side-nav-content"]')
    for (const element of slot?.assignedElements({ flatten: true }) ?? []) {
      const target = element.matches(FOCUSABLE) ? element : element.querySelector(FOCUSABLE)
      if (target instanceof HTMLElement) {
        target.focus()
        return
      }
    }
    this.drawer.focus()
  }

  /** In side mode a collapsed drawer with a non-zero closed width is a rail and must stay interactive. */
  private get drawerInert(): boolean {
    if (this.opened) return false
    if (this.mode === 'over') return true
    if (isServer) return true
    const closeWidth = parseFloat(getComputedStyle(this).getPropertyValue('--c2-side-nav__close--width')) || 0
    return closeWidth === 0
  }

  protected override updated(changed: PropertyValues): void {
    // `inert` is set here rather than bound in the template: the server cannot know the collapsed width, and Lit's
    // hydration keeps whatever attribute the server rendered, so a template binding could leave a rail inert.
    this.drawer.toggleAttribute('inert', this.drawerInert)
    this.contentElement.toggleAttribute('inert', this.opened && this.mode === 'over')
    if (changed.has('opened') || changed.has('breakpoint') || changed.has('desktopMode') || changed.has('tabletMode')) {
      const wasOverlayOpen = changed.has('opened') ? (changed.get('opened') as boolean | undefined) && this.mode === 'over' : undefined
      const isOverlayOpen = this.opened && this.mode === 'over'
      if (wasOverlayOpen !== isOverlayOpen || changed.has('breakpoint')) this.syncOverlayState()
    }
  }

  override render() {
    const over = this.mode === 'over'
    const overlayOpen = over && this.opened
    return html`
      <div class="c2-side-nav ${classMap({ over, ready: this.ready, end: this.position === 'end' })}" @click=${this.handleToggleClick}>
        ${overlayOpen ? html`<div class="backdrop" part="backdrop" @click=${this.handleBackdropClick}></div>` : nothing}
        <div
          class="drawer"
          part="drawer"
          role=${over ? 'dialog' : nothing}
          aria-modal=${over ? 'true' : nothing}
          aria-hidden=${!this.opened && over ? 'true' : nothing}
          tabindex="-1"
        >
          <div class="panel" part="panel">
            <slot name="side-nav-content"></slot>
          </div>
        </div>
        <div class="content" part="content">
          <slot></slot>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-side-nav': SideNav
  }
}
