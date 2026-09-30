import { LitElement, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './command-separator.scss?inline'

/**
 * A divider between rows or groups of a `c2-command`. It divides the full list only: the palette hides every separator
 * while a query is typed, so the groups that survive the filter stand on their own. Purely presentational (`role="none"`);
 * a native `<hr>` is not allowed inside the palette's `listbox`.
 *
 * @tag c2-command-separator
 *
 * @cssproperty {color} [--c2-command-separator--color=#e4e4e7]
 * @cssproperty {margin} [--c2-command-separator--margin=4px -4px]
 */
@customElement('c2-command-separator')
export class CommandSeparator extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Set by the palette while a query is typed. */
  @property({ attribute: false }) filtered = false

  private readonly internals = this.attachInternals()

  protected override updated(changed: PropertyValues<this>): void {
    this.internals.role = 'none'
    if (!changed.has('filtered')) return
    try {
      if (this.filtered) this.internals.states.add('filtered')
      else this.internals.states.delete('filtered')
    } catch {
      // Browsers without CustomStateSet keep the line.
    }
  }

  override render() {
    return nothing
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-command-separator': CommandSeparator
  }
}
