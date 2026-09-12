import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { isServer } from 'lit-html/is-server.js'
import { customElement, property, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { lockPageScroll, redispatchEvent } from '@c2n/core/dom-helper.js'
import styles from './sheet.scss?inline'

export type SheetSide = 'right' | 'left' | 'top' | 'bottom'

/**
 * Dialog pinned to an edge of the screen, for content that complements the page rather than interrupting it: filters,
 * details, a form beside the record it edits. Built on the native `<dialog>` like `c2-modal`, so focus is trapped and
 * restored, the page behind is inert and covered by a backdrop, and Escape closes — but the panel spans its edge and
 * slides in from it instead of being centred.
 *
 * `side` picks the edge (`right` by default). `--c2-sheet--size` is the width of a left/right sheet and the height of
 * a top/bottom one; the opposite axis always fills the screen. Open it with the `open` attribute or `show()`, close it
 * with `close(returnValue)`, the built-in close button, a click on the backdrop or Escape (each can be turned off).
 * Content is split into a `title` slot, the body (default slot) and a `footer` slot for actions, and the body scrolls
 * on its own so the header and footer stay put in a full-height panel.
 *
 * Use `c2-modal` for a decision that blocks the page, and `c2-side-nav` for navigation that is part of the layout
 * rather than a transient overlay.
 *
 * @tag c2-sheet
 *
 * @slot - Body content.
 * @slot title - Heading shown in the header; the sheet is labelled by it.
 * @slot footer - Actions row (a flex row, see the `footer--*` variables).
 * @slot close-icon - Replaces the default × icon of the close button.
 *
 * @event {Event} open - Fired after the sheet has been shown.
 * @event {CustomEvent<{ returnValue: string }>} close - Fired after the sheet has closed; `detail.returnValue` is what `close()` received (`''` for Escape / backdrop / the × button).
 * @event {Event} cancel - Native, cancelable: fired on Escape before closing.
 *
 * @cssproperty {pixel} [--c2-sheet--size=380px] - Width of a `left`/`right` sheet, height of a `top`/`bottom` one. The other axis fills the screen.
 * @cssproperty {background} [--c2-sheet--background=#ffffff]
 * @cssproperty {color} [--c2-sheet--color=#18181b]
 * @cssproperty {border} [--c2-sheet--border=none]
 * @cssproperty {border-radius} [--c2-sheet--border-radius=0px] - Rounds the two corners facing the page; the edge stays square.
 * @cssproperty {box-shadow} [--c2-sheet--box-shadow=0 24px 60px rgba(0, 0, 0, 0.25)]
 * @cssproperty {time} [--c2-sheet--transition-duration=280ms] - Slide in and out; `0ms` disables it.
 *
 * @cssproperty {padding} [--c2-sheet__header--padding-top=20px]
 * @cssproperty {padding} [--c2-sheet__header--padding-right=20px]
 * @cssproperty {padding} [--c2-sheet__header--padding-bottom=0px]
 * @cssproperty {padding} [--c2-sheet__header--padding-left=24px]
 * @cssproperty {font-size} [--c2-sheet__header--font-size=17px]
 * @cssproperty {font-weight} [--c2-sheet__header--font-weight=600]
 * @cssproperty {line-height} [--c2-sheet__header--line-height=1.35]
 * @cssproperty {border} --c2-sheet__header--border-bottom - Divider under the header; raise `header--padding-bottom` with it.
 *
 * @cssproperty {padding} [--c2-sheet__body--padding-top=12px]
 * @cssproperty {padding} [--c2-sheet__body--padding-right=24px]
 * @cssproperty {padding} [--c2-sheet__body--padding-bottom=20px]
 * @cssproperty {padding} [--c2-sheet__body--padding-left=24px]
 * @cssproperty {font-size} [--c2-sheet__body--font-size=14px]
 * @cssproperty {line-height} [--c2-sheet__body--line-height=1.6]
 * @cssproperty {color} --c2-sheet__body--color - Defaults to the sheet colour.
 *
 * @cssproperty {padding} [--c2-sheet__footer--padding-top=12px]
 * @cssproperty {padding} [--c2-sheet__footer--padding-right=24px]
 * @cssproperty {padding} [--c2-sheet__footer--padding-bottom=20px]
 * @cssproperty {padding} [--c2-sheet__footer--padding-left=24px]
 * @cssproperty {pixel} [--c2-sheet__footer--gap=8px]
 * @cssproperty {justify-content} [--c2-sheet__footer--justify-content=flex-end]
 * @cssproperty {border} --c2-sheet__footer--border-top - Divider above the footer; raise `footer--padding-top` with it.
 *
 * @cssproperty {pixel} [--c2-sheet__close--size=32px]
 * @cssproperty {pixel} [--c2-sheet__close--icon-size=18px]
 * @cssproperty {border-radius} [--c2-sheet__close--border-radius=8px]
 * @cssproperty {color} [--c2-sheet__close--color=#71717a]
 * @cssproperty {background} [--c2-sheet__close__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-sheet__close__hover--color=#18181b]
 * @cssproperty {outline} [--c2-sheet__close__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 *
 * @cssproperty {background} [--c2-sheet__backdrop--background=rgba(9, 9, 11, 0.45)]
 * @cssproperty {backdrop-filter} --c2-sheet__backdrop--backdrop-filter - e.g. `blur(4px)`.
 */
@customElement('c2-sheet')
export class Sheet extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Open state. Setting it shows or closes the sheet. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Edge the sheet is pinned to and slides in from. */
  @property({ reflect: true }) side: SheetSide = 'right'

  /** Accessible name when there is no `title` slot. */
  @property() label: string | undefined = undefined

  /** Keep the sheet open when the backdrop is clicked. */
  @property({ type: Boolean, attribute: 'no-backdrop-close' }) noBackdropClose = false

  /** Ignore Escape. */
  @property({ type: Boolean, attribute: 'no-escape' }) noEscape = false

  /** Hide the built-in × button. */
  @property({ type: Boolean, reflect: true, attribute: 'hide-close' }) hideClose = false

  /** Leave the page scrollable while the sheet is open. */
  @property({ type: Boolean, attribute: 'no-scroll-lock' }) noScrollLock = false

  /** Value passed to the last `close()` call, mirrors `HTMLDialogElement.returnValue`. */
  returnValue = ''

  @state() private hasTitle = false
  @state() private hasFooter = false

  @query('dialog') private dialog!: HTMLDialogElement

  private releaseScroll: (() => void) | undefined

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unlockScroll()
  }

  /** Opens the sheet (modal). */
  show() {
    this.open = true
  }

  /** Closes the sheet with an optional `returnValue`. */
  close(returnValue = '') {
    this.returnValue = returnValue
    if (this.dialog?.open) this.dialog.close(returnValue)
    else this.open = false
  }

  private lockScroll() {
    if (this.noScrollLock || this.releaseScroll || isServer) return
    this.releaseScroll = lockPageScroll()
  }

  private unlockScroll() {
    this.releaseScroll?.()
    this.releaseScroll = undefined
  }

  private handleDialogClose = (event: Event) => {
    // A nested overlay's `close` is composed, so it reaches this listener through the slot; only our own dialog counts.
    if (event.target !== this.dialog) return
    this.returnValue = this.dialog.returnValue
    this.unlockScroll()
    this.open = false
    this.dispatchEvent(new CustomEvent('close', { detail: { returnValue: this.returnValue }, bubbles: true, composed: true }))
  }

  private handleDialogCancel = (event: Event) => {
    if (event.target !== this.dialog) return
    if (this.noEscape) {
      event.preventDefault()
      return
    }
    if (!redispatchEvent(this, event)) event.preventDefault()
  }

  private handleDialogClick = (event: MouseEvent) => {
    // Clicks on the ::backdrop are delivered to the <dialog> itself; anything inside targets the panel or its children.
    if (event.target === this.dialog && !this.noBackdropClose) this.close()
  }

  private handleSlotChange(event: Event) {
    this.updateSlot(event.target as HTMLSlotElement)
  }

  private updateSlot(slot: HTMLSlotElement) {
    const filled = slot.assignedNodes({ flatten: true }).some((n) => n.nodeType === Node.ELEMENT_NODE || (n.textContent ?? '').trim() !== '')
    if (slot.name === 'title') this.hasTitle = filled
    else if (slot.name === 'footer') this.hasFooter = filled
  }

  override firstUpdated() {
    for (const slot of this.renderRoot.querySelectorAll('slot')) this.updateSlot(slot)
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('open') && !isServer && this.dialog) {
      if (this.open && !this.dialog.open) {
        this.dialog.showModal()
        this.lockScroll()
        this.dispatchEvent(new Event('open', { bubbles: true, composed: true }))
      } else if (!this.open && this.dialog.open) {
        this.dialog.close(this.returnValue)
      }
    }
  }

  override render() {
    return html`
      <dialog
        class="c2-sheet"
        part="panel"
        aria-labelledby=${this.hasTitle ? 'title' : nothing}
        aria-label=${!this.hasTitle && this.label ? this.label : nothing}
        @close=${this.handleDialogClose}
        @cancel=${this.handleDialogCancel}
        @click=${this.handleDialogClick}
      >
        <div class=${classMap({ 'c2-sheet__panel': true, 'has-title': this.hasTitle, 'has-footer': this.hasFooter })}>
          <header class="c2-sheet__header" part="header" ?hidden=${!this.hasTitle && this.hideClose}>
            <div class="c2-sheet__title" id="title"><slot name="title" @slotchange=${this.handleSlotChange}></slot></div>
            ${
              this.hideClose
                ? nothing
                : html`<button class="c2-sheet__close" part="close" type="button" aria-label="Close" @click=${() => this.close()}>
                    <slot name="close-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 6 6 18M6 6l12 12"></path>
                      </svg>
                    </slot>
                  </button>`
            }
          </header>
          <div class="c2-sheet__body" part="body"><slot></slot></div>
          <footer class="c2-sheet__footer" part="footer" ?hidden=${!this.hasFooter}>
            <slot name="footer" @slotchange=${this.handleSlotChange}></slot>
          </footer>
        </div>
      </dialog>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-sheet': Sheet
  }
}
