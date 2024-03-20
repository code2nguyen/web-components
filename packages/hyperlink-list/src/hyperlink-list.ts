import { LitElement, html, unsafeCSS, type PropertyValueMap } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import styles from './hyperlink-list.scss?inline'
/**
 * @tag c2-hyperlink-list
 *
 * @cssproperty {background} [--c2-hyperlink-list--background: rgb(255, 255,255)]
 * @cssproperty {pixel} [--c2-hyperlink-list--gap=4px]
 *
 * @cssproperty {border-radius} --c2-hyperlink-list--border-top-left-radius
 * @cssproperty {border-radius} --c2-hyperlink-list--border-top-right-radius
 * @cssproperty {border-radius} --c2-hyperlink-list--border-bottom-left-radius
 * @cssproperty {border-radius} --c2-hyperlink-list--border-bottom-right-radius
 *
 * @cssproperty {padding} --c2-hyperlink-list--padding-top
 * @cssproperty {padding} --c2-hyperlink-list--padding-left
 * @cssproperty {padding} --c2-hyperlink-list--padding-right
 * @cssproperty {padding} --c2-hyperlink-list--padding-bottom
 *
 * @cssproperty {border} --c2-hyperlink-list--border-top
 * @cssproperty {border} --c2-hyperlink-list--border-left
 * @cssproperty {border} --c2-hyperlink-list--border-right
 * @cssproperty {border} --c2-hyperlink-list--border-bottom
 *
 * @cssproperty {border} --c2-hyperlink-list--max-height
 *
 * @cssproperty {font-size} --c2-hyperlink-list__item--font-size
 * @cssproperty {font-weight} --c2-hyperlink-list__item--font-weight
 * @cssproperty {font-style} --c2-hyperlink-list__item--font-style
 * @cssproperty {font-family} --c2-hyperlink-list__item--font-family
 *
 * @cssproperty {color} --c2-hyperlink-list__item--color
 * @cssproperty {background} --c2-hyperlink-list__item--background
 *
 * @cssproperty {padding-top} --c2-hyperlink-list__item--padding-top
 * @cssproperty {padding-left} --c2-hyperlink-list__item--padding-left
 * @cssproperty {padding-right} --c2-hyperlink-list__item--padding-right
 * @cssproperty {padding-bottom} --c2-hyperlink-list__item--padding-bottom
 *
 * @cssproperty {border-top} --c2-hyperlink-list__item--border-top
 * @cssproperty {border-left} --c2-hyperlink-list__item--border-left
 * @cssproperty {border-right} --c2-hyperlink-list__item--border-right
 * @cssproperty {border-bottom} --c2-hyperlink-list__item--border-bottom
 *
 * @cssproperty {border-radius} --c2-hyperlink-list__item--border-top-left-radius
 * @cssproperty {border-radius} --c2-hyperlink-list__item--border-top-right-radius
 * @cssproperty {border-radius} --c2-hyperlink-list__item--border-bottom-left-radius
 * @cssproperty {border-radius} --c2-hyperlink-list__item--border-bottom-right-radius
 *
 * @cssproperty {text-decoration} [--c2-hyperlink-list__item--text-decoration=none]
 * @cssproperty {color} --c2-hyperlink-list__item--text-decoration-color
 * @cssproperty {pixel} [--c2-hyperlink-list__item--text-underline-offset=4px]
 *
 * @cssproperty {border-top} --c2-hyperlink-list__item__hover--border-top
 * @cssproperty {border-left} --c2-hyperlink-list__item__hover--border-left
 * @cssproperty {border-right} --c2-hyperlink-list__item__hover--border-right
 * @cssproperty {border-bottom} --c2-hyperlink-list__item__hover--border-bottom
 *
 * @cssproperty {text-decoration} --c2-hyperlink-list__item__hover--text-decoration
 * @cssproperty {color} --c2-hyperlink-list__item__hover--text-decoration-color
 * @cssproperty {color} --c2-hyperlink-list__item__hover--color
 * @cssproperty {background} [--c2-hyperlink-list__item__hover--background=rgb(230, 230, 230)]
 *
 * @cssproperty {border-top} --c2-hyperlink-list__item__selected--border-top
 * @cssproperty {border-left} --c2-hyperlink-list__item__selected--border-left
 * @cssproperty {border-right} --c2-hyperlink-list__item__selected--border-right
 * @cssproperty {border-bottom} --c2-hyperlink-list__item__selected--border-bottom
 *
 * @cssproperty {text-decoration} --c2-hyperlink-list__item__selected--text-decoration
 * @cssproperty {color} --c2-hyperlink-list__item__selected--text-decoration-color
 * @cssproperty {color} --c2-hyperlink-list__item__selected--color
 * @cssproperty {background} --c2-hyperlink-list__item__selected--background
 *
 */
@customElement('c2-hyperlink-list')
export class HyperlinkList extends LitElement {
  static override styles = unsafeCSS(styles)

  @property({ attribute: 'selected-url-pattern' }) selectedUrlPattern = ''

  @query('slot') defaultSlot!: HTMLSlotElement

  private handleSlotChange() {
    this.updateSelected()
  }
  // TODO: Support SPA app, need to listen for navigation change event.
  private updateSelected() {
    if (this.selectedUrlPattern) {
      for (const el of this.defaultSlot.assignedElements()) {
        if (el.tagName == 'A') {
          const a = el as HTMLAnchorElement
          const re = new RegExp(this.selectedUrlPattern)
          if (re.test(a.href)) {
            a.dataset.selected = 'true'
          } else {
            delete a.dataset.selected
          }
        }
      }
    }
  }

  protected override firstUpdated(_changedProperties: PropertyValueMap<this>): void {
    this.updateSelected()
    super.firstUpdated(_changedProperties)
  }

  override render() {
    return html`<slot @slotchange=${this.handleSlotChange}></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-hyperlink-list': HyperlinkList
  }
}
