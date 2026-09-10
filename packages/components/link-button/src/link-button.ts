import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './link-button.scss?inline'

/**
 * A text-styled control for link and navigation actions. With `href` it renders a real anchor; without it renders a
 * button, so both forms keep native semantics (keyboard activation, middle-click, open in new tab).
 *
 * @tag c2-link-button
 *
 * @slot default - Label text.
 * @slot prefix-icon - Icon shown before the label.
 * @slot suffix-icon - Icon shown after the label, e.g. a `c2-feather-external-link` for links that open a new tab.
 *
 * @cssproperty {pixel} [--c2-link-button__container--gap=6px]
 * @cssproperty {padding} [--c2-link-button__container--padding-top=4px]
 * @cssproperty {padding} [--c2-link-button__container--padding-right=4px]
 * @cssproperty {padding} [--c2-link-button__container--padding-bottom=4px]
 * @cssproperty {padding} [--c2-link-button__container--padding-left=4px]
 * @cssproperty {border-radius} [--c2-link-button__container--border-radius=4px]
 * @cssproperty {color} --c2-link-button__container--background-color
 * @cssproperty {color} [--c2-link-button__container--color=currentColor]
 * @cssproperty {pixel} [--c2-link-button__container--font-size=14px]
 * @cssproperty {font-weight} [--c2-link-button__container--font-weight=500]
 * @cssproperty {text-decoration} [--c2-link-button__container--text-decoration=none]
 * @cssproperty {color} [--c2-link-button__container--text-decoration-color=rgb(2, 101, 220)]
 * @cssproperty {pixel} [--c2-link-button__container--text-underline-offset=4px]
 *
 * @cssproperty {color} [--c2-link-button__container__hover--color=rgb(2, 101, 220)]
 * @cssproperty {color} --c2-link-button__container__hover--background-color
 * @cssproperty {text-decoration} [--c2-link-button__container__hover--text-decoration=underline]
 * @cssproperty {color} --c2-link-button__container__hover--text-decoration-color
 *
 * @cssproperty {outline} [--c2-link-button__container__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-link-button__container__focus--outline-offset=2px]
 *
 * @cssproperty {color} [--c2-link-button__container__selected--color=rgb(2, 101, 220)]
 * @cssproperty {color} --c2-link-button__container__selected--background-color
 * @cssproperty {font-weight} [--c2-link-button__container__selected--font-weight=600]
 * @cssproperty {text-decoration} --c2-link-button__container__selected--text-decoration
 *
 * @cssproperty {opacity} [--c2-link-button__container__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-link-button__icon--size=16px]
 * @cssproperty {color} --c2-link-button__icon--color
 */
@customElement('c2-link-button')
export class LinkButton extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  /** Destination URL. When set (and the element is not disabled) the control renders as an anchor element. */
  @property() href: string | undefined = undefined

  /** Browsing context for the link, forwarded to the anchor. Ignored when `external` is set. */
  @property() target: string | undefined = undefined

  /** Link relationship, forwarded to the anchor. Takes precedence over the value implied by `external`. */
  @property() rel: string | undefined = undefined

  /** Prompts to download the destination instead of navigating; forwarded to the anchor. */
  @property() download: string | undefined = undefined

  /** Opens the link in a new tab (`target="_blank" rel="noopener noreferrer"`) and shows an arrow-up-right suffix icon by default. */
  @property({ type: Boolean, reflect: true }) external = false

  /** Disables the control: it renders as a disabled button element (even with `href`), ignores clicks and is dimmed. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Marks the current or active item (`aria-current="page"` on links, `aria-pressed` on buttons). */
  @property({ type: Boolean, reflect: true }) selected = false

  private renderContent() {
    return html`
      <slot name="prefix-icon" class="icon prefix-icon"></slot>
      <span class="label"><slot></slot></span>
      <slot name="suffix-icon" class="icon suffix-icon"></slot>
    `
  }

  override render() {
    if (this.href && !this.disabled) {
      return html`
        <a
          class="c2-link-button"
          part="link"
          href=${this.href}
          target=${ifDefined(this.external ? '_blank' : this.target)}
          rel=${ifDefined(this.rel ?? (this.external ? 'noopener noreferrer' : undefined))}
          download=${ifDefined(this.download)}
          aria-current=${this.selected ? 'page' : nothing}
        >
          ${this.renderContent()}
        </a>
      `
    }
    return html`
      <button class="c2-link-button" part="button" type="button" ?disabled=${this.disabled} aria-pressed=${this.selected ? 'true' : nothing}>
        ${this.renderContent()}
      </button>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-link-button': LinkButton
  }
}
