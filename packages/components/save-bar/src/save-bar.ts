import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import '@c2n/button'
import { saveBarMessages } from './messages'
import styles from './save-bar.scss?inline'

/** Events fired by {@link SaveBar}, keyed for `addEventListener`. */
export interface SaveBarEventMap {
  save: Event
  discard: Event
}

export interface SaveBar {
  addEventListener: TypedAddEventListener<SaveBar, SaveBarEventMap>
  removeEventListener: TypedRemoveEventListener<SaveBar, SaveBarEventMap>
}

/**
 * A floating bar that appears while a form or a settings page has unsaved changes: "Unsaved changes", then Discard
 * and Save. Place it after the form, inside the same scroll container: it sticks to the bottom of that container and
 * floats over the content, taking no room in the layout. Leave some bottom padding on the form so the bar never
 * covers its last field.
 *
 * The app owns the changes. Set `open` while the form differs from what was saved; the bar slides in, and slides away
 * when `open` is cleared. Save fires `save` and Discard fires `discard`; neither changes `open` itself. While the app
 * saves, set `saving`: the Save button shows a spinner, both buttons stop responding and the message reads "Saving…".
 * Set `invalid` while the changes cannot be saved: the indicator turns to the error colour and Save is disabled.
 *
 * With `shortcut`, Ctrl+S (⌘S on a Mac) anywhere on the page fires `save` while the bar is open, instead of the
 * browser's "Save page". With `warn-on-leave`, the browser asks before the page is closed or reloaded while the bar is
 * open. The message is announced to screen readers as the bar shows and as saving starts. Hiding the bar takes its
 * buttons out of the Tab order, so after a save or a discard move focus back into the form.
 *
 * Extra actions (a Preview button, a link to the change history) go in the default slot, before Discard. Where the bar
 * is 480px wide or less (a phone), the message takes the top row and the buttons share a full-width row below.
 *
 * @tag c2-save-bar
 *
 * @slot default - Further actions, shown before Discard: `c2-button`s, a `c2-link-button`.
 * @slot message - Replaces the "Unsaved changes" / "Saving…" text, for example to say what changed or what to fix.
 *
 * @event {Event} save - The Save button was activated, or Ctrl+S / ⌘S was pressed with `shortcut`. Save the changes, then clear `open`. Does not bubble.
 * @event {Event} discard - The Discard button was activated. Restore the saved values, then clear `open`. Does not bubble.
 *
 * @cssproperty {string} [--c2-save-bar--position=sticky] - `sticky` follows the bottom of the scroll container; `fixed` pins the bar to the viewport.
 * @cssproperty {pixel} [--c2-save-bar--inset-bottom=16px] - Distance from the bottom edge.
 * @cssproperty {number} [--c2-save-bar--z-index=10]
 * @cssproperty {color} [--c2-save-bar__container--background=#ffffff]
 * @cssproperty {color} [--c2-save-bar__container--color=#18181b]
 * @cssproperty {border} [--c2-save-bar__container--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-save-bar__container--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-save-bar__container--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {padding} [--c2-save-bar__container--padding=6px 6px 6px 14px]
 * @cssproperty {pixel} [--c2-save-bar__container--gap=12px] - Space between the indicator, the message and the actions.
 * @cssproperty {width} [--c2-save-bar__container--width=max-content] - `100%` (with a `0` radius and inset) makes a full-width bar.
 * @cssproperty {pixel} [--c2-save-bar__container--max-width=calc(100% - 32px)]
 * @cssproperty {justify-content} [--c2-save-bar__container--justify-content=flex-start] - `space-between` pushes the actions to the far edge of a wide bar.
 * @cssproperty {pixel} [--c2-save-bar__container--offset=8px] - How far the bar slides as it shows and hides.
 * @cssproperty {time} [--c2-save-bar__container--transition-duration=150ms]
 * @cssproperty {pixel} [--c2-save-bar__indicator--size=8px] - The dot before the message; `0` hides it.
 * @cssproperty {color} [--c2-save-bar__indicator--background=#d97706]
 * @cssproperty {box-shadow} [--c2-save-bar__indicator--box-shadow=0 0 0 3px rgba(217, 119, 6, 0.18)]
 * @cssproperty {color} [--c2-save-bar__indicator__invalid--background=#dc2626]
 * @cssproperty {box-shadow} [--c2-save-bar__indicator__invalid--box-shadow=0 0 0 3px rgba(220, 38, 38, 0.18)]
 * @cssproperty {font-size} [--c2-save-bar__message--font-size=14px]
 * @cssproperty {font-weight} [--c2-save-bar__message--font-weight=500]
 * @cssproperty {color} [--c2-save-bar__message--color=#18181b]
 * @cssproperty {pixel} [--c2-save-bar__actions--gap=8px]
 * @cssproperty {pixel} [--c2-save-bar__button--height=32px] - Height of the Discard and Save buttons.
 * @cssproperty {border-radius} [--c2-save-bar__button--border-radius=6px]
 * @cssproperty {color} [--c2-save-bar__discard--background-color=transparent]
 * @cssproperty {color} [--c2-save-bar__discard--color=#18181b]
 * @cssproperty {border} [--c2-save-bar__discard--border=1px solid #d4d4d8]
 * @cssproperty {color} [--c2-save-bar__discard__hover--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-save-bar__save--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-save-bar__save--color=#ffffff]
 * @cssproperty {color} [--c2-save-bar__save__hover--background-color=rgb(1, 84, 184)]
 */
@customElement('c2-save-bar')
export class SaveBar extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, saveBarMessages)

  constructor() {
    super()
    this.internals.role = 'group'
  }

  /** Shows the bar. Set it while there are unsaved changes and clear it once they are saved or discarded. */
  @property({ type: Boolean }) open = false

  /** The changes are being saved: Save shows a spinner, both buttons stop responding and the message reads "Saving…". */
  @property({ type: Boolean }) saving = false

  /** The changes cannot be saved as they are: Save is disabled and the indicator turns to the error colour. */
  @property({ type: Boolean }) invalid = false

  /** Ctrl+S (⌘S on a Mac) fires `save` while the bar is open, instead of the browser's "Save page". */
  @property({ type: Boolean }) shortcut = false

  /** Asks before the page is closed or reloaded while the bar is open. */
  @property({ type: Boolean, attribute: 'warn-on-leave' }) warnOnLeave = false

  /** The Save button's text. Empty uses the built-in "Save" in the page's language. */
  @property({ attribute: 'save-label' }) saveLabel = ''

  /** The Discard button's text. Empty uses the built-in "Discard" in the page's language. */
  @property({ attribute: 'discard-label' }) discardLabel = ''

  @query('.bar') private barElement?: HTMLElement

  /** Whether the bar was open at the last update: it slides only when that changes, never on the first render. */
  private wasOpen?: boolean

  /** Fires `save`, as the Save button does, unless the bar is closed, saving or invalid. */
  save(): void {
    if (!this.open || this.saving || this.invalid) return
    this.dispatchEvent(new Event('save'))
  }

  /** Fires `discard`, as the Discard button does, unless the bar is closed or saving. */
  discard(): void {
    if (!this.open || this.saving) return
    this.dispatchEvent(new Event('discard'))
  }

  override connectedCallback() {
    super.connectedCallback()
    document.addEventListener('keydown', this.handleKeydown)
    window.addEventListener('beforeunload', this.handleBeforeUnload)
  }

  override disconnectedCallback() {
    document.removeEventListener('keydown', this.handleKeydown)
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
    super.disconnectedCallback()
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if (!this.shortcut || !this.open || event.defaultPrevented) return
    if (event.key.toLowerCase() !== 's' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
    // Keep the browser's "Save page" dialog away even while the save itself cannot run (saving, invalid).
    event.preventDefault()
    this.save()
  }

  private handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.warnOnLeave || !this.open) return
    event.preventDefault()
    // Older browsers only ask when `returnValue` is set.
    event.returnValue = ''
  }

  protected override updated(changed: PropertyValues<this>): void {
    this.internals.ariaLabel = this.msg.t('bar')
    if (changed.has('open')) {
      if (this.open) this.internals.states.add('open')
      else this.internals.states.delete('open')
      if (this.wasOpen !== undefined && this.open !== this.wasOpen) this.slide(this.open)
      this.wasOpen = this.open
    }
    if (this.invalid) this.internals.states.add('invalid')
    else this.internals.states.delete('invalid')
  }

  /**
   * Slides the bar up into place as it shows, and down as it hides, while it fades (a CSS transition). An animation
   * rather than a transition, so the closed bar rests in place: only while it moves does it reach below its spot.
   */
  private slide(open: boolean): void {
    const bar = this.barElement
    if (!bar?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const style = getComputedStyle(bar)
    const offset = style.getPropertyValue('--_offset').trim() || '0px'
    const duration = milliseconds(style.getPropertyValue('--_duration'))
    if (!(duration > 0) || parseFloat(offset) === 0) return
    const down = `-50% ${offset}`
    const rest = '-50% 0'
    bar.animate({ translate: open ? [down, rest] : [rest, down] }, { duration, easing: 'ease' })
  }

  override render() {
    const message = this.msg.t(this.saving ? 'saving' : 'unsaved')
    // The live region sits outside the bar: the bar is `visibility: hidden` while closed, and a region that enters the
    // accessibility tree together with its first text is often not announced. It says nothing while closed.
    return html`<span class="announcer" role="status">${this.open ? message : ''}</span>
      <div class="bar">
        <span class="status">
          <span class="indicator" aria-hidden="true"></span>
          <span class="message"><slot name="message">${message}</slot></span>
        </span>
        <div class="actions">
          <slot></slot>
          <c2-button class="discard" ?disabled=${this.saving} @click=${this.discard}>${this.discardLabel || this.msg.t('discard')}</c2-button>
          <c2-button class="save" ?disabled=${this.invalid} ?running=${this.saving} @click=${this.save}>${this.saveLabel || this.msg.t('save')}</c2-button>
        </div>
      </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-save-bar': SaveBar
  }
}

/** A CSS time (`150ms`, `0.2s`) in milliseconds; NaN for anything else. */
function milliseconds(time: string): number {
  const value = parseFloat(time)
  return time.trim().endsWith('ms') ? value : value * 1000
}
