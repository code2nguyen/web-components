import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { provide } from '@lit/context'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { DrawerController } from '@c2n/core/controllers/drawer-controller.js'
import { appShellContext, type AppShellBreakpoint, type AppShellContext, type AppShellMode } from '@c2n/core/contexts/app-shell.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { appShellMessages } from './messages.js'
import './app-shell-toggle.js'
import styles from './app-shell.scss?inline'

export type { AppShellBreakpoint, AppShellMode } from '@c2n/core/contexts/app-shell.js'
export type AppShellLayout = 'header-first' | 'navigation-first'
export type AppShellScrolling = 'page' | 'main'

export interface NavigationOpenedChangeEventDetail {
  opened: boolean
  /** The presentation in effect when it changed. */
  mode: AppShellMode
}

export interface AsideOpenedChangeEventDetail {
  opened: boolean
}

export interface ModeChangeEventDetail {
  breakpoint: AppShellBreakpoint
  mode: AppShellMode
}

/** Events fired by {@link AppShell}, keyed for `addEventListener`. */
export interface AppShellEventMap {
  'navigation-opened-change': CustomEvent<NavigationOpenedChangeEventDetail>
  'aside-opened-change': CustomEvent<AsideOpenedChangeEventDetail>
  'mode-change': CustomEvent<ModeChangeEventDetail>
}

export interface AppShell {
  addEventListener: TypedAddEventListener<AppShell, AppShellEventMap>
  removeEventListener: TypedRemoveEventListener<AppShell, AppShellEventMap>
}

/** The shell's own width at which it becomes a tablet and a desktop layout (the `Breakpoints` of `@c2n/core`). */
const TABLET_MIN = 600
const DESKTOP_MIN = 960

const MODES: readonly AppShellMode[] = ['side', 'rail', 'over']

function toMode(value: string | undefined, fallback: AppShellMode): AppShellMode {
  return MODES.includes(value as AppShellMode) ? (value as AppShellMode) : fallback
}

function breakpointOf(width: number): AppShellBreakpoint {
  return width < TABLET_MIN ? 'phone' : width < DESKTOP_MIN ? 'tablet' : 'desktop'
}

/** Whether a click went through a link: an `<a href>`, or an element with an `href` property such as `c2-list-item`. */
function isNavigation(path: EventTarget[]): boolean {
  return path.some(
    (node) => node instanceof HTMLElement && (node.matches('a[href], area[href]') || (node.hasAttribute('href') && node.localName.includes('-'))),
  )
}

/**
 * The frame of an application: a banner, a header, a navigation, the main content, an optional aside (a details panel)
 * and a footer, each in its own slot and landmark, plus a built-in skip link to main.
 *
 * The layout follows the shell's **own width**, not the window's, so the same markup behaves inside an iframe, a split
 * view or a docs example frame. Below 600px the navigation is a modal drawer (`over`); from 600px `tablet-mode` and from
 * 960px `desktop-mode` choose between `side` (pushes main), `rail` (collapses to its icons; expanded it pushes) and
 * `over`. The aside is a column from 960px and a sheet from the end edge below that. Container queries draw the
 * layout, so the server-rendered first paint is already right.
 *
 * Put a `c2-app-shell-toggle` (or any element with `app-shell-toggle="navigation"` / `"aside"`) anywhere inside the
 * shell, including inside the slotted `c2-header`, to open and close the navigation or the aside with no script. With
 * the drawer open, focus moves into it and stays there, Escape and the backdrop close it, and focus returns to the
 * toggle. In a collapsed rail, hide the item labels with
 * `c2-app-shell:state(rail):not(:state(navigation-opened)) .label { display: none }`.
 *
 * With `scrolling="page"` (default) the page scrolls and the header region sticks to the top; with `scrolling="main"` the
 * shell takes `--c2-app-shell--height` and only main scrolls. Either way the shell sets
 * `--c2-app-shell--sticky-offset` to the height that sticky content in main must clear, which `c2-page-header` reads.
 *
 * @tag c2-app-shell
 *
 * @slot banner - A strip above everything, such as a `c2-banner` for test mode or impersonation.
 * @slot header - The application header, usually a `c2-header`. Kept outside `<main>` in both layouts, so it stays the banner landmark.
 * @slot navigation-header - Above the navigation: a logo or a workspace switcher.
 * @slot navigation - The navigation itself, such as a `c2-list` of links with their icons in the prefix slot.
 * @slot navigation-footer - Pinned to the bottom of the navigation: settings, help, the user.
 * @slot - The main content, rendered inside `<main>`.
 * @slot aside - A details panel or inspector beside main.
 * @slot footer - A status bar or page footer below main.
 * @slot skip-link - Replaces the built-in "Skip to main content" link.
 *
 * @csspart skip-link - The built-in skip link, the fallback content of the `skip-link` slot.
 * @csspart banner - Container wrapping the `banner` slot.
 * @csspart header - Container wrapping the `header` slot; it sticks to the top while the page scrolls.
 * @csspart navigation - The navigation panel (the drawer in `over` mode), containing the `navigation-header`, `navigation` and `navigation-footer` slots.
 * @csspart main - The `<main>` landmark region wrapping the default slot.
 * @csspart aside - The aside panel (a sheet below 960px) containing the `aside` slot.
 * @csspart footer - Container wrapping the `footer` slot.
 * @csspart backdrop - The backdrop behind an open drawer or aside sheet.
 *
 * @event {CustomEvent<NavigationOpenedChangeEventDetail>} navigation-opened-change - The user (a toggle, the backdrop, Escape, a link with `close-on-navigate`) or a width change opened or closed the navigation. Not fired when `navigationOpened` is set from code. Does not bubble.
 * @event {CustomEvent<AsideOpenedChangeEventDetail>} aside-opened-change - The user or a width change opened or closed the aside. Not fired when `asideOpened` is set from code. Does not bubble.
 * @event {CustomEvent<ModeChangeEventDetail>} mode-change - The shell's width crossed 600px or 960px, or a mode attribute changed the presentation in effect. Does not bubble.
 *
 * @cssproperty {pixel} [--c2-app-shell--height=100dvh] - Height of the shell with `scrolling="main"`.
 * @cssproperty {time} [--c2-app-shell--transition-duration=250ms]
 * @cssproperty {pixel} --c2-app-shell--sticky-offset - Output, not an input: the height sticky content in main must clear (the header's height with `scrolling="page"`, `0px` with `scrolling="main"`).
 * @cssproperty {pixel} [--c2-app-shell__header--z-index=10]
 * @cssproperty {pixel} [--c2-app-shell__navigation--width=240px] - Width of the side navigation and of an expanded rail.
 * @cssproperty {pixel} [--c2-app-shell__navigation__rail--width=64px] - Width of a collapsed rail.
 * @cssproperty {pixel} [--c2-app-shell__navigation__over--width=min(280px, 85%)] - Width of the drawer.
 * @cssproperty {color} [--c2-app-shell__navigation--background-color=#fafafa]
 * @cssproperty {color} --c2-app-shell__navigation--color
 * @cssproperty {padding} [--c2-app-shell__navigation--padding=8px]
 * @cssproperty {pixel} [--c2-app-shell__aside--width=320px]
 * @cssproperty {color} [--c2-app-shell__aside--background-color=#ffffff]
 * @cssproperty {padding} [--c2-app-shell__aside--padding=0px]
 * @cssproperty {color} [--c2-app-shell__main--background-color=transparent]
 * @cssproperty {padding} [--c2-app-shell__main--padding=0px]
 * @cssproperty {pixel} [--c2-app-shell__divider--width=1px] - Line between the navigation, main and the aside.
 * @cssproperty {color} [--c2-app-shell__divider--color=#e4e4e7]
 * @cssproperty {color} [--c2-app-shell__scrollbar--color=rgba(0, 0, 0, 0.2)]
 * @cssproperty {position} [--c2-app-shell__over--position=fixed] - `absolute` keeps the drawer and the aside sheet inside the shell (and does not lock page scrolling).
 * @cssproperty {box-shadow} [--c2-app-shell__over--box-shadow=0 12px 40px rgba(0, 0, 0, 0.18)]
 * @cssproperty {color} [--c2-app-shell__backdrop--background-color=rgba(0, 0, 0, 0.32)]
 * @cssproperty {number} [--c2-app-shell__backdrop--z-index=1000]
 * @cssproperty {color} [--c2-app-shell__skip-link--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-app-shell__skip-link--color=#ffffff]
 * @cssproperty {padding} [--c2-app-shell__skip-link--padding=8px 16px]
 * @cssproperty {border-radius} [--c2-app-shell__skip-link--border-radius=6px]
 * @cssproperty {font-size} [--c2-app-shell__skip-link--font-size=14px]
 * @cssproperty {font-weight} [--c2-app-shell__skip-link--font-weight=600]
 * @cssproperty {outline} [--c2-app-shell__skip-link__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-app-shell')
export class AppShell extends LitElement {
  static override styles = unsafeCSS(styles)

  /** `header-first`: the header spans the width. `navigation-first`: the navigation runs the full height and the header sits above main. */
  @property({ reflect: true }) layout: AppShellLayout = 'header-first'

  /**
   * Whether the navigation is open: the side panel shown, the rail expanded, the drawer open. The shell changes it
   * itself when its width changes, so it does not reflect; style the live state with `:state(navigation-opened)`.
   * Below 600px the initial value is ignored and the drawer starts closed.
   */
  @property({ type: Boolean, attribute: 'navigation-opened' }) navigationOpened = false

  /** Presentation of the navigation at 960px of width and up. */
  @property({ reflect: true, attribute: 'desktop-mode' }) desktopMode: AppShellMode = 'side'

  /** Presentation of the navigation from 600px to 959px. Below 600px it is always `over`. */
  @property({ reflect: true, attribute: 'tablet-mode' }) tabletMode: AppShellMode = 'rail'

  /** Whether the aside is shown: a column from 960px, a sheet below. Does not reflect; style it with `:state(aside-opened)`. */
  @property({ type: Boolean, attribute: 'aside-opened' }) asideOpened = false

  /** `page`: the page scrolls and the header sticks. `main`: the shell takes `--c2-app-shell--height` and only main scrolls. */
  @property({ reflect: true }) scrolling: AppShellScrolling = 'page'

  /** In `over` mode, a click on a link inside the navigation closes the drawer and moves focus to main. */
  @property({ type: Boolean, attribute: 'close-on-navigate' }) closeOnNavigate = false

  /** Accessible name of the navigation landmark. Empty: "Main" in the page language. */
  @property({ attribute: 'navigation-label' }) navigationLabel = ''

  /** Accessible name of the aside landmark, for slotted content that does not name itself. */
  @property({ attribute: 'aside-label' }) asideLabel = ''

  /** When set, the user's choice to expand or collapse a `side` or `rail` navigation is kept in `localStorage` under this key. */
  @property({ attribute: 'storage-key' }) storageKey = ''

  @state() private measuredBreakpoint: AppShellBreakpoint | undefined = undefined
  @state() private headerHeight = 0
  @state() private ready = false
  @state() private emptySlots = new Set<string>(['navigation-header', 'navigation-footer'])

  @query('.navigation') private navigationElement!: HTMLElement
  @query('.aside') private asideElement!: HTMLElement
  @query('.main') private mainElement!: HTMLElement
  @query('.header') private headerElement!: HTMLElement

  @provide({ context: appShellContext })
  protected shellContext: AppShellContext = this.createContext()

  private readonly internals = isServer ? undefined : this.attachInternals()
  private readonly msg = new LocalizeController(this, appShellMessages)

  /** The open state the user last chose for `side` and `rail`, restored when the width comes back to that mode. */
  private preferred: Record<'side' | 'rail', boolean> = { side: true, rail: false }
  private authorOpened = false
  /** The modes whose open state came from `storage-key`. */
  private restored = new Set<'side' | 'rail'>()
  private lastMode: AppShellMode | undefined
  private sizeObserver?: ResizeObserver
  private headerObserver?: ResizeObserver
  private offsetSheet?: CSSStyleSheet

  private readonly navigationDrawer = new DrawerController(this, {
    panel: () => this.navigationElement,
    slots: () => this.slotsIn(this.navigationElement),
    onEscape: () => this.setNavigation(false),
  })

  private readonly asideDrawer = new DrawerController(this, {
    panel: () => this.asideElement,
    slots: () => this.slotsIn(this.asideElement),
    onEscape: () => this.setAside(false),
  })

  constructor() {
    super()
    this.addEventListener('click', this.handleClick)
  }

  /** The shell's width class: `phone` below 600px, `tablet` to 959px, `desktop` from 960px. */
  get breakpoint(): AppShellBreakpoint {
    return this.measuredBreakpoint ?? 'desktop'
  }

  /** The presentation of the navigation in effect for the current width. */
  get mode(): AppShellMode {
    if (this.breakpoint === 'phone') return 'over'
    if (this.breakpoint === 'tablet') return toMode(this.tabletMode, 'rail')
    return toMode(this.desktopMode, 'side')
  }

  /** Opens or closes the navigation as a user action would (fires `navigation-opened-change`). */
  toggleNavigation(force?: boolean) {
    this.setNavigation(force ?? !this.navigationOpened)
  }

  /** Opens or closes the aside as a user action would (fires `aside-opened-change`). */
  toggleAside(force?: boolean) {
    this.setAside(force ?? !this.asideOpened)
  }

  /** Moves focus to the start of main, as the skip link does. */
  focusMain() {
    this.mainElement?.focus({ preventScroll: false })
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.authorOpened = this.navigationOpened
    this.restorePreference()
    if (isServer) return
    this.sizeObserver ??= new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      const width = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width
      requestAnimationFrame(() => this.handleWidth(width))
    })
    this.sizeObserver.observe(this)
    // Reattached after a move: the header observer was disconnected with the shell.
    if (this.hasUpdated) this.observeHeader()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.sizeObserver?.disconnect()
    this.headerObserver?.disconnect()
  }

  protected override firstUpdated(): void {
    if (isServer) return
    this.offsetSheet = new CSSStyleSheet()
    const root = this.renderRoot as ShadowRoot
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, this.offsetSheet]
    this.observeHeader()
  }

  private observeHeader() {
    // Read in the next frame: changing the offset re-renders the shell, which would resize the header in the same loop.
    this.headerObserver ??= new ResizeObserver(() => requestAnimationFrame(() => (this.headerHeight = this.headerElement.getBoundingClientRect().height)))
    this.headerObserver.observe(this.headerElement)
  }

  private createContext(): AppShellContext {
    return {
      mode: this.mode,
      breakpoint: this.breakpoint,
      navigationOpened: this.navigationOpened,
      asideOpened: this.asideOpened,
      toggleNavigation: (force?: boolean) => this.toggleNavigation(force),
      toggleAside: (force?: boolean) => this.toggleAside(force),
    }
  }

  private slotsIn(element: Element | null | undefined): HTMLSlotElement[] {
    return [...(element?.querySelectorAll('slot') ?? [])]
  }

  private handleWidth(width: number) {
    if (width <= 0) return
    const next = breakpointOf(width)
    if (next === this.measuredBreakpoint) return
    const first = this.measuredBreakpoint === undefined
    this.measuredBreakpoint = next
    const mode = this.mode
    if (first) {
      // The author's `navigation-opened` describes the layout they designed for; a drawer never starts open.
      // A choice the user saved under `storage-key` wins over the author's default.
      if (mode !== 'over' && this.authorOpened && !this.restored.has(mode)) this.preferred[mode] = true
      this.navigationOpened = mode === 'over' ? false : this.preferred[mode]
      if (this.breakpoint !== 'desktop') this.asideOpened = false
      this.lastMode = mode
      this.updateComplete.then(() => requestAnimationFrame(() => (this.ready = true)))
      return
    }
    this.applyMode(true)
  }

  /** Puts the navigation (and a sheet aside) in the default state of the mode in effect, after a width or mode change. */
  private applyMode(emitModeChange: boolean) {
    const mode = this.mode
    if (mode === this.lastMode && !emitModeChange) return
    const modeChanged = mode !== this.lastMode
    this.lastMode = mode
    const opened = mode === 'over' ? false : this.preferred[mode]
    if (opened !== this.navigationOpened) {
      this.navigationOpened = opened
      this.emitNavigation(opened, mode)
    }
    if (this.breakpoint !== 'desktop' && this.asideOpened) {
      this.asideOpened = false
      this.emitAside(false)
    }
    if (modeChanged || emitModeChange)
      this.dispatchEvent(new CustomEvent<ModeChangeEventDetail>('mode-change', { detail: { breakpoint: this.breakpoint, mode } }))
  }

  private setNavigation(opened: boolean) {
    if (opened === this.navigationOpened) return
    this.navigationOpened = opened
    const mode = this.mode
    if (mode !== 'over') {
      this.preferred[mode] = opened
      this.storePreference()
    }
    this.emitNavigation(opened, mode)
  }

  private setAside(opened: boolean) {
    if (opened === this.asideOpened) return
    this.asideOpened = opened
    this.emitAside(opened)
  }

  private emitNavigation(opened: boolean, mode: AppShellMode) {
    this.dispatchEvent(new CustomEvent<NavigationOpenedChangeEventDetail>('navigation-opened-change', { detail: { opened, mode } }))
  }

  private emitAside(opened: boolean) {
    this.dispatchEvent(new CustomEvent<AsideOpenedChangeEventDetail>('aside-opened-change', { detail: { opened } }))
  }

  private restorePreference() {
    if (!this.storageKey || isServer) return
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null') as Partial<Record<'side' | 'rail', unknown>> | null
      for (const mode of ['side', 'rail'] as const) {
        const value = saved?.[mode]
        if (typeof value !== 'boolean') continue
        this.preferred[mode] = value
        this.restored.add(mode)
      }
    } catch {
      // Storage blocked or a value written by something else: keep the defaults.
    }
  }

  private storePreference() {
    if (!this.storageKey) return
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.preferred))
    } catch {
      // Storage blocked (private mode, quota): the choice lasts for this page only.
    }
  }

  private handleClick = (event: MouseEvent) => {
    const path = event.composedPath()
    const index = path.findIndex((node) => node instanceof Element && node.hasAttribute('app-shell-toggle'))
    if (index !== -1 && path[index] !== this) {
      // A toggle belongs to the nearest enclosing shell, so a shell nested in a docs example does not reach this one.
      const owner = path.slice(index + 1).find((node) => node instanceof Element && node.localName === this.localName)
      if (owner === this) {
        const target = (path[index] as Element).getAttribute('app-shell-toggle')
        if (target === 'aside') this.toggleAside()
        else this.toggleNavigation()
        return
      }
    }
    if (this.closeOnNavigate && this.mode === 'over' && this.navigationOpened && path.includes(this.navigationElement)) {
      const inside = path.slice(0, path.indexOf(this.navigationElement))
      const owner = inside.find((node) => node instanceof Element && node.localName === this.localName)
      if (!owner && isNavigation(inside)) {
        this.setNavigation(false)
        // After the drawer has closed, or its focus return would take focus back to the toggle.
        this.updateComplete.then(() => this.focusMain())
      }
    }
  }

  private handleSlotChange(event: Event) {
    const slot = event.target as HTMLSlotElement
    const empty = slot.assignedNodes({ flatten: true }).length === 0
    if (empty === this.emptySlots.has(slot.name)) return
    const next = new Set(this.emptySlots)
    if (empty) next.add(slot.name)
    else next.delete(slot.name)
    this.emptySlots = next
  }

  private handleSkip(event: Event) {
    event.preventDefault()
    this.focusMain()
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (this.measuredBreakpoint !== undefined && (changed.has('desktopMode') || changed.has('tabletMode'))) this.applyMode(false)
    if (changed.has('navigationOpened') && this.mode !== 'over' && this.measuredBreakpoint !== undefined) {
      this.preferred[this.mode as 'side' | 'rail'] = this.navigationOpened
    }
    // A new object only when a shared field changed: every toggle re-renders on a new context.
    const next = this.createContext()
    const current = this.shellContext
    if (
      next.mode !== current.mode ||
      next.breakpoint !== current.breakpoint ||
      next.navigationOpened !== current.navigationOpened ||
      next.asideOpened !== current.asideOpened
    ) {
      this.shellContext = next
    }
  }

  protected override updated(changed: PropertyValues): void {
    const measured = this.measuredBreakpoint !== undefined
    const mode = this.mode
    const drawerOpen = measured && mode === 'over' && this.navigationOpened
    const sheetOpen = measured && this.breakpoint !== 'desktop' && this.asideOpened
    const asideSheetOpen = sheetOpen && !drawerOpen
    // Opening: the controller records the focused element before the rest of the shell turns inert (which would blur
    // it). Closing: the rest of the shell stops being inert before the controller gives focus back.
    if (drawerOpen) this.navigationDrawer.sync(true)
    if (asideSheetOpen) this.asideDrawer.sync(true)
    // `inert` is set here rather than bound in the template: the server cannot know the width, and Lit's hydration keeps
    // whatever attribute the server rendered.
    const modal = drawerOpen || sheetOpen
    for (const part of this.renderRoot.querySelectorAll<HTMLElement>('[data-region]')) {
      const region = part.dataset.region
      const inModal = (drawerOpen && region === 'navigation') || (asideSheetOpen && region === 'aside')
      part.toggleAttribute('inert', modal && !inModal)
    }
    if (!drawerOpen) this.navigationDrawer.sync(false)
    if (!asideSheetOpen) this.asideDrawer.sync(false)
    this.syncStates(mode)
    if (changed.has('headerHeight') || changed.has('scrolling')) this.syncOffset()
  }

  private syncStates(mode: AppShellMode) {
    const internals = this.internals
    if (!internals) return
    const states: Record<string, boolean> = {
      side: mode === 'side',
      rail: mode === 'rail',
      over: mode === 'over',
      phone: this.breakpoint === 'phone',
      tablet: this.breakpoint === 'tablet',
      desktop: this.breakpoint === 'desktop',
      'navigation-opened': this.navigationOpened,
      'aside-opened': this.asideOpened,
    }
    for (const [name, on] of Object.entries(states)) {
      if (on) internals.states.add(name)
      else internals.states.delete(name)
    }
  }

  private syncOffset() {
    const offset = this.scrolling === 'main' ? 0 : Math.round(this.headerHeight)
    this.offsetSheet?.replaceSync(`:host { --c2-app-shell--sticky-offset: ${offset}px; --_header-height: ${Math.round(this.headerHeight)}px; }`)
  }

  override render() {
    const measured = this.measuredBreakpoint !== undefined
    const mode = this.mode
    const over = measured && mode === 'over'
    const drawerOpen = over && this.navigationOpened
    const sheet = measured && this.breakpoint !== 'desktop'
    const sheetOpen = sheet && this.asideOpened
    const classes = {
      'c2-app-shell': true,
      measured,
      ready: this.ready,
      'drawer-open': drawerOpen,
      'sheet-open': sheetOpen,
      [`mode-${mode}`]: measured,
      [`bp-${this.breakpoint}`]: measured,
      'navigation-opened': measured && this.navigationOpened,
      'aside-opened': this.asideOpened,
      'navigation-first': this.layout === 'navigation-first',
      'scroll-main': this.scrolling === 'main',
    }
    const navigationName = this.navigationLabel || this.msg.t('navigation')
    return html`
      <div class=${classMap(classes)}>
        <slot name="skip-link"><a class="skip-link" part="skip-link" href="#" @click=${this.handleSkip}>${this.msg.t('skipToContent')}</a></slot>
        <div class="banner" part="banner" data-region="banner"><slot name="banner"></slot></div>
        <div class="header" part="header" data-region="header"><slot name="header"></slot></div>
        <div
          class="navigation"
          part="navigation"
          data-region="navigation"
          tabindex="-1"
          role=${over ? 'dialog' : nothing}
          aria-modal=${drawerOpen ? 'true' : nothing}
          aria-label=${over ? navigationName : nothing}
        >
          <div class="navigation-inner">
            <div class="navigation-header ${this.emptySlots.has('navigation-header') ? 'empty' : ''}">
              <slot name="navigation-header" @slotchange=${this.handleSlotChange}></slot>
            </div>
            <nav class="navigation-body" aria-label=${navigationName}><slot name="navigation"></slot></nav>
            <div class="navigation-footer ${this.emptySlots.has('navigation-footer') ? 'empty' : ''}">
              <slot name="navigation-footer" @slotchange=${this.handleSlotChange}></slot>
            </div>
          </div>
        </div>
        <main class="main" part="main" data-region="main" tabindex="-1"><slot></slot></main>
        <aside
          class="aside"
          part="aside"
          data-region="aside"
          tabindex="-1"
          aria-label=${this.asideLabel || nothing}
          aria-modal=${sheetOpen ? 'true' : nothing}
          role=${sheetOpen ? 'dialog' : nothing}
        >
          <div class="aside-inner"><slot name="aside"></slot></div>
        </aside>
        <div class="footer" part="footer" data-region="footer"><slot name="footer"></slot></div>
        <div class="backdrop" part="backdrop" @click=${() => (drawerOpen ? this.setNavigation(false) : this.setAside(false))}></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-app-shell': AppShell
  }
}
