import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './card.scss?inline'

/**
 * Surface that groups related content and actions. The body goes in the default slot; `media`, `header` and `footer`
 * are optional sections that render only when filled: media bleeds to the edges at the top, header and footer get
 * their own padding and divider tokens. With `href` the whole card is a link; with `interactive` it behaves like a
 * button (focusable, Enter and Space click it). Hover, focus and disabled looks are themeable.
 *
 * @tag c2-card
 *
 * @slot - Card body.
 * @slot media - Full-bleed image, video or any block shown above the body; it is clipped to the card radius.
 * @slot header - Title area above the body.
 * @slot footer - Actions row below the body (a flex row, see the `footer--*` tokens).
 *
 * @cssproperty {padding} [--c2-card--padding-top=12px]
 * @cssproperty {padding} [--c2-card--padding-right=16px]
 * @cssproperty {padding} [--c2-card--padding-bottom=12px]
 * @cssproperty {padding} [--c2-card--padding-left=16px]
 *
 * @cssproperty {border-radius} [--c2-card--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-card--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-card--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-card--border-bottom-right-radius=8px]
 *
 * @cssproperty {border} [--c2-card--border-top=1px solid rgb(213, 213, 213)]
 * @cssproperty {border} [--c2-card--border-bottom=1px solid rgb(213, 213, 213)]
 * @cssproperty {border} [--c2-card--border-right=1px solid rgb(213, 213, 213)]
 * @cssproperty {border} [--c2-card--border-left=1px solid rgb(213, 213, 213)]
 *
 * @cssproperty {background} [--c2-card--background=rgb(255, 255, 255)]
 * @cssproperty {color} --c2-card--color - Text color of the card; inherits by default.
 * @cssproperty {box-shadow} [--c2-card--box-shadow=none]
 * @cssproperty {transform} --c2-card--transform
 *
 * @cssproperty {padding} --c2-card__header--padding-top - Falls back to `--c2-card--padding-top`.
 * @cssproperty {padding} --c2-card__header--padding-right - Falls back to `--c2-card--padding-right`.
 * @cssproperty {padding} [--c2-card__header--padding-bottom=0px]
 * @cssproperty {padding} --c2-card__header--padding-left - Falls back to `--c2-card--padding-left`.
 * @cssproperty {border} --c2-card__header--border-bottom - Divider under the header; raise `header--padding-bottom` with it.
 *
 * @cssproperty {padding} [--c2-card__footer--padding-top=0px]
 * @cssproperty {padding} --c2-card__footer--padding-right - Falls back to `--c2-card--padding-right`.
 * @cssproperty {padding} --c2-card__footer--padding-bottom - Falls back to `--c2-card--padding-bottom`.
 * @cssproperty {padding} --c2-card__footer--padding-left - Falls back to `--c2-card--padding-left`.
 * @cssproperty {border} --c2-card__footer--border-top - Divider above the footer; raise `footer--padding-top` with it.
 * @cssproperty {pixel} [--c2-card__footer--gap=8px]
 * @cssproperty {justify-content} [--c2-card__footer--justify-content=flex-start]
 *
 * @cssproperty {pixel} --c2-card__media--height
 * @cssproperty {aspect-ratio} --c2-card__media--aspect-ratio
 * @cssproperty {object-fit} [--c2-card__media--object-fit=cover]
 *
 * @cssproperty {border} --c2-card__hover--border-top
 * @cssproperty {border} --c2-card__hover--border-bottom
 * @cssproperty {border} --c2-card__hover--border-right
 * @cssproperty {border} --c2-card__hover--border-left
 * @cssproperty {background} --c2-card__hover--background
 * @cssproperty {box-shadow} --c2-card__hover--box-shadow
 * @cssproperty {transform} --c2-card__hover--transform - e.g. `translateY(-2px)` for a lift.
 *
 * @cssproperty {outline} [--c2-card__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-card__focus--outline-offset=2px]
 *
 * @cssproperty {box-shadow} --c2-card__disabled--box-shadow
 * @cssproperty {opacity} [--c2-card__disabled--opacity=0.38]
 */
@customElement('c2-card')
export class Card extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Dims the card and ignores pointer and keyboard interaction. A link card renders without its anchor. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Button-like card: focusable, `role="button"`, Enter and Space dispatch `click`, pointer cursor. Implied by `href`. */
  @property({ type: Boolean, reflect: true }) interactive = false

  /** Makes the whole card a link. */
  @property() href: string | undefined = undefined

  @property() target: string | undefined = undefined

  @property() rel: string | undefined = undefined

  @state() private hasMedia = false
  @state() private hasHeader = false
  @state() private hasContent = false
  @state() private hasFooter = false

  private handleSlotChange(event: Event) {
    this.updateSection(event.target as HTMLSlotElement)
  }

  /** `slotchange` does not fire for slots that were server-rendered (declarative shadow DOM), so read every slot once. */
  override firstUpdated() {
    for (const slot of this.renderRoot.querySelectorAll('slot')) this.updateSection(slot)
  }

  private updateSection(slot: HTMLSlotElement) {
    const filled = slot.assignedNodes({ flatten: true }).some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
    switch (slot.name) {
      case 'media':
        this.hasMedia = filled
        break
      case 'header':
        this.hasHeader = filled
        break
      case 'footer':
        this.hasFooter = filled
        break
      default:
        this.hasContent = filled
    }
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.click()
    }
  }

  private renderSections() {
    return html`
      <div class="c2-card-media" ?hidden=${!this.hasMedia}><slot name="media" @slotchange=${this.handleSlotChange}></slot></div>
      <div class="c2-card-header" ?hidden=${!this.hasHeader}><slot name="header" @slotchange=${this.handleSlotChange}></slot></div>
      <div class="c2-card-content" ?hidden=${!this.hasContent}><slot @slotchange=${this.handleSlotChange}></slot></div>
      <div class="c2-card-footer" ?hidden=${!this.hasFooter}><slot name="footer" @slotchange=${this.handleSlotChange}></slot></div>
    `
  }

  override render() {
    const isLink = !!this.href && !this.disabled
    const interactive = this.interactive || !!this.href
    const classes = classMap({ 'c2-card': true, 'is-interactive': interactive })

    if (isLink) {
      return html`<a class=${classes} href=${this.href} target=${ifDefined(this.target)} rel=${ifDefined(this.rel)}>${this.renderSections()}</a>`
    }
    return html`
      <div
        class=${classes}
        role=${interactive ? 'button' : nothing}
        tabindex=${interactive && !this.disabled ? '0' : nothing}
        aria-disabled=${interactive && this.disabled ? 'true' : nothing}
        @keydown=${interactive && !this.disabled ? this.handleKeydown : nothing}
      >
        ${this.renderSections()}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-card': Card
  }
}
