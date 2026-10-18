import { html, nothing, type ReactiveController, type ReactiveControllerHost, type TemplateResult } from 'lit'

/**
 * Shared contract between a field wrapper — a `c2-form-field` — and the control inside it, so neither package has to
 * depend on the other.
 *
 * The control's focusable element lives in its shadow root, out of reach of the field's ids: `for`,
 * `aria-labelledby` and `aria-describedby` resolve inside one tree only. So the field hands the control its label and
 * description as *text*, and the control puts them on its own focusable element, where the ids share one tree. Nothing
 * is written on the host or on light-DOM children.
 *
 * Enrollment works in both upgrade orders: a consumer announces itself with `FIELD_CONNECT_EVENT` when its host
 * connects, and a field that upgrades later finds the consumer through {@link fieldConsumerOf}.
 */

/** Fired by a consumer when its host connects, so an enclosing field can claim it. Bubbles and is composed; the field stops it. */
export const FIELD_CONNECT_EVENT = 'c2-field-connect'

export interface FieldConnectEventDetail {
  consumer: FieldContextConsumer
}

/**
 * What the control is, so the field picks the right built-in message: `text` ("Enter …"), `choice` (a select, "Select
 * …") or `check` (a checkbox or switch, "Check this box …").
 */
export type FieldControlKind = 'text' | 'choice' | 'check'

/** What a field shares with its control. */
export interface FieldState {
  /** Accessible name for the control's focusable element; empty when the field has no label. */
  label: string
  /** Hint, then the shown error or warning, already joined and prefixed ("Error: …"). */
  description: string
  /** True while the field shows an error, so the control draws its own invalid look (border, `aria-invalid`). */
  invalid: boolean
}

export interface FieldConsumerOptions {
  kind?: FieldControlKind
  /**
   * The control is named by its own slotted text (a checkbox, a switch), so the field's label must not replace that
   * name. The field then draws no label row unless it has a label of its own, and passes that label as description.
   */
  selfLabelled?: boolean
}

const consumerKey = Symbol.for('c2n.field-consumer')

type ConsumerHost = ReactiveControllerHost & HTMLElement & { [consumerKey]?: FieldContextConsumer }

/** The consumer a control registered, or `undefined` when the element does not take part in the protocol (a native input). */
export function fieldConsumerOf(element: Element | null | undefined): FieldContextConsumer | undefined {
  return (element as ConsumerHost | null | undefined)?.[consumerKey]
}

/**
 * The control's side of the protocol. Create one in the control's constructor and read it in `render()`:
 *
 * ```ts
 * private readonly field = new FieldContextConsumer(this, { kind: 'text' })
 * // …
 * html`<input aria-label=${this.ariaLabel || this.field.label || nothing} aria-describedby=${this.field.describedBy()}
 *   aria-invalid=${this.error || this.field.invalid ? 'true' : nothing} />${this.field.renderDescription()}`
 * ```
 *
 * While {@link managed} is true the field draws the hint, error and counter, so the control hides its own line.
 */
export class FieldContextConsumer implements ReactiveController {
  /** The id of the hidden description element {@link renderDescription} draws in the control's shadow root. */
  static readonly descriptionId = 'c2-field-description'

  readonly kind: FieldControlKind
  readonly selfLabelled: boolean

  private state: FieldState | undefined
  private owner: Element | null = null
  private pending: { owner: Element; state: FieldState } | undefined
  /** A declarative shadow root is attached before the element upgrades: the host was rendered on the server. */
  private readonly serverRendered: boolean

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    options: FieldConsumerOptions = {},
  ) {
    this.kind = options.kind ?? 'text'
    this.selfLabelled = options.selfLabelled ?? false
    this.serverRendered = host.shadowRoot !== null
    ;(host as ConsumerHost)[consumerKey] = this
    host.addController(this)
  }

  hostConnected() {
    this.host.dispatchEvent(new CustomEvent<FieldConnectEventDetail>(FIELD_CONNECT_EVENT, { bubbles: true, composed: true, detail: { consumer: this } }))
  }

  /** Called by the field that claims this control, and again on every change of what it shows. */
  attach(owner: Element, state: FieldState) {
    // The first render of a server-rendered control hydrates what the server drew, which had no field around it:
    // a label or description now would not match. Apply them once that render is done.
    if (this.serverRendered && !(this.host as { hasUpdated?: boolean }).hasUpdated) {
      const queued = this.pending !== undefined
      this.pending = { owner, state }
      if (!queued) {
        void this.host.updateComplete.then(() => {
          const pending = this.pending
          this.pending = undefined
          if (pending) this.attach(pending.owner, pending.state)
        })
      }
      return
    }
    const changed =
      this.owner !== owner || this.state?.label !== state.label || this.state?.description !== state.description || this.state?.invalid !== state.invalid
    this.owner = owner
    this.state = state
    if (changed) this.host.requestUpdate()
  }

  /** Called by the field when the control leaves it. A call from a field that no longer owns the control is ignored. */
  detach(owner: Element) {
    if (this.pending?.owner === owner) this.pending = undefined
    if (this.owner !== owner) return
    this.owner = null
    this.state = undefined
    this.host.requestUpdate()
  }

  /** True while a field draws the label, hint and error around this control. */
  get managed() {
    return this.state !== undefined
  }

  get label() {
    return this.state?.label ?? ''
  }

  get description() {
    return this.state?.description ?? ''
  }

  get invalid() {
    return this.state?.invalid ?? false
  }

  /** `aria-describedby` for the focusable element: the control's own ids, then the field's description. */
  describedBy(...own: (string | null | undefined | false)[]): string | typeof nothing {
    const ids = own.filter((id): id is string => !!id)
    if (this.description) ids.push(FieldContextConsumer.descriptionId)
    return ids.length > 0 ? ids.join(' ') : nothing
  }

  /** The hidden element that holds the description; render it anywhere in the control's shadow root. */
  renderDescription(): TemplateResult | typeof nothing {
    if (!this.description) return nothing
    return html`<span id=${FieldContextConsumer.descriptionId} hidden>${this.description}</span>`
  }
}
