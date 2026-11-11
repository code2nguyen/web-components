import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './banner.scss?inline'

export type BannerVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error'
export type BannerPosition = 'inline' | 'top' | 'bottom'

/** Events fired by {@link Banner}, keyed for `addEventListener`. */
export interface BannerEventMap {
  'banner-close': CustomEvent
}

export interface Banner {
  addEventListener: TypedAddEventListener<Banner, BannerEventMap>
  removeEventListener: TypedRemoveEventListener<Banner, BannerEventMap>
}

/**
 * A persistent, full-width message placed in the page flow: system notices, outages, trial expiry, cookie consent.
 * `position` pins it to an edge of the viewport: `top` sticks to the top of its scroll container while keeping its
 * place in the flow, `bottom` floats fixed over the content (give the page bottom padding so nothing is covered).
 * A pinned banner spans the full width with square corners and a border on its inner edge only.
 * `callout` turns it into an in-content admonition for prose, docs and forms: the heading on its own line above the
 * body, the icon at the top, the actions under the body, and a `note` role instead of a live region.
 * @tag c2-banner
 * @slot default - Message content, replacing message.
 * @slot icon - Leading icon, with a variant-specific SVG default.
 * @slot actions - Buttons or links shown after the message.
 * @slot close-icon - Replaces the dismiss button icon.
 * @event {CustomEvent} banner-close - The dismiss button was activated. Cancelable; unless prevented the banner hides itself.
 * @csspart container - The banner surface.
 * @csspart icon - Container wrapping the `icon` slot: the variant SVG by default, or the assigned icon.
 * @csspart content - Container for the heading and message.
 * @csspart heading - The optional heading.
 * @csspart message - Container for the message.
 * @csspart actions - Container for the assigned actions slot.
 * @csspart close - The dismiss button.
 *
 * @cssproperty {pixel} [--c2-banner--offset=0px] - Distance from the pinned edge when `position` is `top` or `bottom`.
 * @cssproperty {number} [--c2-banner--z-index=10] - Stacking order when `position` is `top` or `bottom`.
 * @cssproperty {color} [--c2-banner__container--background=#fafafa]
 * @cssproperty {color} [--c2-banner__container--color=#18181b]
 * @cssproperty {border} [--c2-banner__container--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-banner__container--border-radius=8px]
 * @cssproperty {padding} [--c2-banner__container--padding=12px 16px]
 * @cssproperty {pixel} [--c2-banner__container--gap=12px]
 * @cssproperty {box-shadow} [--c2-banner__container--box-shadow=0 1px 2px rgba(24, 24, 27, 0.05)]
 * @cssproperty {font-family} [--c2-banner__container--font-family=inherit]
 * @cssproperty {font-size} [--c2-banner__container--font-size=14px]
 * @cssproperty {line-height} [--c2-banner__container--line-height=1.5]
 * @cssproperty {percentage} [--c2-banner__container__variant--background-mix=8%] - Share of the variant colour mixed into the background.
 * @cssproperty {percentage} [--c2-banner__container__variant--border-mix=32%] - Share of the variant colour in the border colour.
 * @cssproperty {font-weight} [--c2-banner__heading--font-weight=600]
 * @cssproperty {pixel} [--c2-banner__heading__callout--margin-block-end=2px] - Space between a callout's heading and its body.
 * @cssproperty {pixel} [--c2-banner__icon--size=20px]
 * @cssproperty {color} [--c2-banner__icon--color=#71717a]
 * @cssproperty {padding} [--c2-banner__icon--padding=6px] - Space between the glyph and the edge of its tinted disc; `0` removes the disc's padding.
 * @cssproperty {border-radius} [--c2-banner__icon--border-radius=999px]
 * @cssproperty {percentage} [--c2-banner__icon--background-mix=14%] - Share of the icon colour in the disc behind it; `0%` removes the disc.
 * @cssproperty {color} [--c2-banner__icon__info--color=#2563eb]
 * @cssproperty {color} [--c2-banner__icon__success--color=#15803d]
 * @cssproperty {color} [--c2-banner__icon__warning--color=#a16207]
 * @cssproperty {color} [--c2-banner__icon__error--color=#dc2626]
 * @cssproperty {pixel} [--c2-banner__actions--gap=8px]
 * @cssproperty {color} [--c2-banner__close--color=#71717a]
 * @cssproperty {color} [--c2-banner__close__hover--background=#f4f4f5]
 * @cssproperty {border-radius} [--c2-banner__close--border-radius=4px]
 * @cssproperty {outline} [--c2-banner__close__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-banner')
export class Banner extends LitElement {
  static override styles = unsafeCSS(styles)
  /** Plain-text message; the default slot can replace it. */
  @property() message = ''
  /** Optional title before the message. */
  @property() heading = ''
  /** Semantic variant: tints the banner with the matching icon colour. `warning` and `error` are announced as alerts, the others as status messages (a callout is never announced). */
  @property({ reflect: true }) variant: BannerVariant = 'neutral'
  /** `inline` stays in the page flow; `top` sticks to the top edge while scrolling; `bottom` is fixed to the bottom of the viewport. */
  @property({ reflect: true }) position: BannerPosition = 'inline'
  /**
   * Presents the banner as a callout: an admonition that is part of the content (a note, a tip, a warning in a doc or a
   * form) rather than a notice about the page. It is laid out as a block, with the heading above the body and the
   * actions under it, and exposed as a `note` instead of a status or alert live region, so it is read in place and
   * never announced. Use `variant` for the tone: `info` for a note, `success` for a tip, `warning`, `error` for danger.
   */
  @property({ type: Boolean, reflect: true }) callout = false
  /** Hides the leading icon and removes its space from the layout. */
  @property({ type: Boolean, attribute: 'no-icon' }) noIcon = false
  /** Shows a keyboard-accessible dismiss button. */
  @property({ type: Boolean }) dismissible = false
  /** Accessible name of the dismiss button. */
  @property({ attribute: 'close-label' }) closeLabel = 'Dismiss'

  @state() private hasActions = false

  // A server-rendered banner hydrates after its slot was filled, so no slotchange reaches the listener: read it once.
  protected override firstUpdated() {
    this.hasActions = (this.renderRoot.querySelector('slot[name="actions"]') as HTMLSlotElement).assignedNodes().length > 0
  }

  /** Requests dismissal. Fires `banner-close`; unless it is prevented the banner is hidden. Returns whether it was hidden. */
  dismiss(): boolean {
    const event = new CustomEvent('banner-close', { bubbles: true, composed: true, cancelable: true, detail: { reason: 'close' } })
    if (!this.dispatchEvent(event)) return false
    this.hidden = true
    return true
  }

  /** Shows a banner hidden by dismiss(). */
  show() {
    this.hidden = false
  }

  private renderIcon() {
    const mark =
      this.variant === 'success'
        ? html`<path d="m8 12 3 3 5-6"></path>`
        : this.variant === 'error'
          ? html`<path d="m9 9 6 6m0-6-6 6"></path>`
          : this.variant === 'warning'
            ? html`<path d="M12 7v6m0 3.5v.5"></path>`
            : html`<path d="M12 11v5m0-9v1"></path>`
    return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"></circle>
      ${mark}
    </svg>`
  }

  override render() {
    const role = this.callout ? 'note' : this.variant === 'warning' || this.variant === 'error' ? 'alert' : 'status'
    return html`<div class="banner" part="container">
      ${this.noIcon ? nothing : html`<span class="icon" part="icon" aria-hidden="true"><slot name="icon">${this.renderIcon()}</slot></span>`}
      <div class="content" part="content" role=${role}>
        ${this.heading ? html`<span class="heading" part="heading">${this.heading}</span>` : nothing}
        <span class="message" part="message"><slot>${this.message}</slot></span>
      </div>
      <div class="actions" part="actions" ?hidden=${!this.hasActions}>
        <slot name="actions" @slotchange=${(event: Event) => (this.hasActions = (event.target as HTMLSlotElement).assignedNodes().length > 0)}></slot>
      </div>
      ${
        this.dismissible
          ? html`<button type="button" class="close" part="close" aria-label=${this.closeLabel} @click=${this.dismiss}>
              <slot name="close-icon"
                ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                  <path d="m6 6 12 12M6 18 18 6"></path></svg
              ></slot>
            </button>`
          : nothing
      }
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-banner': Banner
  }
}
