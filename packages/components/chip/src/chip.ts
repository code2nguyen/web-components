import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import styles from './chip.scss?inline'
import './chip-part.js'

export { ChipPart } from './chip-part.js'
export type { ChipPartClickDetail, ChipPartEventMap, ChipPartPopup } from './chip-part.js'

/** Events fired by {@link Chip}, keyed for `addEventListener`. */
export interface ChipEventMap {
  change: Event
  remove: CustomEvent<ChipRemoveDetail>
}

export interface ChipRemoveDetail {
  /** The chip's `value`, or its text when no value is set. */
  value: string
}

export interface Chip {
  addEventListener: TypedAddEventListener<Chip, ChipEventMap>
  removeEventListener: TypedRemoveEventListener<Chip, ChipEventMap>
}

/** Text of the default slot only: an icon's text in a named slot is not part of the label, nor is a part's prefix. */
function labelText(parent: Node): string {
  return (
    [...parent.childNodes]
      // Comments are skipped: a framework's markers (Lit's `<!--?lit$…$-->`) are not label text.
      .filter((node) => node.nodeType === Node.TEXT_NODE || (node instanceof Element && !node.hasAttribute('slot')))
      .map((node) => (node instanceof Element && node.localName === 'c2-chip-part' ? ` ${labelText(node)} ` : (node.textContent ?? '')))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * Compact pill for a filter, a choice or an entered value: the chip of Material, Mantine and antd. A plain chip is a
 * read-only label. `selectable` turns it into a toggle button (`aria-pressed`) that flips `selected` on click, Enter
 * or Space and fires `change`, with a check mark while selected. `removable` adds a remove button that fires
 * `remove`; Backspace or Delete on a selectable chip does the same. The chip never removes itself: the application
 * drops it from its own list in the `remove` handler, so framework-rendered lists stay in sync. `c2-badge` stays the
 * non-interactive status label; use a chip when people pick or dismiss it.
 *
 * A chip can also read as a sentence made of `c2-chip-part` children (`Status | is any of | Active`), each of which can
 * be its own button: that is the filter chip of Linear and Airtable. Left and Right arrows then move between the
 * interactive parts and the remove button, and Backspace or Delete on a part fires `remove`. Importing the chip
 * registers `c2-chip-part` too. A chip with parts is never a toggle, even with `selectable`.
 *
 * ```html
 * <c2-chip removable>
 *   <c2-chip-part name="field">Status</c2-chip-part>
 *   <c2-chip-part name="operator" interactive>is any of</c2-chip-part>
 *   <c2-chip-part name="value" interactive>Active, Paused</c2-chip-part>
 * </c2-chip>
 * ```
 *
 * @tag c2-chip
 *
 * @slot - Chip label, or two or more `c2-chip-part` segments.
 * @slot prefix - Icon or avatar shown before the label.
 * @slot selected-icon - Mark shown before the label while a selectable chip is selected. Defaults to a check mark.
 * @slot remove-icon - Icon of the remove button. Defaults to a cross.
 *
 * @event change - A selectable chip was toggled by the user. Read `selected` on the target.
 * @event remove - The remove button, Backspace or Delete was used. `detail.value` is the chip's `value` (or its text). Remove the chip in the handler.
 *
 * @csspart chip - The visible pill around the label and the remove button.
 * @csspart action - The toggle `<button>` of a selectable chip, or the label wrapper of a plain one. It contains the default slot (the label) along with the prefix and the selected mark.
 * @csspart remove-button - The remove `<button>`. It wraps the remove-icon slot, whose cross fallback is replaced by any assigned icon.
 *
 * @cssproperty {pixel} [--c2-chip__container--height=28px]
 * @cssproperty {padding} [--c2-chip__container--padding-left=10px]
 * @cssproperty {padding} [--c2-chip__container--padding-right=10px]
 * @cssproperty {pixel} [--c2-chip__container--gap=6px] - Space between the icon, the label and the remove button.
 * @cssproperty {border-radius} [--c2-chip__container--border-radius=999px]
 * @cssproperty {border} [--c2-chip__container--border=1px solid #bcbcc6]
 * @cssproperty {color} [--c2-chip__container--background-color=#ffffff]
 * @cssproperty {color} [--c2-chip__container--color=#18181b]
 * @cssproperty {font-family} [--c2-chip__container--font-family=inherit]
 * @cssproperty {pixel} [--c2-chip__container--font-size=14px]
 * @cssproperty {font-weight} [--c2-chip__container--font-weight=500]
 *
 * @cssproperty {border} [--c2-chip__container__hover--border=1px solid #a1a1aa] - Hover border of a selectable chip.
 * @cssproperty {color} [--c2-chip__container__hover--background-color=#f4f4f5] - Hover background of a selectable chip.
 *
 * @cssproperty {border} [--c2-chip__container__selected--border=1px solid transparent]
 * @cssproperty {color} [--c2-chip__container__selected--background-color=#edf1fe]
 * @cssproperty {color} [--c2-chip__container__selected--color=#0265dc]
 * @cssproperty {color} --c2-chip__container__selected__hover--background-color - Hover background of a selected chip. Defaults to the selected background.
 *
 * @cssproperty {outline} [--c2-chip__container__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-chip__container__focus--outline-offset=2px]
 *
 * @cssproperty {opacity} [--c2-chip__container__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-chip__icon--size=16px] - Size of the `prefix` and `selected-icon` content.
 * @cssproperty {color} --c2-chip__icon--color - Colour of the `prefix` and `selected-icon` content. Defaults to the text colour.
 * @cssproperty {display} [--c2-chip__selected-icon--display=inline-flex] - `none` hides the check mark and relies on the colours alone.
 *
 * @cssproperty {pixel} [--c2-chip__remove-button--size=18px]
 * @cssproperty {pixel} [--c2-chip__remove-button--margin-right=-4px] - Pulls the remove button towards the edge so the padding looks even.
 * @cssproperty {border-radius} [--c2-chip__remove-button--border-radius=999px]
 * @cssproperty {color} [--c2-chip__remove-button--color=#71717a]
 * @cssproperty {color} [--c2-chip__remove-button__hover--background-color=rgba(24, 24, 27, 0.08)]
 * @cssproperty {color} [--c2-chip__remove-button__hover--color=#18181b]
 */
@customElement('c2-chip')
export class Chip extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  /** Makes the chip a toggle button that flips `selected` and fires `change`. */
  @property({ type: Boolean, reflect: true }) selectable = false

  /** Selected state of a selectable chip. Ignored by a plain chip. */
  @property({ type: Boolean, reflect: true }) selected = false

  /** Adds a remove button. Its click, or Backspace/Delete on a selectable chip, fires `remove`. */
  @property({ type: Boolean, reflect: true }) removable = false

  /** Disables toggling and removal, and dims the chip. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Stable identity of the chip, handed back in the `remove` event. Defaults to the chip's text. */
  @property() value = ''

  /** Accessible name of the remove button, followed by the chip's text: `Remove Design`. */
  @property({ attribute: 'remove-label' }) removeLabel = 'Remove'

  @state() private text = ''

  /** Whether the default slot holds `c2-chip-part` segments. */
  @state() private hasParts = false

  private readonly slotPresence = new SlotPresenceController(this, ['prefix'])

  // A framework that patches the text of an existing label node fires no slotchange, so watch the light DOM.
  private labelObserver?: MutationObserver

  override connectedCallback() {
    super.connectedCallback()
    this.text = this.readText()
    this.hasParts = this.readHasParts()
    this.labelObserver ??= new MutationObserver(() => {
      this.text = this.readText()
      this.hasParts = this.readHasParts()
    })
    this.labelObserver.observe(this, { childList: true, characterData: true, subtree: true })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.labelObserver?.disconnect()
  }

  private readText(): string {
    return labelText(this)
  }

  private readHasParts(): boolean {
    return [...this.children].some((child) => child.localName === 'c2-chip-part' && !child.hasAttribute('slot'))
  }

  private handleSlotChange = () => {
    this.text = this.readText()
    this.hasParts = this.readHasParts()
  }

  /** The interactive parts and the remove button, in visual order: the stops of the arrow keys. */
  private focusStops(): HTMLElement[] {
    const parts = [...this.querySelectorAll<HTMLElementTagNameMap['c2-chip-part']>(':scope > c2-chip-part[interactive]:not([disabled])')]
    const remove = this.renderRoot.querySelector<HTMLButtonElement>('.remove:not(:disabled)')
    return remove ? [...parts, remove] : parts
  }

  private handlePartKeyDown = (event: KeyboardEvent) => {
    if (!this.hasParts || this.disabled) return
    const stops = this.focusStops()
    const active = this.shadowRoot?.activeElement?.classList.contains('remove')
      ? this.shadowRoot.activeElement
      : (event.target as Element).closest('c2-chip-part')
    const index = stops.indexOf(active as HTMLElement)
    if (index < 0) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const next = stops[index + (event.key === 'ArrowRight' ? 1 : -1)]
      if (!next) return
      event.preventDefault()
      next.focus()
    } else if ((event.key === 'Backspace' || event.key === 'Delete') && this.removable && stops[index].localName === 'c2-chip-part') {
      event.preventDefault()
      this.requestRemove()
    }
  }

  private handleToggle = () => {
    if (this.disabled) return
    this.selected = !this.selected
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private handleActionKeyDown = (event: KeyboardEvent) => {
    if (!this.removable || this.disabled) return
    if (event.key !== 'Backspace' && event.key !== 'Delete') return
    event.preventDefault()
    this.requestRemove()
  }

  private handleRemove = (event: Event) => {
    // Keep a click on the cross from also reaching a listener that toggles or opens the chip.
    event.stopPropagation()
    if (this.disabled) return
    this.requestRemove()
  }

  private requestRemove() {
    this.dispatchEvent(new CustomEvent<ChipRemoveDetail>('remove', { bubbles: true, composed: true, detail: { value: this.value || this.text } }))
  }

  private renderContent() {
    return html`
      ${
        this.selectable && this.selected && !this.hasParts
          ? html`<span class="icon selected-icon" aria-hidden="true">
              <slot name="selected-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </slot>
            </span>`
          : nothing
      }
      <span class="icon prefix" ?hidden=${!this.slotPresence.has('prefix')}><slot name="prefix" @slotchange=${this.slotPresence.handleSlotChange}></slot></span>
      <span class="label"><slot @slotchange=${this.handleSlotChange}></slot></span>
    `
  }

  override render() {
    const selectable = this.selectable && !this.hasParts
    const classes = {
      'c2-chip': true,
      'is-selectable': selectable,
      'is-selected': selectable && this.selected,
      'is-disabled': this.disabled,
      'has-parts': this.hasParts,
    }
    return html`
      <span class=${classMap(classes)} part="chip" @keydown=${this.handlePartKeyDown}>
        ${
          selectable
            ? html`<button
                class="action"
                part="action"
                type="button"
                aria-pressed=${this.selected ? 'true' : 'false'}
                ?disabled=${this.disabled}
                @click=${this.handleToggle}
                @keydown=${this.handleActionKeyDown}
              >
                ${this.renderContent()}
              </button>`
            : html`<span class="action" part="action">${this.renderContent()}</span>`
        }
        ${
          this.removable
            ? html`<button
                class="remove"
                part="remove-button"
                type="button"
                aria-label=${this.text ? `${this.removeLabel} ${this.text}` : this.removeLabel}
                ?disabled=${this.disabled}
                @click=${this.handleRemove}
              >
                <slot name="remove-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </slot>
              </button>`
            : nothing
        }
      </span>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chip': Chip
  }
}
