import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './side-nav.scss?inline'
import { BreakpointsObserver } from '@c2n/wc-utils/controllers/breakpoints-observer.js'
import { Breakpoints } from '@c2n/wc-utils/dom-helper.js'
export type DisplayMode = 'over' | 'side'
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

  private _opened = false
  public get opened() {
    return this._opened
  }
  @property({ type: Boolean, reflect: true })
  public set opened(value) {
    this._opened = value
  }

  @property({ type: String, reflect: true }) position: 'left' | 'right' = 'left'
  @property({ type: Boolean, reflect: true, attribute: 'responsive-tablet' }) responsiveTablet = false

  @property({ type: String, reflect: true, attribute: 'desktop-mode' }) kestopMode: DisplayMode = 'side'
  @property({ type: String, reflect: true, attribute: 'tablet-mode' }) tabletMode: DisplayMode = 'side'

  private breakpointStates: { [breckpoint: string]: boolean } = {}
  private breakpoints = [Breakpoints.Phone, Breakpoints.Tablet, Breakpoints.Destop]

  private onMediaQueryChange = (isInitial?: boolean) => {
    const { currentBreakpoint, previousBreakpoint } = this.breakpointsController
    const currentStateIndex = this.breakpoints.indexOf(previousBreakpoint)
    const nextStateIndex = this.breakpoints.indexOf(currentBreakpoint)

    // Responsive on first display
    if (isInitial && this.opened) {
      this.breakpointStates[Breakpoints.Destop] = true
      this.breakpointStates[Breakpoints.Tablet] = !this.responsiveTablet
      if (currentBreakpoint == Breakpoints.Phone || (this.responsiveTablet && currentBreakpoint == Breakpoints.Tablet)) {
        this.opened = false
      }
      return
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

  private renderBackdrop() {
    return this.opened ? html`<div class="backdrop" @click=${this.handleBackdropClick}></div>` : nothing
  }

  override render() {
    return html`
      <div class="c2-side-nav">
        <div class="nav-content-wrapper">
          <div class="nav-content">
            <slot></slot>
            ${this.renderBackdrop()}
          </div>
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
