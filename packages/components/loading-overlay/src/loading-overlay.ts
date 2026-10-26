import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import '@c2n/spinner'
import { loadingOverlayMessages } from './messages'
import styles from './loading-overlay.scss?inline'

/**
 * Covers a region while it loads: a card refreshing its numbers, a table fetching its next page, a form saving. The
 * content stays where it is, dimmed under a scrim with a spinner in the middle, and cannot be clicked, typed into or
 * tabbed to until loading ends; the layout does not jump, as it would if the content were swapped for a placeholder.
 * Use `c2-skeleton` instead when there is nothing to show yet.
 *
 * While `loading`, the content is `inert`, the element is marked busy (`aria-busy`) and a polite live region
 * announces the `label`, the text of the `label` slot, or the translatable "Loading". Focus inside the content when
 * loading starts is lost with it, as the browser drops focus from inert content; move it somewhere useful first if
 * the user was typing.
 *
 * The overlay fades in after `--c2-loading-overlay--delay`, so a load that finishes quickly never flashes it; the
 * content is blocked from the start either way.
 *
 * @tag c2-loading-overlay
 *
 * @slot - The region to cover.
 * @slot indicator - Replaces the spinner.
 * @slot label - Text under the spinner, e.g. "Saving changes…". Also what is announced.
 *
 * @csspart scrim - The layer covering the content.
 * @csspart indicator - Container of the spinner (or the `indicator` slot) and the label.
 * @csspart label - Container of the `label` slot; hidden while it is empty.
 *
 * @cssproperty {color} [--c2-loading-overlay__scrim--background-color=#ffffff] - Colour of the scrim; follows the surface in dark mode.
 * @cssproperty {opacity} [--c2-loading-overlay__scrim--opacity=0.72] - How much of the content the scrim hides.
 * @cssproperty {pixel} [--c2-loading-overlay__scrim--blur=1px] - Blur of the content under the scrim; `0px` for none.
 * @cssproperty {border-radius} [--c2-loading-overlay--border-radius=inherit] - Rounds the scrim to match the region; it follows the host's own radius by default.
 * @cssproperty {number} [--c2-loading-overlay--z-index=10] - Stacking of the overlay above the content.
 * @cssproperty {time} [--c2-loading-overlay--delay=0ms] - Wait before the overlay fades in, e.g. `300ms` so quick loads never show it.
 * @cssproperty {time} [--c2-loading-overlay--transition-duration=150ms] - Fade in and out.
 * @cssproperty {pixel} [--c2-loading-overlay__spinner--size=32px]
 * @cssproperty {color} [--c2-loading-overlay__spinner--color=#0265dc]
 * @cssproperty {pixel} [--c2-loading-overlay__indicator--gap=12px] - Space between the spinner and the label.
 * @cssproperty {color} [--c2-loading-overlay__label--color=#18181b]
 * @cssproperty {font-size} [--c2-loading-overlay__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-loading-overlay__label--font-weight=500]
 */
@customElement('c2-loading-overlay')
export class LoadingOverlay extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Covers the content and blocks it. */
  @property({ type: Boolean, reflect: true }) loading = false

  /** What is announced when loading starts. Defaults to the `label` slot's text, then the translatable "Loading". */
  @property() label = ''

  @state() private labelText = ''

  @query('slot[name="label"]') private labelSlot?: HTMLSlotElement

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, loadingOverlayMessages)

  // A server-rendered element hydrates with its label already assigned, and no `slotchange` follows: read it once.
  protected override firstUpdated(): void {
    this.readLabel()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('loading')) this.internals.ariaBusy = this.loading ? 'true' : null
  }

  private readLabel() {
    const nodes = this.labelSlot?.assignedNodes({ flatten: true }) ?? []
    this.labelText = nodes
      .map((node) => node.textContent ?? '')
      .join(' ')
      .trim()
  }

  override render() {
    const announcement = this.label || this.labelText || this.msg.t('label')
    return html`
      <div class="content" ?inert=${this.loading}><slot></slot></div>
      <div class="scrim" part="scrim" ?hidden=${!this.loading}>
        <div class="indicator" part="indicator">
          <slot name="indicator"><c2-spinner class="spinner" aria-hidden="true"></c2-spinner></slot>
          <div class="label" part="label" ?hidden=${!this.labelText}><slot name="label" @slotchange=${this.readLabel}></slot></div>
        </div>
      </div>
      <div class="sr-only" role="status">${this.loading ? announcement : ''}</div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-loading-overlay': LoadingOverlay
  }
}
