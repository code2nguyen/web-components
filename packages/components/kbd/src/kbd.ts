import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from 'lit/decorators.js'
import styles from './kbd.scss?inline'

/**
 * Displays a keyboard key or shortcut with the semantics of the native `kbd` element. Use one element for a complete
 * shortcut (`Ctrl + K`) or place several beside descriptive text. The component is presentational and never enters the
 * tab order; when it repeats a shortcut already announced by a surrounding control, set `aria-hidden="true"` on the
 * host.
 *
 * @tag c2-kbd
 *
 * @slot - Key name or shortcut to display.
 *
 * @cssproperty {pixel} [--c2-kbd--min-width=24px]
 * @cssproperty {pixel} [--c2-kbd--height=24px]
 * @cssproperty {padding} [--c2-kbd--padding-left=6px]
 * @cssproperty {padding} [--c2-kbd--padding-right=6px]
 * @cssproperty {pixel} [--c2-kbd--gap=4px] - Space between multiple slotted nodes.
 * @cssproperty {color} [--c2-kbd--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-kbd--color=#3f3f46]
 * @cssproperty {border} [--c2-kbd--border=1px solid #d4d4d8]
 * @cssproperty {border-radius} [--c2-kbd--border-radius=5px]
 * @cssproperty {box-shadow} [--c2-kbd--box-shadow=0 1px 0 #a1a1aa]
 * @cssproperty {font-family} [--c2-kbd--font-family=ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace]
 * @cssproperty {font-size} [--c2-kbd--font-size=12px]
 * @cssproperty {font-weight} [--c2-kbd--font-weight=500]
 * @cssproperty {line-height} [--c2-kbd--line-height=1]
 * @cssproperty {pixel} [--c2-kbd--letter-spacing=0.01em]
 * @cssproperty {text-transform} [--c2-kbd--text-transform=none]
 */
@customElement('c2-kbd')
export class Kbd extends LitElement {
  static override styles = unsafeCSS(styles)

  override render() {
    return html`<kbd class="c2-kbd" part="kbd"><slot></slot></kbd>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-kbd': Kbd
  }
}
