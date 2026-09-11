import { LitElement, html, nothing, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './list-item.scss?inline'
import { selectedItemValueContext } from './list-item-context'
import { ContextConsumer } from '@c2n/core/controllers/context-consumer.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'

/**
 * A selectable row. On its own it is a toggle: click, Enter or Space flips `selected`. Inside a `c2-list` (and
 * therefore inside a `c2-select`) the list drives the selected state through context, handles the keyboard and the row
 * only reports clicks. The default slot is the primary text, `description` a second, muted line, `prefix-icon` and
 * `suffix-icon` take an inline SVG, a `c2-feather-*` icon or a `c2-mat-icon` and are sized by `--c2-list-item__icon--size`.
 * With `href` the row is a link. In a multiple-selection list, adjacent selected rows lose the corner radius between
 * them (the list marks them `joined-before` / `joined-after`) so a run of selected rows reads as one block.
 *
 * Accessibility: standalone rows are `role="button"` with `aria-pressed`; rows in a list are `role="option"` with
 * `aria-selected` and a roving `tabindex` managed by the list. Set your own `role` to override.
 *
 * @tag c2-list-item
 *
 * @slot default - The row content. Falls back to `label`, then `value`, when empty.
 * @slot description - Secondary line under the content (muted, smaller).
 * @slot prefix-icon - Icon (or avatar, badge, …) shown before the content.
 * @slot suffix-icon - Icon shown after the content, e.g. a check mark or shortcut hint.
 *
 * @event {CustomEvent<{ selected: boolean; value: string }>} selected-change - Fired after `selected` changes, whether from a click or from the parent list.
 *
 * @cssproperty {pixel} [--c2-list-item--min-height=36px]
 * @cssproperty {pixel} [--c2-list-item--gap=8px] - Space between the icons and the content.
 *
 * @cssproperty {border-radius} [--c2-list-item--border-top-left-radius=6px]
 * @cssproperty {border-radius} [--c2-list-item--border-top-right-radius=6px]
 * @cssproperty {border-radius} [--c2-list-item--border-bottom-left-radius=6px]
 * @cssproperty {border-radius} [--c2-list-item--border-bottom-right-radius=6px]
 *
 * @cssproperty {padding} [--c2-list-item--padding-top=6px]
 * @cssproperty {padding} [--c2-list-item--padding-right=10px]
 * @cssproperty {padding} [--c2-list-item--padding-bottom=6px]
 * @cssproperty {padding} [--c2-list-item--padding-left=10px]
 *
 * @cssproperty {font-size} [--c2-list-item--font-size=14px]
 * @cssproperty {font-weight} --c2-list-item--font-weight
 * @cssproperty {font-style} --c2-list-item--font-style
 * @cssproperty {font-family} --c2-list-item--font-family
 * @cssproperty {pixel} [--c2-list-item--line-height=20px]
 *
 * @cssproperty {border} --c2-list-item--border-top
 * @cssproperty {border} --c2-list-item--border-bottom
 * @cssproperty {border} --c2-list-item--border-right
 * @cssproperty {border} --c2-list-item--border-left
 *
 * @cssproperty {color} [--c2-list-item--color=#18181b]
 * @cssproperty {color} [--c2-list-item--background=transparent]
 *
 * @cssproperty {color} [--c2-list-item__description--color=#71717a]
 * @cssproperty {font-size} [--c2-list-item__description--font-size=12px]
 * @cssproperty {pixel} [--c2-list-item__description--line-height=16px]
 * @cssproperty {pixel} [--c2-list-item__description--margin-top=1px]
 *
 * @cssproperty {border} --c2-list-item__hover--border-top
 * @cssproperty {border} --c2-list-item__hover--border-bottom
 * @cssproperty {border} --c2-list-item__hover--border-right
 * @cssproperty {border} --c2-list-item__hover--border-left
 * @cssproperty {color} --c2-list-item__hover--color
 * @cssproperty {color} [--c2-list-item__hover--background=#f4f4f5]
 *
 * @cssproperty {border} --c2-list-item__selected--border-top
 * @cssproperty {border} --c2-list-item__selected--border-bottom
 * @cssproperty {border} --c2-list-item__selected--border-right
 * @cssproperty {border} --c2-list-item__selected--border-left
 * @cssproperty {color} [--c2-list-item__selected--color=#2f56e6]
 * @cssproperty {color} [--c2-list-item__selected--background=#edf1fe]
 * @cssproperty {color} [--c2-list-item__selected__hover--background=#e2e9fd]
 * @cssproperty {color} --c2-list-item__selected__description--color - Defaults to the description colour.
 *
 * @cssproperty {outline} [--c2-list-item__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-list-item__focus--outline-offset=-2px]
 *
 * @cssproperty {opacity} [--c2-list-item__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-list-item__icon--size=16px]
 * @cssproperty {color} --c2-list-item__icon--color - Defaults to the row text colour.
 */
@customElement('c2-list-item')
export class ListItem extends LitElement {
  static override styles = unsafeCSS(styles)

  private contextConsumer = new ContextConsumer(this, {
    context: selectedItemValueContext,
    subscribe: true,
    callback: (value) => {
      this.selected = value ? value.includes(this.value) : false
    },
  })

  /** Whether the row is selected. Toggled by a click on a standalone row; controlled by the list otherwise. */
  @property({ type: Boolean, reflect: true }) selected = false

  /** Dims the row and ignores clicks and keyboard. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The value reported to the parent list / select. */
  @property({ reflect: true }) value = ''

  /**
   * Text shown by the parent select for this row instead of the slotted content. Also the fallback content of the
   * default slot when it is empty. Use it when the row content is rich (icons, two lines) but the trigger should show a
   * short label.
   */
  @property({ reflect: true }) label?: string

  /** Makes the row a link. Selection still works when the row sits in a list. */
  @property() href: string | undefined = undefined

  @property() target: string | undefined = undefined

  /** Arbitrary payload returned alongside `value` in the list's `selection-change` event. Not an attribute. */
  @property({ attribute: false }) data?: unknown

  /**
   * Private property, it will use context value to setup selected state of component.
   */
  @property({ attribute: false }) applyContext = false

  @state() private hasDescription = false

  @query('slot:not([name])')
  private contentSlot!: HTMLSlotElement

  /** `role` written by the author, kept over the automatic one. */
  private authorRole: string | null = null

  /** The text a `c2-select` shows for this row: `label` when set, otherwise the text content of the default slot. */
  get displayText(): string {
    if (this.label !== undefined) return this.label

    return (
      (this.contentSlot
        .assignedNodes({ flatten: true })
        .flatMap((item) => (item as HTMLElement).innerText ?? (item as HTMLElement).textContent)
        .join(' ')
        .trim() ||
        this.contentSlot.innerText) ??
      this.contentSlot.textContent
    )
  }

  override connectedCallback() {
    super.connectedCallback()
    if (this.authorRole === null) this.authorRole = this.getAttribute('role')
    this.addEventListener('keydown', this.handleKeydown)
    this.addEventListener('click', this.blockDisabledClick, true)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('keydown', this.handleKeydown)
    this.removeEventListener('click', this.blockDisabledClick, true)
  }

  private blockDisabledClick = (event: Event) => {
    if (!this.disabled) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  /** Behaves like a click: dispatches `click` on the row and, for a standalone row, toggles `selected`. */
  activate() {
    if (this.disabled) return
    const dispatched = this.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }))
    if (dispatched && !this.applyContext) this.selected = !this.selected
  }

  private handleClick = (event: Event) => {
    if (this.disabled) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const dispatched = redispatchEvent(this, event)

    if (dispatched && this.applyContext == false) {
      this.selected = !this.selected
    }
  }

  private handleKeydown = (event: KeyboardEvent) => {
    // Inside a list the list owns the keyboard.
    if (this.applyContext || this.disabled) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (this.href) this.renderRoot.querySelector('a')?.click()
      else this.activate()
    }
  }

  private handleDescriptionSlotChange(event: Event) {
    this.updateDescription(event.target as HTMLSlotElement)
  }

  private updateDescription(slot: HTMLSlotElement) {
    this.hasDescription = slot.assignedNodes({ flatten: true }).some((n) => n.nodeType === Node.ELEMENT_NODE || (n.textContent ?? '').trim() !== '')
  }

  protected override willUpdate(changedProperties: PropertyValueMap<this>): void {
    if (changedProperties.has('applyContext')) {
      if (this.applyContext) {
        this.contextConsumer.applyContext()
      } else if (this.applyContext == false) {
        this.contextConsumer.unApplyContext()
      }
    }
  }

  protected override firstUpdated(): void {
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot[name="description"]')
    if (slot) this.updateDescription(slot)
  }

  protected override updated(changedProperties: PropertyValueMap<this>): void {
    // Only report real changes, not the initial render.
    if (changedProperties.has('selected') && changedProperties.get('selected') !== undefined) {
      this.dispatchEvent(
        new CustomEvent('selected-change', {
          bubbles: true,
          composed: true,
          detail: { selected: this.selected, value: this.value },
        }),
      )
    }
    this.syncAria()
  }

  private syncAria() {
    const inList = this.applyContext
    const role = this.authorRole ?? (this.href ? 'link' : inList ? 'option' : 'button')
    this.setAttribute('role', role)
    if (role === 'option') {
      this.setAttribute('aria-selected', String(this.selected))
      this.removeAttribute('aria-pressed')
    } else if (role === 'button') {
      this.setAttribute('aria-pressed', String(this.selected))
      this.removeAttribute('aria-selected')
    } else {
      this.removeAttribute('aria-selected')
      this.removeAttribute('aria-pressed')
    }
    if (this.disabled) this.setAttribute('aria-disabled', 'true')
    else this.removeAttribute('aria-disabled')
    // Standalone rows are tab stops themselves; in a list the list assigns the roving tabindex.
    if (!inList) this.tabIndex = this.disabled ? -1 : 0
    else if (this.disabled) this.tabIndex = -1
  }

  private renderInner() {
    return html`
      <slot name="prefix-icon"></slot>
      <div class="c2-list-item__content">
        <div class="c2-list-item__text"><slot>${this.label ?? this.value}</slot></div>
        <div class="c2-list-item__description" ?hidden=${!this.hasDescription}>
          <slot name="description" @slotchange=${this.handleDescriptionSlotChange}></slot>
        </div>
      </div>
      <slot name="suffix-icon"></slot>
    `
  }

  override render() {
    if (this.href && !this.disabled) {
      return html`<a
        class="c2-list-item"
        href=${this.href}
        target=${ifDefined(this.target)}
        rel=${this.target === '_blank' ? 'noopener noreferrer' : nothing}
        tabindex="-1"
        @click=${this.handleClick}
        >${this.renderInner()}</a
      >`
    }
    return html`<div class="c2-list-item" @click=${this.handleClick}>${this.renderInner()}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-list-item': ListItem
  }
}
