import { LitElement, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { ViewToggleConfig } from './view-options-types'
import { VIEW_CHILD_CHANGE } from './view-field'

/**
 * One switch in the Show section of a `c2-view-options`, written in markup. Renders nothing: the parent reads it. A
 * `toggles` array set on the parent replaces every `c2-view-toggle` child.
 *
 * @tag c2-view-toggle
 */
@customElement('c2-view-toggle')
export class ViewToggle extends LitElement {
  /** Key of the switch in `value.show`. */
  @property() key = ''

  /** Text shown next to the switch. Defaults to the element's text, then to `key`. */
  @property() label = ''

  /** State used while `value.show` has no entry for this key. */
  @property({ type: Boolean }) checked = false

  /** The toggle as the parent reads it. */
  toConfig(): ViewToggleConfig {
    return { key: this.key, label: this.label || this.textContent?.trim() || this.key, checked: this.checked }
  }

  protected override createRenderRoot() {
    return this
  }

  protected override updated(_changed: PropertyValues<this>) {
    this.dispatchEvent(new Event(VIEW_CHILD_CHANGE, { bubbles: true }))
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-view-toggle': ViewToggle
  }
}
