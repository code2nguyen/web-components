import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { syncRadioSemantics } from '@c2n/core/dom-helper.js'
import styles from './button.scss?inline'

/** Invoker commands (`commandfor`/`command`) are Baseline newly available; without them the target's own fallback runs. */
const nativeCommands = !isServer && 'commandForElement' in HTMLButtonElement.prototype
/** ARIA element reflection (`ariaControlsElements`): the only way an id outside the shadow root reaches the inner button. */
const elementReflection = !isServer && 'ariaControlsElements' in Element.prototype

/**
 * Action button with optional leading/trailing icons, busy state and toggle-button semantics.
 *
 * Like a native `<button>`, it can be an invoker: `commandfor="<id>"` + `command` send the command to that element
 * (`show-modal`, `toggle-popover`, or a custom `--name` that arrives as a `command` event). `aria-expanded`,
 * `aria-haspopup` and `aria-controls` written on the host are handed to the inner button, so a disclosure trigger reports
 * its state and a button that opens a dialog or a menu says so.
 *
 * @tag c2-button
 *
 * @slot default - Button label text.
 * @slot prefix-icon - Icon shown before the label. Replaced by `running-icon` while the button is running.
 * @slot suffix-icon - Icon shown after the label.
 * @slot running-icon - Icon shown in place of the prefix icon while `running` is set. Defaults to a spinner; the slot wrapper rotates, so slotted content spins too.
 *
 * @csspart button - The native button that provides the interactive surface.
 * @csspart running-icon - Wrapper containing the `running-icon` slot or spinner fallback while `running` is set.
 *
 * @cssproperty {pixel} [--c2-button__container--height=36px]
 * @cssproperty {width} [--c2-button__container--width=auto] - Width of the host. `100%` makes a full-width button.
 * @cssproperty {justify-content} [--c2-button__container--justify-content=center] - How the label and its icons sit in the button. `flex-start` for a row-shaped button (a list entry, a group header), `space-between` to push a trailing hint to the far edge.
 * @cssproperty {number} [--c2-button__label--flex-grow=0] - Whether the label takes the leftover width. `1` pushes a suffix icon to the far edge of a fixed-width button.
 * @cssproperty {justify-content} [--c2-button__label--justify-content=center] - How the label sits once it has grown. `flex-start` keeps the text next to a prefix icon.
 * @cssproperty {padding} [--c2-button__container--padding-left=16px]
 * @cssproperty {padding} [--c2-button__container--padding-right=16px]
 * @cssproperty {pixel} [--c2-button__container--gap=8px]
 * @cssproperty {border-radius} [--c2-button__container--border-radius=6px]
 * @cssproperty {border} [--c2-button__container--border=1px solid transparent]
 * @cssproperty {box-shadow} [--c2-button__container--box-shadow=none]
 * @cssproperty {color} [--c2-button__container--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-button__container--color=#ffffff]
 * @cssproperty {pixel} [--c2-button__container--font-size=14px]
 * @cssproperty {font-weight} [--c2-button__container--font-weight=500]
 *
 * @cssproperty {color} [--c2-button__container__hover--background-color=rgb(1, 84, 184)]
 * @cssproperty {color} --c2-button__container__hover--color
 * @cssproperty {border} --c2-button__container__hover--border
 * @cssproperty {box-shadow} --c2-button__container__hover--box-shadow
 *
 * @cssproperty {color} [--c2-button__container__active--background-color=rgb(1, 70, 154)]
 *
 * @cssproperty {color} --c2-button__container__selected--background-color - Pressed state of a toggle button (see `selected`).
 * @cssproperty {color} --c2-button__container__selected--color
 * @cssproperty {border} --c2-button__container__selected--border
 * @cssproperty {box-shadow} --c2-button__container__selected--box-shadow
 *
 * @cssproperty {outline} [--c2-button__container__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-button__container__focus--outline-offset=2px]
 *
 * @cssproperty {opacity} [--c2-button__container__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-button__icon--size=18px]
 * @cssproperty {color} --c2-button__icon--color
 *
 * @cssproperty {pixel} [--c2-button__running-icon--size=18px]
 * @cssproperty {color} --c2-button__running-icon--color
 * @cssproperty {duration} [--c2-button__running-icon--animation-duration=800ms]
 */
@customElement('c2-button')
export class Button extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  private readonly internals = isServer ? undefined : this.attachInternals()
  private formDisabled = false

  private get unavailable(): boolean {
    return this.disabled || this.running || this.formDisabled
  }

  /** Disables the button: it no longer receives clicks and is rendered dimmed. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Marks the button as busy: clicks are ignored and the `running-icon` slot replaces the prefix icon. */
  @property({ type: Boolean, reflect: true }) running = false

  /** Pressed state of a toggle button (`aria-pressed="true"`); styled with the `container__selected--*` variables. */
  @property({ type: Boolean, reflect: true }) selected = false

  /** Declares a toggle button: `aria-pressed` is announced as `false` while not selected. Set by `c2-button-group` in selection modes. */
  @property({ type: Boolean, reflect: true }) toggle = false

  /**
   * Declares the item a radio button of a single-selection `c2-button-group`: the `radio` role with `aria-checked`
   * (from `selected`) in place of `aria-pressed`, so a screen reader announces "radio button, 2 of 3" and the arrow
   * keys the group answers to. Set by the group.
   */
  @property({ type: Boolean }) radio = false

  /** Native button behavior. `submit` submits the nearest form and `reset` restores it. */
  @property({ reflect: true }) type: 'button' | 'submit' | 'reset' = 'button'

  /** Stable identity used by `c2-button-group` and included in submitted form data when `name` is set. */
  @property({ reflect: true }) value = ''

  /** Form field name used with `value` when the button is the control that submits the form. */
  @property({ reflect: true }) name = ''

  /** Accessible name forwarded to the inner `<button>`. Set it on an icon-only button or one whose visible text is not its name. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /**
   * Id of the element this button sends its `command` to, as on a native `<button>` (invoker commands). Looked up in
   * the button's own document or shadow root when the button is pressed. A `submit` or `reset` button of a form does not invoke.
   */
  @property({ attribute: 'commandfor', reflect: true }) commandFor = ''

  /**
   * Command sent to the `commandfor` element: a built-in one (`show-modal`, `close`, `toggle-popover`, …) or a custom
   * `--name`, which reaches the target as a `command` event whose `source` is this button.
   */
  @property({ reflect: true }) command = ''

  /** Expanded state of the content this button shows or hides (`"true"`/`"false"`), forwarded to the inner `<button>`. */
  @property({ attribute: 'aria-expanded' }) override ariaExpanded: string | null = null

  /** Kind of popup this button opens (`"dialog"`, `"menu"`, `"listbox"`, …), forwarded to the inner `<button>`. */
  @property({ attribute: 'aria-haspopup' }) override ariaHasPopup: string | null = null

  /**
   * Ids (space-separated) of the elements this button controls, looked up in the button's own document or shadow root
   * and handed to the inner `<button>` as element references, since an id does not cross the shadow boundary. They are
   * looked up again when the attribute changes and when the button gets focus or is pressed.
   */
  @property({ attribute: 'aria-controls' }) ariaControls: string | null = null

  @query('button', true) private readonly innerButton!: HTMLButtonElement | null

  /** The associated form, matching the native button API. */
  get form(): HTMLFormElement | null {
    return this.internals?.form ?? null
  }

  protected override updated(changed: PropertyValues<this>) {
    if (changed.has('commandFor') || changed.has('type') || changed.has('ariaControls')) this.resolveReferences()
    if (changed.has('disabled') || changed.has('running')) {
      if (this.unavailable) this.internals?.states.add('disabled')
      else this.internals?.states.delete('disabled')
    }
  }

  formDisabledCallback(disabled: boolean) {
    this.formDisabled = disabled
    if (this.unavailable) this.internals?.states.add('disabled')
    else this.internals?.states.delete('disabled')
    // Reflection of `disabled` invokes this callback during Lit's update, after
    // render has already read `formDisabled`. Schedule a fresh render afterwards.
    queueMicrotask(() => this.requestUpdate())
  }

  private byId(id: string): Element | null {
    const root = this.getRootNode() as Document | ShadowRoot
    return id && root.getElementById ? root.getElementById(id) : null
  }

  /** Points the inner button at the `commandfor` and `aria-controls` elements, which may have been added since. */
  private resolveReferences() {
    const button = this.innerButton
    if (!button) return
    if (nativeCommands) {
      // As natively, a submit or reset button of a form submits or resets it instead.
      const target = this.type === 'button' || !this.form ? this.byId(this.commandFor) : null
      if (button.commandForElement !== target) button.commandForElement = target
    }
    if (elementReflection) {
      const controls = (this.ariaControls ?? '').split(/\s+/).flatMap((id) => this.byId(id) ?? [])
      if (controls.length || button.ariaControlsElements) button.ariaControlsElements = controls.length ? controls : null
    }
  }

  private handleClick = () => {
    // Runs before the button's activation behaviour, which reads `commandForElement`.
    this.resolveReferences()
    if (this.unavailable) return
    if (this.type === 'reset') {
      if (this.form) HTMLFormElement.prototype.reset.call(this.form)
      return
    }
    if (this.type !== 'submit' || !this.form) return
    this.internals?.setFormValue(this.name ? this.value : null)
    HTMLFormElement.prototype.requestSubmit.call(this.form)
    this.internals?.setFormValue(null)
  }

  /**
   * A hydrating first render keeps the server's attributes, and the server never knows the item is a radio (its group
   * says so on the client): put the radio semantics on the inner button once. Later renders bind them as usual.
   */
  protected override firstUpdated() {
    if (this.radio) syncRadioSemantics(this.renderRoot.querySelector<HTMLElement>('button.c2-button'), true, this.selected)
  }

  override render() {
    return html`
      <button
        class="c2-button"
        part="button"
        ?disabled=${this.unavailable}
        aria-label=${this.ariaLabel || nothing}
        aria-busy=${this.running ? 'true' : nothing}
        role=${this.radio ? 'radio' : nothing}
        aria-checked=${this.radio ? String(this.selected) : nothing}
        aria-pressed=${this.radio ? nothing : this.selected ? 'true' : this.toggle ? 'false' : nothing}
        aria-expanded=${this.ariaExpanded || nothing}
        aria-haspopup=${this.ariaHasPopup || nothing}
        command=${this.command || nothing}
        type="button"
        @click=${this.handleClick}
        @focus=${this.resolveReferences}
      >
        ${
          this.running
            ? html`<span class="running-icon" part="running-icon">
                <slot name="running-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" focusable="false">
                    <path d="M21 12a9 9 0 1 1-6.22-8.56"></path>
                  </svg>
                </slot>
              </span>`
            : html`<slot name="prefix-icon" class="icon prefix-icon"></slot>`
        }
        <span class="label"><slot></slot></span>
        <slot name="suffix-icon" class="icon suffix-icon"></slot>
      </button>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-button': Button
  }
}
