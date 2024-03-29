import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './avatar.scss?inline'
/**
 * @tag c2-avatar
 *
 * @slot default - This is a default/unnamed slot
 *
 * @cssproperty {pixel} [--c2-avatar--width=32px]
 * @cssproperty {pixel} [--c2-avatar--height=32px]
 * @cssproperty {color} [--c2-avatar--color=#FFFFFF]
 * @cssproperty {background} [--c2-avatar--background=rgb(0, 122, 77)]
 *
 * @cssproperty {border-radius} [--c2-avatar--border-top-left-radius=999px]
 * @cssproperty {border-radius} [--c2-avatar--border-top-right-radius=999px]
 * @cssproperty {border-radius} [--c2-avatar--border-bottom-left-radius=999px]
 * @cssproperty {border-radius} [--c2-avatar--border-bottom-right-radius=999px]
 *
 * @cssproperty {border} --c2-avatar--border-top
 * @cssproperty {border} --c2-avatar--border-bottom
 * @cssproperty {border} --c2-avatar--border-right
 * @cssproperty {border} --c2-avatar--border-left
 *
 * @cssproperty {font-size} [--c2-avatar--font-size=18px]
 * @cssproperty {font-weight} [--c2-avatar--font-weight=700]
 * @cssproperty {font-style} --c2-avatar--font-style
 * @cssproperty {font-family} --c2-avatar--font-family
 */
@customElement('c2-avatar')
export class Avatar extends LitElement {
  static override styles = unsafeCSS(styles)

  @property() name = ''

  get firstInitial(): string {
    return this.name.charAt(0).toUpperCase()
  }

  override render() {
    return html` <div class="c2-avatar"><slot>${this.firstInitial}</slot></div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-avatar': Avatar
  }
}
