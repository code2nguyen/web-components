import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import styles from './device-frame.scss?inline'

export type DeviceFrameDevice = 'browser' | 'phone' | 'tablet' | 'laptop'

const DEVICES: DeviceFrameDevice[] = ['browser', 'phone', 'tablet', 'laptop']

/**
 * Draws a browser window, phone, tablet or laptop around its content, for product shots and live previews on
 * marketing pages and in docs. The content is the screen: an image or a video covers it, and live markup lays out
 * inside it. A `<picture>` is sized to the screen, but its inner `<img>` is the page's to size (`width: 100%;
 * height: 100%; object-fit: cover`), since the frame's styles cannot reach it.
 *
 * The frame is decorative: it adds no role, and the browser's window dots are hidden from assistive technology.
 * Describe the content itself (an image's `alt`, a `role="img"` label) when it is a picture of a product.
 *
 * @tag c2-device-frame
 *
 * @slot - What the screen shows.
 * @slot address - Replaces the browser's address text, for example with a link or a lock icon and a URL.
 * @slot actions - Controls at the end of the browser's title bar.
 *
 * @csspart frame - The device body: the window, or the bezel around the screen.
 * @csspart bar - The browser's title bar.
 * @csspart address - The browser's address field, which wraps the `address` slot: the `url` text is its fallback, replaced by assigned content.
 * @csspart screen - The screen region that wraps the default slot; the assigned content lays out inside it.
 * @csspart base - The keyboard deck under a laptop screen.
 *
 * @cssproperty {length} [--c2-device-frame__phone--width=300px] - Width of a phone; it never grows past its container.
 * @cssproperty {aspect-ratio} [--c2-device-frame__phone--aspect-ratio=9 / 19.5] - Shape of a phone's screen.
 * @cssproperty {border-radius} [--c2-device-frame__phone--border-radius=44px] - Corner radius of a phone.
 * @cssproperty {length} [--c2-device-frame__tablet--width=560px] - Width of a tablet; it never grows past its container.
 * @cssproperty {aspect-ratio} [--c2-device-frame__tablet--aspect-ratio=3 / 4] - Shape of a tablet's screen.
 * @cssproperty {border-radius} [--c2-device-frame__tablet--border-radius=28px] - Corner radius of a tablet.
 * @cssproperty {length} [--c2-device-frame__laptop--width=100%] - Width of a laptop's screen; the deck is wider. In a container that sizes to its content, set a length.
 * @cssproperty {aspect-ratio} [--c2-device-frame__laptop--aspect-ratio=16 / 10] - Shape of a laptop's screen.
 * @cssproperty {border-radius} [--c2-device-frame__laptop--border-radius=14px] - Top corner radius of a laptop lid.
 * @cssproperty {length} [--c2-device-frame__browser--width=100%] - Width of a browser window.
 * @cssproperty {length} [--c2-device-frame__browser--height=auto] - Height of a browser window's screen; `auto` fits the content.
 * @cssproperty {border-radius} [--c2-device-frame__browser--border-radius=8px] - Corner radius of a browser window.
 * @cssproperty {border} [--c2-device-frame__browser--border=1px solid #e4e4e7] - Outline of a browser window.
 * @cssproperty {color} [--c2-device-frame__bezel--color=#18181b] - Colour of the phone, tablet and laptop body.
 * @cssproperty {pixel} [--c2-device-frame__bezel--width=12px] - Width of the bezel around a phone, tablet or laptop screen.
 * @cssproperty {color} [--c2-device-frame__island--color=#000000] - Colour of the phone's camera island.
 * @cssproperty {length} [--c2-device-frame__island--width=30%] - Width of the phone's camera island; `0` removes it.
 * @cssproperty {color} [--c2-device-frame__base--color=#d4d4d8] - Colour of the laptop's keyboard deck.
 * @cssproperty {pixel} [--c2-device-frame__base--height=14px] - Height of the laptop's keyboard deck.
 * @cssproperty {color} [--c2-device-frame__bar--background-color=#f4f4f5] - Background of the browser's title bar.
 * @cssproperty {color} [--c2-device-frame__bar--color=#71717a] - Text colour of the browser's title bar.
 * @cssproperty {color} [--c2-device-frame__address--background-color=#ffffff] - Background of the browser's address field.
 * @cssproperty {font-size} [--c2-device-frame__address--font-size=12px] - Text size of the browser's address field.
 * @cssproperty {color} [--c2-device-frame__close-dot--color=#d4d4d8] - First window dot (close).
 * @cssproperty {color} [--c2-device-frame__minimize-dot--color=#d4d4d8] - Second window dot (minimise).
 * @cssproperty {color} [--c2-device-frame__zoom-dot--color=#d4d4d8] - Third window dot (zoom).
 * @cssproperty {color} [--c2-device-frame__screen--background-color=#ffffff] - Background behind the content.
 * @cssproperty {overflow} [--c2-device-frame__screen--overflow=hidden] - Whether long content is clipped (`hidden`) or scrolls (`auto`).
 * @cssproperty {shadow} [--c2-device-frame__frame--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)] - Shadow under the device.
 */
@customElement('c2-device-frame')
export class DeviceFrame extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Which device to draw. */
  @property() device: DeviceFrameDevice = 'browser'

  /** Address shown in the browser's title bar. Ignored by the other devices. */
  @property() url = ''

  private get shownDevice(): DeviceFrameDevice {
    return DEVICES.includes(this.device) ? this.device : 'browser'
  }

  private renderBar() {
    return html`
      <div class="bar" part="bar">
        <span class="dots" aria-hidden="true"><span class="dot close"></span><span class="dot minimize"></span><span class="dot zoom"></span></span>
        <div class="address" part="address">
          <slot name="address">${this.url ? html`<span class="url">${this.url}</span>` : nothing}</slot>
        </div>
        <span class="actions"><slot name="actions"></slot></span>
      </div>
    `
  }

  override render() {
    const device = this.shownDevice
    const screen = html`<div class="screen" part="screen"><slot></slot></div>`
    if (device === 'browser') {
      return html`<div class="frame frame--browser" part="frame">${this.renderBar()}${screen}</div>`
    }
    return html`
      <div class="device device--${device}">
        <div class="frame frame--${device}" part="frame">${device === 'phone' ? html`<span class="island" aria-hidden="true"></span>` : nothing}${screen}</div>
        ${device === 'laptop' ? html`<div class="base" part="base" aria-hidden="true"></div>` : nothing}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-device-frame': DeviceFrame
  }
}
