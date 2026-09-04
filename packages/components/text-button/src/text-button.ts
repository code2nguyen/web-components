import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from 'lit/decorators.js'
import styles from './text-button.scss?inline'
/**
 * @tag c2-text-button
 *
 * @cssproperty {color} [--c2-text-button--color=rgb(70, 70, 70)]
 * @cssproperty {color} [--c2-text-button--text-decoration-color=rgb(2, 101, 220)]
 * @cssproperty {text-decoration} [--c2-text-button--text-decoration=none)]
 * @cssproperty {pixel} [--c2-text-button--text-underline-offset=4px]
 *
 * @cssproperty {padding} [--c2-text-button--padding-top=4px]
 * @cssproperty {padding} [--c2-text-button--padding-left=4px]
 * @cssproperty {padding} [--c2-text-button--padding-right=4px]
 * @cssproperty {padding} [--c2-text-button--padding-bottom=4px]
 *
 * @cssproperty {color} [--c2-text-button__hover--color=rgb(2, 101, 220)]
 * @cssproperty {text-decoration} [--c2-text-button__hover--text-decoration=underline]
 * @cssproperty {color} --c2-text-button__hover--text-decoration-color
 *
 */
@customElement('c2-text-button')
export class TextButton extends LitElement {
  static override styles = unsafeCSS(styles)

  override render() {
    return html`
      <div class="c2-text-button">
        <slot></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-text-button': TextButton
  }
}
