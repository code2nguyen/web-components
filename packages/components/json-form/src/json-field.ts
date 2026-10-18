import { LitElement, nothing, unsafeCSS } from 'lit'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { JsonForm } from './json-form'
import type { UiElement, UiOptions } from './types'
import styles from './json-form.scss?inline'

let nextFieldId = 0

/**
 * Places one field of the enclosing `c2-json-form` in your own markup. Put these, with any HTML and CSS around them,
 * inside the form and they replace its generated layout: the form still owns the value, validation and events, and
 * each field renders the control (with its label, hint and error) for the data its `scope` names.
 *
 * `scope="*"` renders every field that no other `c2-json-field` of the form places, so a field added to the schema
 * still shows up. A scope naming an object renders the object's group.
 *
 * @tag c2-json-field
 */
@customElement('c2-json-field')
export class JsonField extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The data this field edits: `#/properties/billing/properties/zip`, the shorthand `billing.zip`, or `*` for the rest. */
  @property({ type: String }) scope = ''

  /** Replaces the schema's `title`. */
  @property({ type: String }) label: string | undefined = undefined

  /** The control's UI schema options, e.g. `{"widget": "textarea"}`. A JSON string is parsed. */
  @property({ converter: jsonPropertyConverter }) options: UiOptions | undefined = undefined

  private form: JsonForm | null = null
  private readonly idPrefix = `jf${++nextFieldId}-`

  override connectedCallback() {
    super.connectedCallback()
    this.form = this.closest('c2-json-form')
    this.form?.connectField(this)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.form?.disconnectField(this)
    this.form = null
  }

  protected override render() {
    if (!this.form || !this.scope) return nothing
    const element: UiElement = { type: 'Control', scope: this.scope, options: this.options, label: this.label }
    return this.form.renderField(element, this.idPrefix)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-json-field': JsonField
  }
}
