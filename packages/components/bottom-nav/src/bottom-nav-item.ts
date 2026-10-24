import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { bottomNavMessages } from './messages'
import styles from './bottom-nav-item.scss?inline'

import '@c2n/badge'

/**
 * One destination of a `c2-bottom-nav`: an icon over a short label, with an optional count or dot badge. With an
 * `href` it renders a link, otherwise a button. Mark the item of the page being shown `current` (or set the bar's
 * `value`) to announce `aria-current="page"`, show the indicator behind the icon and swap in the `current-icon`.
 *
 * The badge is drawn with `c2-badge` and read as part of the item's name ("Inbox, 3 new", "Chat, new activity"),
 * so a screen reader hears what a sighted user sees. A label hidden by the bar's `label-visibility` stays the name.
 *
 * @tag c2-bottom-nav-item
 *
 * @slot default - The label. Falls back to `label`.
 * @slot icon - The icon, sized by `--c2-bottom-nav-item__icon--size`.
 * @slot current-icon - Optional icon shown instead of `icon` while the item is current, such as a filled variant.
 *
 * @csspart item - The link or button: the whole touch target.
 * @csspart indicator - The shape behind the icon that marks the current item, and the hover and pressed feedback.
 * @csspart label - The label text.
 * @csspart badge - The `c2-badge` drawn for `count` or `dot`.
 *
 * @cssproperty {flex-direction} [--c2-bottom-nav-item--flex-direction=column] - `row` puts the icon before the label, as on tablets.
 * @cssproperty {pixel} [--c2-bottom-nav-item--gap=4px] - Space between the icon and the label.
 * @cssproperty {pixel} [--c2-bottom-nav-item--min-height=48px] - Minimum height of the touch target.
 * @cssproperty {padding} [--c2-bottom-nav-item--padding-top=8px]
 * @cssproperty {padding} [--c2-bottom-nav-item--padding-right=2px]
 * @cssproperty {padding} [--c2-bottom-nav-item--padding-bottom=6px]
 * @cssproperty {padding} [--c2-bottom-nav-item--padding-left=2px]
 * @cssproperty {color} [--c2-bottom-nav-item--color=#71717a] - Icon and label colour of an item that is not current.
 * @cssproperty {font-family} [--c2-bottom-nav-item--font-family=inherit]
 * @cssproperty {font-size} [--c2-bottom-nav-item--font-size=12px]
 * @cssproperty {font-weight} [--c2-bottom-nav-item--font-weight=500]
 * @cssproperty {line-height} [--c2-bottom-nav-item--line-height=16px]
 * @cssproperty {pixel} --c2-bottom-nav-item--letter-spacing
 *
 * @cssproperty {color} [--c2-bottom-nav-item__current--color=rgb(2, 101, 220)] - Icon and label colour of the current item.
 * @cssproperty {font-weight} [--c2-bottom-nav-item__current--font-weight=600] - Label weight of the current item.
 *
 * @cssproperty {pixel} [--c2-bottom-nav-item__indicator--width=56px]
 * @cssproperty {pixel} [--c2-bottom-nav-item__indicator--height=32px]
 * @cssproperty {border-radius} [--c2-bottom-nav-item__indicator--border-radius=999px]
 * @cssproperty {background} [--c2-bottom-nav-item__indicator--background=transparent] - Indicator of an item that is not current.
 * @cssproperty {background} [--c2-bottom-nav-item__indicator__hover--background=#f4f4f5] - Indicator under a hovering pointer.
 * @cssproperty {background} [--c2-bottom-nav-item__indicator__active--background=#e4e4e7] - Indicator while pressed.
 * @cssproperty {background} [--c2-bottom-nav-item__indicator__current--background=#edf1fe] - Indicator of the current item. `transparent` for a tint-only look.
 * @cssproperty {time} [--c2-bottom-nav-item__indicator--transition-duration=0.2s]
 *
 * @cssproperty {pixel} [--c2-bottom-nav-item__icon--size=24px] - Also handed to slotted Feather and Phosphor icons.
 *
 * @cssproperty {pixel} [--c2-bottom-nav-item__line--height=0px] - Height of a line on the top edge of the current item; `3px` for the top-line look.
 * @cssproperty {pixel} [--c2-bottom-nav-item__line--width=50%] - Width of that line.
 * @cssproperty {border-radius} [--c2-bottom-nav-item__line--border-radius=0 0 3px 3px]
 * @cssproperty {background} [--c2-bottom-nav-item__line__current--background=rgb(2, 101, 220)]
 *
 * @cssproperty {pixel} [--c2-bottom-nav-item__badge--top=0px] - Offset of a count badge from the top of the indicator.
 * @cssproperty {pixel} [--c2-bottom-nav-item__badge--inset-inline-start=calc(50% + 4px)] - Offset of a count badge from the start of the indicator.
 * @cssproperty {box-shadow} [--c2-bottom-nav-item__badge--box-shadow=0 0 0 2px #ffffff] - Ring around the badge, in the bar's background colour.
 * @cssproperty {pixel} [--c2-bottom-nav-item__dot--top=3px] - Offset of a dot badge from the top of the indicator.
 * @cssproperty {pixel} [--c2-bottom-nav-item__dot--inset-inline-start=calc(50% + 7px)] - Offset of a dot badge from the start of the indicator.
 *
 * @cssproperty {outline} [--c2-bottom-nav-item__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Keyboard focus ring, drawn around the indicator.
 * @cssproperty {pixel} [--c2-bottom-nav-item__focus--outline-offset=2px]
 */
@customElement('c2-bottom-nav-item')
export class BottomNavItem extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Identifies the item for the bar's `value`. Falls back to `href`, then the label. */
  @property() value = ''

  /** Makes the item a link. */
  @property() href?: string

  /** Browsing context used when `href` is set, such as `_blank`. */
  @property() target?: string

  /** Label used when the default slot is empty. */
  @property() label?: string

  /** The item of the page being shown: announced as `aria-current="page"`. Set by the bar from its `value`. */
  @property({ type: Boolean }) current = false

  /** Number shown in a badge on the icon. `0` hides the badge. */
  @property({ type: Number }) count: number | undefined = undefined

  /** Upper bound for `count`; larger values show as `<max>+`. */
  @property({ type: Number }) max = 99

  /** Shows a dot badge on the icon, read as "new activity". Ignored while `count` is shown. */
  @property({ type: Boolean }) dot = false

  /** Hides the label visually while keeping it as the accessible name. Set by the bar from `label-visibility`. */
  @property({ attribute: false }) labelHidden = false

  @query('.item') private control?: HTMLElement

  private readonly internals = isServer ? undefined : this.attachInternals()

  private readonly msg = new LocalizeController(this, bottomNavMessages)

  private readonly slotPresence = new SlotPresenceController(this, ['current-icon'])

  /** The value the bar compares with its own: `value`, else `href`, else the label. */
  get effectiveValue(): string {
    return this.value || this.href || this.label || this.textContent?.trim() || ''
  }

  private get countText(): string {
    if (this.count === undefined || this.count <= 0) return ''
    return this.count > this.max ? `${this.max}+` : String(this.count)
  }

  /** Focuses the link or button. */
  override focus(options?: FocusOptions) {
    this.control?.focus(options)
  }

  protected override updated(changed: PropertyValues<this>) {
    super.updated(changed)
    if (changed.has('current') && this.internals) {
      if (this.current) this.internals.states.add('current')
      else this.internals.states.delete('current')
    }
  }

  private renderContent() {
    const countText = this.countText
    const dot = !countText && this.dot
    const announcement = countText ? this.msg.t('newCount', countText) : dot ? this.msg.t('newActivity') : ''
    const currentIcon = this.current && this.slotPresence.has('current-icon')
    return html`
      <span part="indicator" class="indicator">
        <span class="icon">
          <slot name="icon" ?hidden=${currentIcon}></slot>
          <slot name="current-icon" ?hidden=${!currentIcon} @slotchange=${this.slotPresence.handleSlotChange}></slot>
        </span>
        ${
          countText || dot
            ? html`<c2-badge
                part="badge"
                class="badge ${dot ? 'is-dot' : ''}"
                tone="danger"
                aria-hidden="true"
                count=${ifDefined(countText ? this.count : undefined)}
                max=${this.max}
                ?dot=${dot}
              ></c2-badge>`
            : nothing
        }
      </span>
      <span part="label" class="label ${this.labelHidden ? 'visually-hidden' : ''}"><slot>${this.label}</slot></span
      >${announcement ? html`<span class="visually-hidden">, ${announcement}</span>` : nothing}
    `
  }

  override render() {
    const classes = `item ${this.current ? 'is-current' : ''}`
    const current = this.current ? 'page' : nothing
    return this.href
      ? html`<a part="item" class=${classes} href=${this.href} target=${ifDefined(this.target)} aria-current=${current}>${this.renderContent()}</a>`
      : html`<button part="item" class=${classes} type="button" aria-current=${current}>${this.renderContent()}</button>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-bottom-nav-item': BottomNavItem
  }
}
