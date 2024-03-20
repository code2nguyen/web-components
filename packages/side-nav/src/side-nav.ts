import { LitElement, html, nothing, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, eventOptions, property, query, state } from 'lit/decorators.js'
import styles from './side-nav.scss?inline'
import { BreakpointsObserver } from '@c2n/wc-utils/controllers/breakpoints-observer.js'
import { Breakpoints, smartFixedPosition } from '@c2n/wc-utils/dom-helper.js'
import type { StyleInfo } from 'lit/directives/style-map.js'
import { styleMap } from 'lit/directives/style-map.js'
export type DisplayMode = 'over' | 'side'

const OPENED = 0b0001
const RESPONSIVE_TABLET = 0b0010
const DESKTOP_MODE = 0b0100
const TABLET_MODE = 0b1000
/**
 * @tag c2-side-nav
 *
 * @cssproperty {pixel} [--c2-side-nav__open--width=240px]
 * @cssproperty {pixel} [--c2-side-nav__open--height=100%]
 * @cssproperty {pixel} [--c2-side-nav__close--width=0px]
 * @cssproperty {pixel} [--c2-side-nav__close--height=0px]
 *
 * @cssproperty {color} --c2-side-nav--background-color
 *
 * @cssproperty {border-radius} --c2-side-nav--border-top-left-radius
 * @cssproperty {border-radius} --c2-side-nav--border-top-right-radius
 * @cssproperty {border-radius} --c2-side-nav--border-bottom-left-radius
 * @cssproperty {border-radius} --c2-side-nav--border-bottom-right-radius
 *
 * @cssproperty {padding} [--c2-side-nav--padding-top=16px]
 * @cssproperty {padding} [--c2-side-nav--padding-left=16px]
 * @cssproperty {padding} [--c2-side-nav--padding-right=16px]
 * @cssproperty {padding} [--c2-side-nav--padding-bottom=16px]
 *
 * @cssproperty {border} --c2-side-nav--border-top
 * @cssproperty {border} --c2-side-nav--border-left
 * @cssproperty {border} --c2-side-nav--border-right
 * @cssproperty {border} --c2-side-nav--border-bottom
 *
 * @cssproperty {position} [--c2-side-nav__over--position=fixed]
 *
 * @cssproperty {pixel} [--c2-side-nav__over__open--width=240px]
 * @cssproperty {pixel} [--c2-side-nav__over__open--height=100vh]
 * @cssproperty {pixel} [--c2-side-nav__over__close--width=240px]
 * @cssproperty {pixel} [--c2-side-nav__over__close--height=100vh]
 *
 * @cssproperty {pixel} [--c2-side-nav__over--top=0px]
 * @cssproperty {pixel} [--c2-side-nav__over--left=0px]
 * @cssproperty {pixel} [--c2-side-nav__over--background-color=rgb(248, 248, 248)]
 *
 * @cssproperty {border-radius} --c2-side-nav__over--border-top-left-radius
 * @cssproperty {border-radius} [--c2-side-nav__over--border-top-right-radius=8px]
 * @cssproperty {border-radius} --c2-side-nav__over--border-bottom-left-radius
 * @cssproperty {border-radius} [--c2-side-nav__over--border-bottom-right-radius=8px]
 *
 * @cssproperty {padding} [--c2-side-nav__over--padding-top=16px]
 * @cssproperty {padding} [--c2-side-nav__over--padding-left=16px]
 * @cssproperty {padding} [--c2-side-nav__over--padding-right=16px]
 * @cssproperty {padding} [--c2-side-nav__over--padding-bottom=16px]
 *
 * @cssproperty {border} --c2-side-nav__over--border-top
 * @cssproperty {border} --c2-side-nav__over--border-left
 * @cssproperty {border} --c2-side-nav__over--border-right
 * @cssproperty {border} --c2-side-nav__over--border-bottom
 *
 * @cssproperty {border} [--c2-side-nav__dropback--background-color=rgba(0, 0, 0, 0.2)]
 * @cssproperty {z-index} [--c2-side-nav__dropback--z-index=1001]
 */
@customElement('c2-side-nav')
export class SideNav extends LitElement {
  static override styles = unsafeCSS(styles)

  /**
   * opened property
   */
  private _opened = false
  public get opened() {
    return this._opened
  }
  @property({ type: Boolean, reflect: true })
  public set opened(value) {
    this._opened = value
    if (!(this.isUpdatedProperties & OPENED)) {
      this.initBreakpointState()
      this.isUpdatedProperties = this.isUpdatedProperties | OPENED
    }
  }

  /**
   * responsive-tablet property
   */
  private _responsiveTablet = false
  public get responsiveTablet() {
    return this._responsiveTablet
  }
  @property({ type: Boolean, reflect: true, attribute: 'responsive-tablet' })
  public set responsiveTablet(value) {
    this._responsiveTablet = value
    if (!(this.isUpdatedProperties & RESPONSIVE_TABLET)) {
      this.initBreakpointState()
      this.isUpdatedProperties = this.isUpdatedProperties | RESPONSIVE_TABLET
    }
  }

  /**
   * desktop-mode property
   */
  private _desktopMode: DisplayMode = 'side'
  public get desktopMode(): DisplayMode {
    return this._desktopMode
  }
  @property({ type: String, reflect: true, attribute: 'desktop-mode' })
  public set desktopMode(value: DisplayMode) {
    this._desktopMode = value
    if (!(this.isUpdatedProperties & DESKTOP_MODE)) {
      this.initBreakpointState()
      this.isUpdatedProperties = this.isUpdatedProperties | DESKTOP_MODE
    }
  }

  /**
   * tablet-mode property
   */
  private _tabletMode: DisplayMode = 'over'
  public get tabletMode(): DisplayMode {
    return this._tabletMode
  }
  @property({ type: String, reflect: true, attribute: 'tablet-mode' })
  public set tabletMode(value: DisplayMode) {
    this._tabletMode = value
    if (!(this.isUpdatedProperties & TABLET_MODE)) {
      this.initBreakpointState()
      this.isUpdatedProperties = this.isUpdatedProperties | TABLET_MODE
    }
  }

  @state() private readyForSizeNav = false
  @state() private readyForSizeNavContent = false
  @state() private silent = true
  @state() private scrollBarPosition = 0
  @state() private scrollBarHeight = 0

  private isUpdatedProperties = 0
  private breakpointStates: { [breckpoint: string]: boolean } = {}
  private breakpoints = [Breakpoints.Phone, Breakpoints.Tablet, Breakpoints.Destop]
  private contentResizeObserver?: ResizeObserver

  @query('.scroll-container') scrollContainer!: HTMLElement
  @query('slot[name="side-nav-content"]') contentSlot!: HTMLSlotElement

  private onMediaQueryChange = async (isInitial?: boolean) => {
    const { currentBreakpoint, previousBreakpoint } = this.breakpointsController
    const currentStateIndex = this.breakpoints.indexOf(previousBreakpoint)
    const nextStateIndex = this.breakpoints.indexOf(currentBreakpoint)

    // Responsive on first display
    if (isInitial) {
      this.opened = this.breakpointStates[currentBreakpoint]
      this.setStable()
    }

    // Responsive on resize
    if (this.opened) {
      // Smaller size
      if (currentStateIndex > nextStateIndex) {
        if (currentBreakpoint == Breakpoints.Phone || (this.responsiveTablet && currentBreakpoint == Breakpoints.Tablet)) {
          // save opened state to restore state
          this.breakpointStates[previousBreakpoint] = this.opened
          this.opened = false
        }
      }
    } else {
      // Bigger size
      if (currentStateIndex < nextStateIndex && this.breakpointStates[currentBreakpoint]) {
        this.opened = this.breakpointStates[currentBreakpoint]
      }
    }
  }

  private breakpointsController = new BreakpointsObserver(this, this.breakpoints, this.onMediaQueryChange)

  private handleBackdropClick() {
    this.opened = false
  }

  override connectedCallback(): void {
    this.initBreakpointState()
    super.connectedCallback()
  }

  private initBreakpointState() {
    this.breakpointStates[Breakpoints.Destop] = this.desktopMode == 'over' ? false : this.opened
    this.breakpointStates[Breakpoints.Tablet] = this.tabletMode == 'over' || this.responsiveTablet ? false : this.opened
    this.breakpointStates[Breakpoints.Phone] = false
  }

  private renderBackdrop() {
    const { currentBreakpoint } = this.breakpointsController
    smartFixedPosition(false)
    if (this.opened) {
      if (
        currentBreakpoint == Breakpoints.Phone ||
        (currentBreakpoint == Breakpoints.Destop && this.desktopMode == 'over') ||
        (currentBreakpoint == Breakpoints.Tablet && this.tabletMode == 'over')
      ) {
        smartFixedPosition(true)
        return html`<div class="backdrop" @click=${this.handleBackdropClick}></div>`
      }
    }
    return nothing
  }

  private async setStable() {
    this.readyForSizeNav = true
    this.readyForSizeNavContent = true
    await this.updateComplete
    window.requestAnimationFrame(() => {
      this.silent = false
    })
  }

  private calculateScrollbarPostion() {
    const traceWidth = this.scrollContainer.scrollHeight - this.scrollContainer.clientHeight
    if (traceWidth > 0) {
      const ratio = this.scrollContainer.clientHeight / this.scrollContainer.scrollHeight
      this.scrollBarHeight = this.scrollContainer.clientHeight * ratio
      this.scrollBarPosition = this.scrollContainer.scrollTop * ratio
    } else {
      this.scrollBarHeight = 0
    }
  }

  private renderScrollbar() {
    if (!this.scrollBarHeight) {
      return nothing
    }

    const style: StyleInfo = {
      transform: `translate3d(0px, ${this.scrollBarPosition}px,  0px)`,
      height: `${this.scrollBarHeight}px`,
    }

    return html`<div class="scrollbar-track">
      <div class="scrollbar-thumb" style="${styleMap(style)}"></div>
    </div>`
  }

  @eventOptions({ passive: true })
  private handleNavContentScroll() {
    this.calculateScrollbarPostion()
  }

  listenContentSize() {
    this.contentResizeObserver = new ResizeObserver(() => {
      this.calculateScrollbarPostion()
    })
    this.contentSlot.assignedElements().forEach((element) => {
      this.contentResizeObserver!.observe(element)
    })
  }

  override disconnectedCallback(): void {
    if (this.contentResizeObserver) {
      this.contentSlot.assignedElements().forEach((element) => {
        this.contentResizeObserver?.unobserve(element)
      })
    }
    super.disconnectedCallback()
  }
  protected override firstUpdated(_changedProperties: PropertyValueMap<this>): void {
    // this.calculateScrollbarPostion()
    this.listenContentSize()
  }

  override render() {
    return html`
      <div class="c2-side-nav">
        ${this.renderBackdrop()}

        <div class="nav-content-animate ${this.readyForSizeNav ? 'stable' : ''} ${this.silent ? 'silent' : ''}">
          <!-- nav content  -->
          <div class="nav-content">
            <div class="scroll-container" @scroll=${this.handleNavContentScroll}>
              <slot name="side-nav-content"></slot>
            </div>
            ${this.renderScrollbar()}
          </div>
        </div>

        <!-- main content, opticity = 0 until nav content is responsived -->
        <div class="main-content  ${this.readyForSizeNavContent ? 'stable' : ''}">
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
