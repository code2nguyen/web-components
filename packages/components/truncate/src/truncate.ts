import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './truncate.scss?inline'

/** Events fired by {@link Truncate}, keyed for `addEventListener`. */
export interface TruncateEventMap {
  toggle: ToggleEvent
  'truncation-change': CustomEvent<boolean>
}

export interface Truncate {
  addEventListener: TypedAddEventListener<Truncate, TruncateEventMap>
  removeEventListener: TypedRemoveEventListener<Truncate, TruncateEventMap>
}

/**
 * Clamps its text to a number of lines and ends it with an ellipsis. The line count is the CSS variable
 * `--c2-truncate__content--line-clamp` (3 by default, `1` for a single line), so it can change per breakpoint.
 *
 * The element measures whether the text actually overflows, and `expandable` then adds a "Show more" / "Show less"
 * button. Text that fits is left alone. The full text always stays in the accessibility tree; only its rendering is
 * clamped. Whether it is clamped right now is the `truncated` property, the `truncation-change` event and the custom
 * state `c2-truncate:state(truncated)`.
 *
 * @tag c2-truncate
 *
 * @slot - Text to truncate.
 *
 * @event {ToggleEvent} toggle - Fired after `expanded` changes from the button (`newState` is `open` or `closed`).
 * @event {CustomEvent<boolean>} truncation-change - Fired when the text starts or stops overflowing its clamp; `detail` is the new `truncated` value.
 *
 * @csspart content - The clamped text container wrapping the default slot; the clamp applies to the text assigned to it.
 * @csspart toggle - The "Show more" / "Show less" button, rendered when `expandable` is set and the text overflows.
 *
 * @cssproperty {number} [--c2-truncate__content--line-clamp=3] - Number of visible lines while collapsed.
 * @cssproperty {color} [--c2-truncate__content--color=inherit]
 * @cssproperty {pixel} [--c2-truncate__content--font-size=inherit]
 * @cssproperty {line-height} [--c2-truncate__content--line-height=inherit]
 *
 * @cssproperty {pixel} [--c2-truncate__toggle--margin-top=4px]
 * @cssproperty {padding} [--c2-truncate__toggle--padding=0]
 * @cssproperty {color} [--c2-truncate__toggle--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-truncate__toggle--background-color=transparent]
 * @cssproperty {pixel} [--c2-truncate__toggle--font-size=14px]
 * @cssproperty {font-weight} [--c2-truncate__toggle--font-weight=500]
 * @cssproperty {border-radius} [--c2-truncate__toggle--border-radius=4px]
 * @cssproperty {text-decoration} [--c2-truncate__toggle--text-decoration=none]
 * @cssproperty {color} --c2-truncate__toggle__hover--color
 * @cssproperty {text-decoration} [--c2-truncate__toggle__hover--text-decoration=underline]
 * @cssproperty {outline} [--c2-truncate__toggle__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-truncate__toggle__focus--outline-offset=2px]
 */
@customElement('c2-truncate')
export class Truncate extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()

  /** Adds a "Show more" / "Show less" button when the text overflows its clamp. */
  @property({ type: Boolean, reflect: true }) expandable = false

  /** Shows the whole text. The button sets it; set it yourself to open or close the text programmatically. */
  @property({ type: Boolean, reflect: true }) expanded = false

  /** Label of the button while collapsed. */
  @property({ attribute: 'more-label' }) moreLabel = 'Show more'

  /** Label of the button while expanded. */
  @property({ attribute: 'less-label' }) lessLabel = 'Show less'

  @state() private overflowing = false

  @query('.c2-truncate__content') private content?: HTMLElement

  private resizeObserver?: ResizeObserver
  private mutationObserver?: MutationObserver
  private frame = 0

  /** Whether the text overflows its clamp, i.e. there is more to show than the collapsed lines. Read-only. */
  get truncated(): boolean {
    return this.overflowing
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (isServer) return
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure())
      this.resizeObserver.observe(this)
    }
    this.mutationObserver = new MutationObserver(() => this.scheduleMeasure())
    this.mutationObserver.observe(this, { childList: true, characterData: true, subtree: true })
    this.scheduleMeasure()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    this.mutationObserver?.disconnect()
    this.resizeObserver = this.mutationObserver = undefined
    cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    if (changed.has('overflowing')) {
      if (this.overflowing) this.internals.states.add('truncated')
      else this.internals.states.delete('truncated')
    }
    if (changed.has('expanded')) this.scheduleMeasure()
  }

  private scheduleMeasure(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.measure()
    })
  }

  /**
   * The clamp hides the overflow, so overflowing text has a scroll height taller than its box. While expanded the clamp
   * is put back for the duration of the read: both class changes happen before the next paint, so nothing flickers.
   */
  private measure(): void {
    const content = this.content
    if (!content) return
    content.classList.add('is-measuring')
    const overflowing = content.scrollHeight - content.clientHeight > 1 || content.scrollWidth - content.clientWidth > 1
    content.classList.remove('is-measuring')
    if (overflowing === this.overflowing) return
    this.overflowing = overflowing
    this.dispatchEvent(new CustomEvent('truncation-change', { detail: overflowing }))
  }

  private handleToggle(): void {
    const oldState = this.expanded ? 'open' : 'closed'
    this.expanded = !this.expanded
    const newState = this.expanded ? 'open' : 'closed'
    this.dispatchEvent(new ToggleEvent('toggle', { oldState, newState }))
  }

  // The content id is a literal: ids are scoped to the shadow root, and a per-instance counter would differ between a
  // server render and the client, which keeps the server's id on hydration and leaves `aria-controls` dangling.
  override render() {
    return html`<div id="content" class="c2-truncate__content" part="content" @slotchange=${this.scheduleMeasure}>
        <slot></slot>
      </div>
      ${
        this.expandable && this.overflowing
          ? html`<button
              class="c2-truncate__toggle"
              part="toggle"
              type="button"
              aria-expanded=${this.expanded ? 'true' : 'false'}
              aria-controls="content"
              @click=${this.handleToggle}
            >
              ${this.expanded ? this.lessLabel : this.moreLabel}
            </button>`
          : nothing
      }`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-truncate': Truncate
  }
}
