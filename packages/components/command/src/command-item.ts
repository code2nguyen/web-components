import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import styles from './command-item.scss?inline'

/**
 * One command of a `c2-command` palette. The palette filters rows against the query, highlights one of them and
 * activates it on Enter or a click; the row itself never handles the keyboard and never takes focus, which stays in the
 * palette's search field. The default slot is the label, `description` a second muted line, `prefix-icon` /
 * `suffix-icon` take an inline SVG or an icon element, and `shortcut` holds a keyboard hint (plain text or a `c2-kbd`).
 *
 * The row matches when every word of the query appears in its label, its `value` or its `keywords`. With `href` the
 * row is a link: activating it navigates unless the palette's `command-select` event is cancelled.
 *
 * @tag c2-command-item
 *
 * @slot default - The row label, also the text the palette matches. Falls back to `value` when empty.
 * @slot description - Secondary line under the label (muted, smaller). Not matched.
 * @slot prefix-icon - Icon shown before the label.
 * @slot suffix-icon - Icon or badge shown after the label.
 * @slot shortcut - Keyboard hint, aligned to the end of the row.
 *
 * @csspart row - The row box: a `<div>`, or an `<a>` when `href` is set.
 *
 * @cssproperty {pixel} [--c2-command-item--min-height=36px]
 * @cssproperty {pixel} [--c2-command-item--gap=8px] - Space between the icons, label and shortcut.
 *
 * @cssproperty {border-radius} [--c2-command-item--border-top-left-radius=6px]
 * @cssproperty {border-radius} [--c2-command-item--border-top-right-radius=6px]
 * @cssproperty {border-radius} [--c2-command-item--border-bottom-left-radius=6px]
 * @cssproperty {border-radius} [--c2-command-item--border-bottom-right-radius=6px]
 *
 * @cssproperty {padding} [--c2-command-item--padding-top=8px]
 * @cssproperty {padding} [--c2-command-item--padding-right=8px]
 * @cssproperty {padding} [--c2-command-item--padding-bottom=8px]
 * @cssproperty {padding} [--c2-command-item--padding-left=8px]
 *
 * @cssproperty {font-size} [--c2-command-item--font-size=14px]
 * @cssproperty {font-weight} --c2-command-item--font-weight
 * @cssproperty {font-family} --c2-command-item--font-family
 * @cssproperty {pixel} [--c2-command-item--line-height=20px]
 *
 * @cssproperty {color} [--c2-command-item--color=#18181b]
 * @cssproperty {color} [--c2-command-item--background=transparent]
 *
 * @cssproperty {color} [--c2-command-item__active--background=#f4f4f5] - The highlighted row (keyboard or pointer).
 * @cssproperty {color} --c2-command-item__active--color - Defaults to the row colour.
 *
 * @cssproperty {color} [--c2-command-item__description--color=#71717a]
 * @cssproperty {font-size} [--c2-command-item__description--font-size=12px]
 * @cssproperty {pixel} [--c2-command-item__description--line-height=16px]
 *
 * @cssproperty {color} [--c2-command-item__shortcut--color=#71717a]
 * @cssproperty {font-size} [--c2-command-item__shortcut--font-size=12px]
 *
 * @cssproperty {pixel} [--c2-command-item__icon--size=16px]
 * @cssproperty {color} [--c2-command-item__icon--color=#71717a]
 *
 * @cssproperty {opacity} [--c2-command-item__disabled--opacity=0.38]
 */
@customElement('c2-command-item')
export class CommandItem extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The value reported in `command-select`, also matched against the query. Defaults to the label text. */
  @property({ reflect: true }) value = ''

  /** Extra words the query matches, separated by spaces or commas (synonyms, ids, tags). */
  @property({ reflect: true }) keywords = ''

  /** Dims the row; it can be matched but never highlighted or activated. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Makes the row a link that activating it navigates to. */
  @property() href?: string

  /** Browsing context used when `href` is set, such as `_blank`. */
  @property() target?: string

  /** Arbitrary payload returned alongside `value` in `command-select`. Not an attribute. */
  @property({ attribute: false }) data?: unknown

  /** Set by the palette on the highlighted row. Announced as `aria-selected`. */
  @property({ attribute: false }) active = false

  /** Set by the palette while the row does not match the query; the row is then not rendered. */
  @property({ attribute: false }) filtered = false

  @query('slot:not([name])') private contentSlot?: HTMLSlotElement

  @query('a') private anchor?: HTMLAnchorElement

  private readonly slotPresence = new SlotPresenceController(this, ['description'])

  // Semantics and state live on ElementInternals, not host attributes, so a server-rendered host never mismatches.
  private readonly internals = this.attachInternals()

  /** The label text: what the palette matches and what `value` falls back to. */
  get label(): string {
    const assigned = this.contentSlot?.assignedNodes({ flatten: true })
    const nodes = assigned ?? Array.from(this.childNodes).filter((node) => !(node instanceof Element && node.hasAttribute('slot')))
    return nodes
      .map((node) => node.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /** The value reported when the row is activated: `value`, or the label text when `value` is empty. */
  get resolvedValue(): string {
    return this.value || this.label
  }

  /** Lower-cased text the palette matches: label, value and keywords. */
  get searchText(): string {
    return `${this.label} ${this.value} ${this.keywords.replace(/,/g, ' ')}`.toLowerCase()
  }

  /** Follows `href`, as a click on the row would. The palette calls it after `command-select` was not cancelled. */
  navigate(): void {
    this.anchor?.click()
  }

  protected override updated(changed: PropertyValues<this>): void {
    this.internals.role = 'option'
    this.internals.ariaSelected = this.active ? 'true' : 'false'
    this.internals.ariaDisabled = this.disabled ? 'true' : null
    if (changed.has('active')) this.toggleState('active', this.active)
    if (changed.has('filtered')) this.toggleState('filtered', this.filtered)
  }

  private toggleState(name: string, on: boolean) {
    try {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    } catch {
      // Browsers without CustomStateSet: the class on the row still carries the look.
    }
  }

  private renderInner() {
    return html`
      <slot name="prefix-icon"></slot>
      <div class="content">
        <div class="text"><slot>${this.value}</slot></div>
        <div class="description" ?hidden=${!this.slotPresence.has('description')}>
          <slot name="description" @slotchange=${this.slotPresence.handleSlotChange}></slot>
        </div>
      </div>
      <slot name="shortcut"></slot>
      <slot name="suffix-icon"></slot>
    `
  }

  override render() {
    if (this.filtered) return nothing
    const classes = `row${this.active ? ' active' : ''}`
    return this.href && !this.disabled
      ? html`<a
          class=${classes}
          part="row"
          href=${this.href}
          target=${ifDefined(this.target)}
          rel=${this.target === '_blank' ? 'noopener noreferrer' : nothing}
          tabindex="-1"
          >${this.renderInner()}</a
        >`
      : html`<div class=${classes} part="row">${this.renderInner()}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-command-item': CommandItem
  }
}
