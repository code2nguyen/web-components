import { LitElement, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './card.scss?inline'
/**
 * Card component
 *
 * @slot default - This is a default/unnamed slot
 *
 * @cssproperty {pixel} [--c2-card--border-top-left-radius=4px] 
 * @cssproperty {pixel} [--c2-card--border-top-right-radius=4px]
 * @cssproperty {pixel} [--c2-card--border-bottom-left-radius=4px]
 * @cssproperty {pixel} [--c2-card--border-bottom-right-radius=4px]
 * 
 * @cssproperty {pixel} [--c2-card--padding-top=8px]
 * @cssproperty {pixel} [--c2-card--padding-right=8px]
 * @cssproperty {pixel} [--c2-card--padding-bottom=8px]
 * @cssproperty {pixel} [--c2-card--padding-left=8px]
 * 
 * @cssproperty {border} [--c2-card--border-top=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-card--border-bottom=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-card--border-right=1px solid rgb(177, 177, 177)]
 * @cssproperty {border} [--c2-card--border-left=1px solid rgb(177, 177, 177)]
 * 
 * @cssproperty {color} [--c2-card--background=rgb(255, 255, 255)]
 * @cssproperty {color} --c2-card--box-shadow 
 *
 * @cssproperty {border} [--c2-card__hover--border-top=--c2-card--border-top] 
 * @cssproperty {border} [--c2-card__hover--border-bottom=--c2-card--border-bottom] 
 * @cssproperty {border} [--c2-card__hover--border-right=--c2-card--border-right] 
 * @cssproperty {border} [--c2-card__hover--border-left=--c2-card--border-lef] 
 * @cssproperty {color} [--c2-card__hover--background=--c2-card--background] 
 * @cssproperty {color} [--c2-card__hover--box-shadow=--c2-card--box-shadow]
 
 * @cssproperty {color} [--c2-card__disabled--box-shadow=--c2-card--box-shadow] 
 * @cssproperty {color} [--c2-card__disabled--opacity=0.38] 

 */
@customElement('c2-card')
export class Card extends LitElement {
  static override styles = unsafeCSS(styles)

  @property() disabled = false

  override render() {
    return html`
      <div class="c2-card">
        <slot></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-card': Card
  }
}
