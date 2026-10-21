import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { actionBarMessages } from './messages'
import styles from './action-bar.scss?inline'

/** Events fired by {@link ActionBar}, keyed for `addEventListener`. */
export interface ActionBarEventMap {
  clear: Event
}

export interface ActionBar {
  addEventListener: TypedAddEventListener<ActionBar, ActionBarEventMap>
  removeEventListener: TypedRemoveEventListener<ActionBar, ActionBarEventMap>
}

/**
 * A floating bar for what to do with the current selection: "3 selected", the bulk actions, and a button that clears
 * the selection. Place it after the collection it acts on (a `c2-table`, a `c2-list`, a grid of cards), inside the same
 * scroll container: it sticks to the bottom of that container and floats over the content, taking no room in the
 * layout. Leave some bottom padding on the collection so the bar never covers its last row.
 *
 * The app owns the selection. Set `count` from it: the bar shows while `count` is above zero and slides away at zero.
 * The clear button and Escape fire `clear`; empty the selection there, which sets `count` back to 0. Escape that a
 * popup inside the bar uses (an open `c2-select` or menu) does not clear: the bar skips an Escape inside an open
 * popover or one whose `keydown` was `preventDefault()`ed. The count is announced to screen readers ("3 selected") as
 * it changes, in the built-in wording even when the `label` slot replaces the visible text. Hiding the bar takes its actions out
 * of the Tab order, so an action that empties the selection should move focus back to the collection.
 *
 * Put the actions in the default slot: `c2-button`s, a `c2-button-group toolbar` for one Tab stop with arrow keys,
 * or a menu of further actions.
 *
 * @tag c2-action-bar
 *
 * @slot default - The actions: `c2-button`, `c2-icon-button`, a `c2-button-group`, a `c2-select`.
 * @slot label - Replaces the "N selected" text, for example to name what is selected ("3 orders selected").
 * @slot clear-icon - Replaces the clear button's × icon.
 *
 * @event {Event} clear - The clear button was activated or Escape was pressed in the bar. Empty the selection in response; the bar does not change `count` itself. Does not bubble.
 *
 * @cssproperty {string} [--c2-action-bar--position=sticky] - `sticky` follows the bottom of the scroll container; `fixed` pins the bar to the viewport.
 * @cssproperty {pixel} [--c2-action-bar--inset-bottom=16px] - Distance from the bottom edge.
 * @cssproperty {number} [--c2-action-bar--z-index=10]
 * @cssproperty {color} [--c2-action-bar__container--background=#ffffff]
 * @cssproperty {color} [--c2-action-bar__container--color=#18181b]
 * @cssproperty {border} [--c2-action-bar__container--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-action-bar__container--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-action-bar__container--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {padding} [--c2-action-bar__container--padding=6px 6px 6px 16px]
 * @cssproperty {pixel} [--c2-action-bar__container--gap=12px] - Space between the count, the divider, the actions and the clear button.
 * @cssproperty {pixel} [--c2-action-bar__container--max-width=calc(100% - 32px)] - Past this width the actions scroll sideways (or wrap, with `--c2-action-bar__actions--flex-wrap: wrap`).
 * @cssproperty {pixel} [--c2-action-bar__container--offset=8px] - How far the bar slides as it shows and hides.
 * @cssproperty {time} [--c2-action-bar__container--transition-duration=150ms]
 * @cssproperty {font-size} [--c2-action-bar__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-action-bar__label--font-weight=500]
 * @cssproperty {color} [--c2-action-bar__label--color=#18181b]
 * @cssproperty {border} [--c2-action-bar__divider--border-left=1px solid #e4e4e7] - The rule between the count and the actions; `none` removes it.
 * @cssproperty {pixel} [--c2-action-bar__divider--height=20px]
 * @cssproperty {pixel} [--c2-action-bar__actions--gap=8px]
 * @cssproperty {string} [--c2-action-bar__actions--flex-wrap=nowrap] - `nowrap` keeps the actions on one line, scrolling sideways when the bar is narrower than they are; `wrap` stacks them onto further lines instead.
 * @cssproperty {pixel} [--c2-action-bar__clear--size=28px]
 * @cssproperty {border-radius} [--c2-action-bar__clear--border-radius=6px]
 * @cssproperty {color} [--c2-action-bar__clear--color=#71717a]
 * @cssproperty {color} [--c2-action-bar__clear__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-action-bar__clear__hover--color=#18181b]
 * @cssproperty {outline} [--c2-action-bar__clear__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-action-bar__clear-icon--size=16px]
 */
@customElement('c2-action-bar')
export class ActionBar extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, actionBarMessages)

  constructor() {
    super()
    this.internals.role = 'group'
  }

  /** How many items are selected. The bar shows while it is above zero. */
  @property({ type: Number }) count = 0

  /**
   * The count the label shows. It keeps the last non-zero count while the bar fades out, so the label does not read
   * "0 selected" on the way out, and so the live region has nothing new to announce.
   */
  private shownCount = 0

  /** Fires `clear`, as the clear button and Escape do. */
  clear(): void {
    this.dispatchEvent(new Event('clear'))
  }

  override connectedCallback() {
    super.connectedCallback()
    this.addEventListener('keydown', this.handleKeydown)
  }

  override disconnectedCallback() {
    this.removeEventListener('keydown', this.handleKeydown)
    super.disconnectedCallback()
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented || this.count <= 0) return
    // Escape in an open menu or select inside the bar closes that popup; it does not clear the selection.
    if (event.composedPath().some((node) => node instanceof Element && node.matches(':popover-open'))) return
    this.clear()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('count') && this.count > 0) this.shownCount = this.count
  }

  protected override updated(): void {
    this.internals.ariaLabel = this.msg.t('actions')
    if (this.count > 0) this.internals.states.add('open')
    else this.internals.states.delete('open')
  }

  override render() {
    // The live region sits outside the bar: the bar is `visibility: hidden` while closed, and a region that enters
    // the accessibility tree together with its first text is often not announced. It says the count even when the
    // `label` slot replaces the visible text, and nothing at zero.
    return html`<span class="announcer" role="status">${this.count > 0 ? this.msg.t('selected', this.count) : ''}</span>
      <div class="bar">
        <span class="label"><slot name="label">${this.msg.t('selected', this.shownCount)}</slot></span>
        <span class="divider" aria-hidden="true"></span>
        <div class="actions"><slot></slot></div>
        <button type="button" class="clear" aria-label=${this.msg.t('clear')} @click=${this.clear}>
          <slot name="clear-icon"
            ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="m6 6 12 12M6 18 18 6"></path></svg
          ></slot>
        </button>
      </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-action-bar': ActionBar
  }
}
