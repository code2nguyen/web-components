import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import styles from './side-nav.scss?inline'
import { BreakpointsObserver } from '@c2n/wc-utils/controllers/breakpoints-observer.js'
import { Breakpoints, smartFixedPosition } from '@c2n/wc-utils/dom-helper.js'
export type DisplayMode = 'over' | 'side'

const OPENED = 0b0001
const RESPONSIVE_TABLET = 0b0010
const DESKTOP_MODE = 0b0100
const TABLET_MODE = 0b1000
/**
 * @tag c2-side-nav
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
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

  private isUpdatedProperties = 0

  private breakpointStates: { [breckpoint: string]: boolean } = {}
  private breakpoints = [Breakpoints.Phone, Breakpoints.Tablet, Breakpoints.Destop]

  @state() private readyForSizeNav = false
  @state() private readyForSizeNavContent = false
  @state() silent = true

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

  override render() {
    return html`
      <div class="c2-side-nav">
        ${this.renderBackdrop()}

        <div class="nav-content-animate ${this.readyForSizeNav ? 'stable' : ''} ${this.silent ? 'silent' : ''}">
          <!-- nav content  -->
          <div class="nav-content">
            <slot name="side-nav-content"></slot>
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
