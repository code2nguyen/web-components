import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import styles from './label.scss?inline'

let labelCount = 0

/**
 * Caption for a form control. Clicking it activates the element referenced by `for`: native checkboxes and radios
 * (also the ones inside a component's shadow root, such as `c2-checkbox`) are toggled, anything else is focused.
 * It also names that element for assistive technology by setting `aria-labelledby` when the target has none.
 * Typography inherits from the surrounding text until a `--c2-label__container--*` variable is set.
 *
 * @tag c2-label
 *
 * @slot default - Label text.
 * @slot required-indicator - Marker shown after the text when `required` is set. Defaults to an asterisk.
 *
 * @cssproperty {pixel} [--c2-label__container--gap=4px]
 * @cssproperty {color} [--c2-label__container--color=inherit]
 * @cssproperty {font-family} [--c2-label__container--font-family=inherit]
 * @cssproperty {pixel} [--c2-label__container--font-size=inherit]
 * @cssproperty {font-weight} [--c2-label__container--font-weight=inherit]
 * @cssproperty {line-height} [--c2-label__container--line-height=inherit]
 * @cssproperty {pixel} [--c2-label__container--letter-spacing=inherit]
 * @cssproperty {text-transform} [--c2-label__container--text-transform=inherit]
 *
 * @cssproperty {color} --c2-label__container__hover--color
 * @cssproperty {opacity} [--c2-label__container__disabled--opacity=0.38]
 *
 * @cssproperty {color} [--c2-label__required-indicator--color=rgb(211, 21, 16)]
 * @cssproperty {pixel} [--c2-label__required-indicator--font-size=inherit]
 * @cssproperty {font-weight} [--c2-label__required-indicator--font-weight=inherit]
 */
@customElement('c2-label')
export class Label extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Disables the label: clicks no longer reach the control and the text is dimmed. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Shows the required indicator after the text. */
  @property({ type: Boolean, reflect: true }) required = false

  /** `id` of the control this label describes. It is looked up in the label's own root, then among its siblings. */
  @property({ type: String, reflect: true }) for = ''

  private linkedTarget: HTMLElement | null = null

  constructor() {
    super()
    this.addEventListener('click', this.handleClick)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.unlinkTarget()
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    if (changed.has('for')) this.linkTarget()
  }

  private resolveTarget(): HTMLElement | null {
    if (!this.for) return null
    const root = this.getRootNode() as Document | ShadowRoot
    const inRoot = typeof root.getElementById === 'function' ? root.getElementById(this.for) : null
    return (inRoot ?? this.parentElement?.querySelector(`#${CSS.escape(this.for)}`) ?? null) as HTMLElement | null
  }

  /** Points the target's `aria-labelledby` at this label (unless it already has one) so the label names the control. */
  private linkTarget(): void {
    this.unlinkTarget()
    const target = this.resolveTarget()
    if (!target || target.hasAttribute('aria-labelledby')) return
    if (!this.id) this.id = `c2-label-${++labelCount}`
    target.setAttribute('aria-labelledby', this.id)
    this.linkedTarget = target
  }

  private unlinkTarget(): void {
    if (this.linkedTarget?.getAttribute('aria-labelledby') === this.id) {
      this.linkedTarget.removeAttribute('aria-labelledby')
    }
    this.linkedTarget = null
  }

  private handleClick = (event: Event): void => {
    if (this.disabled || event.defaultPrevented) return
    const target = this.resolveTarget()
    if (!target) return

    const toggle = (el: Element | null | undefined) => el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
    if (toggle(target)) {
      target.click()
      return
    }
    const inner = target.shadowRoot?.querySelector('input[type="checkbox"], input[type="radio"]')
    if (toggle(inner)) {
      ;(inner as HTMLInputElement).click()
      return
    }
    target.focus()
  }

  override render() {
    return html`<span class="c2-label" part="label"
      ><slot></slot>${
        this.required
          ? html`<span class="c2-label__required" part="required-indicator" aria-hidden="true"><slot name="required-indicator">*</slot></span>`
          : nothing
      }</span
    >`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-label': Label
  }
}
