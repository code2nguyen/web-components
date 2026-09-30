import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './command-group.scss?inline'

/**
 * A labelled group of `c2-command-item` rows inside a `c2-command`. The palette hides the whole group, heading
 * included, while none of its rows matches the query.
 *
 * @tag c2-command-group
 *
 * @slot default - The `c2-command-item` rows of the group.
 * @slot heading - Rich heading content; replaces the `heading` text.
 *
 * @csspart heading - Heading region wrapping the `heading` slot and the `heading` text fallback; assigned content keeps its own styles.
 *
 * @cssproperty {color} [--c2-command-group__heading--color=#71717a]
 * @cssproperty {font-size} [--c2-command-group__heading--font-size=12px]
 * @cssproperty {font-weight} [--c2-command-group__heading--font-weight=500]
 * @cssproperty {letter-spacing} --c2-command-group__heading--letter-spacing
 * @cssproperty {text-transform} --c2-command-group__heading--text-transform
 * @cssproperty {padding} [--c2-command-group__heading--padding-top=8px]
 * @cssproperty {padding} [--c2-command-group__heading--padding-right=8px]
 * @cssproperty {padding} [--c2-command-group__heading--padding-bottom=4px]
 * @cssproperty {padding} [--c2-command-group__heading--padding-left=8px]
 */
@customElement('c2-command-group')
export class CommandGroup extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Heading text shown above the rows; also the group's accessible name. */
  @property({ reflect: true }) heading = ''

  /** Set by the palette while no row of the group matches the query; the group is then not rendered. */
  @property({ attribute: false }) filtered = false

  private readonly internals = this.attachInternals()

  protected override updated(changed: PropertyValues<this>): void {
    this.internals.role = 'group'
    this.internals.ariaLabel = this.heading || null
    if (changed.has('filtered')) {
      try {
        if (this.filtered) this.internals.states.add('filtered')
        else this.internals.states.delete('filtered')
      } catch {
        // Browsers without CustomStateSet still skip rendering the group.
      }
    }
  }

  override render() {
    if (this.filtered) return nothing
    return html`<div class="heading" part="heading" aria-hidden="true"><slot name="heading">${this.heading}</slot></div>
      <div class="items"><slot></slot></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-command-group': CommandGroup
  }
}
