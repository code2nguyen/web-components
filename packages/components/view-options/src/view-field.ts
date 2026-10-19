import { LitElement, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { ViewField as ViewFieldConfig } from './view-options-types'

/** Private protocol event: a `c2-view-field` or `c2-view-toggle` changed, so its `c2-view-options` re-reads its children. */
export const VIEW_CHILD_CHANGE = 'c2-view-child-change'

/**
 * One field of a `c2-view-options`, written in markup. Renders nothing: the parent reads it. A `fields` array set on
 * the parent replaces every `c2-view-field` child.
 *
 * @tag c2-view-field
 */
@customElement('c2-view-field')
export class ViewField extends LitElement {
  /** Id of the field: the value stored in `groupBy`, `orderBy[].field` and `properties`. */
  @property() field = ''

  /** Text shown for the field. Defaults to the element's text, then to `field`. */
  @property() label = ''

  /** Tag name of an icon element shown before the label, e.g. `c2-feather-user`. */
  @property() icon = ''

  /** Offer the field under Grouping and Sub-grouping. */
  @property({ type: Boolean }) groupable = false

  /** Offer the field under Ordering. */
  @property({ type: Boolean }) orderable = false

  /** Offer the field under Display properties. */
  @property({ type: Boolean }) property = false

  /** The field as the parent reads it. */
  toConfig(): ViewFieldConfig {
    return {
      id: this.field,
      label: this.label || this.textContent?.trim() || this.field,
      icon: this.icon || undefined,
      groupable: this.groupable,
      orderable: this.orderable,
      property: this.property,
    }
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
    'c2-view-field': ViewField
  }
}
