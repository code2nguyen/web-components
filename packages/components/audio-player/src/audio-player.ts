import { LitElement, html, unsafeCSS } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './audio-player.scss?inline'
/**
 * @tag c2-audio-player
 *
 * @slot default - This is a default/unnamed slot
 *
 * @event
 * @cssproperty
 */
@customElement('c2-audio-player')
export class AudioPlayer extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ type: String }) name = 'Example property'

  override render() {
    return html` <div class="c2-audio-player">${this.name}</div> `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-audio-player': AudioPlayer
  }
}
