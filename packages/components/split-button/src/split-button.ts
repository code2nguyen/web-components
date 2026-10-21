import { LitElement, html, isServer, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { Menu, MenuSelectEventDetail, Placement } from '@c2n/menu'
import { MenuItem } from '@c2n/menu/menu-item.js'
import { splitButtonMessages } from './messages'
import styles from './split-button.scss?inline'

import '@c2n/menu'

export type { MenuSelectEventDetail, Placement }

/** Detail of the `action` event. */
export interface SplitButtonActionDetail {
  /** `value` of the control: in choice mode, the chosen row's value. */
  value: string
}

/** Events fired by {@link SplitButton}, keyed for `addEventListener`. */
export interface SplitButtonEventMap {
  action: CustomEvent<SplitButtonActionDetail>
  'menu-select': CustomEvent<MenuSelectEventDetail>
  input: Event
  change: Event
  toggle: ToggleEvent
}

export interface SplitButton {
  addEventListener: TypedAddEventListener<SplitButton, SplitButtonEventMap>
  removeEventListener: TypedRemoveEventListener<SplitButton, SplitButtonEventMap>
}

/** The text a row is known by, read from its light DOM so it works before the row has rendered: `label`, else the text outside its named slots, else `value`. */
function rowText(item: MenuItem): string {
  if (item.label !== undefined && item.label !== null) return item.label
  const text = [...item.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE || (node instanceof Element && !node.hasAttribute('slot')))
    .map((node) => node.textContent ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return text || item.value
}

/**
 * A main action with a caret that opens a menu of alternatives: "Send ▾", "Merge pull request ▾", or a microphone
 * toggle with its device menu. The two halves are two native buttons, so the control has two tab stops; the caret is a
 * menu button (Enter, Space or ArrowDown open the menu on the first row, ArrowUp on the last, Escape closes it and
 * returns focus) and the menu is a `c2-menu` anchored to the whole control, never narrower than it.
 *
 * In the default `fixed` mode the main action never changes: activating it fires `action`, picking a row fires
 * `menu-select`. In `choice` mode the rows are radios: the checked one names the main half and is the control's
 * `value`, and picking another changes the choice (`input` then `change`) instead of running it.
 *
 * Use it only when one action is clearly the most common; otherwise a `c2-button-group` or a `c2-menu` with a button
 * trigger says more. Listen for `action`, not `click`: clicks on the menu rows bubble through the host.
 *
 * @tag c2-split-button
 *
 * @slot default - The main half's label. Ignored in choice mode, where the chosen row names it.
 * @slot prefix-icon - Icon before the label. Replaced by `running-icon` while `running` is set.
 * @slot running-icon - Shown in place of the prefix icon while `running`. Defaults to a spinner; the wrapper rotates.
 * @slot caret-icon - The caret's icon. Defaults to a chevron, which turns while the menu is open.
 * @slot menu - The rows: `c2-menu-item` elements, `<hr>` separators and `<h1>`–`<h6>` group headings.
 *
 * @csspart main - The native button of the main action.
 * @csspart caret - The native button that opens the menu.
 *
 * @event {CustomEvent<SplitButtonActionDetail>} action - The main half was activated while available. Cancelable: cancelling it also cancels a form submit or reset.
 * @event {CustomEvent<MenuSelectEventDetail>} menu-select - A row was activated (from `c2-menu-item`, unchanged). In choice mode, `preventDefault()` keeps the current choice.
 * @event {Event} input - Choice mode: a pick changed `value`. Fires before `change`.
 * @event {Event} change - Choice mode: a pick changed `value`. Not fired when `value` is set from code.
 * @event {ToggleEvent} toggle - The menu opened or closed; `newState` is `open` or `closed`.
 *
 * @cssproperty {pixel} [--c2-split-button--height=36px]
 * @cssproperty {width} [--c2-split-button--width=auto] - Width of the control. `100%` makes the main half grow.
 * @cssproperty {border-radius} [--c2-split-button--border-radius=6px] - Outer corners. `999px` gives a pill.
 * @cssproperty {pixel} [--c2-split-button--gap=0px] - Space between the halves. `0px` joins them with a divider; a gap rounds the inner corners too.
 * @cssproperty {border-radius} --c2-split-button--inner-border-radius - Inner corners. Defaults to square when joined and to the outer radius when split.
 * @cssproperty {pixel} [--c2-split-button--font-size=14px]
 * @cssproperty {font-weight} [--c2-split-button--font-weight=500]
 * @cssproperty {duration} [--c2-split-button__transition--duration=150ms] - Colour changes and the chevron turn. `0s` under reduced motion.
 *
 * @cssproperty {padding} [--c2-split-button__main--padding-left=16px]
 * @cssproperty {padding} [--c2-split-button__main--padding-right=16px]
 * @cssproperty {pixel} [--c2-split-button__main--gap=8px] - Space between the icon and the label.
 * @cssproperty {color} [--c2-split-button__main--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-split-button__main--color=#ffffff]
 * @cssproperty {border} [--c2-split-button__main--border=1px solid transparent]
 * @cssproperty {border} --c2-split-button__main--border-right - The main half's edge against the caret. `none` lets an outlined caret's border be the seam.
 * @cssproperty {color} [--c2-split-button__main__hover--background-color=rgb(1, 84, 184)]
 * @cssproperty {color} --c2-split-button__main__hover--color
 * @cssproperty {color} [--c2-split-button__main__active--background-color=rgb(1, 70, 154)]
 * @cssproperty {color} --c2-split-button__main__selected--background-color - Pressed state of a `toggle` main half.
 * @cssproperty {color} --c2-split-button__main__selected--color
 * @cssproperty {pixel} [--c2-split-button__icon--size=18px] - Prefix and running icons.
 *
 * @cssproperty {pixel} [--c2-split-button__caret--min-width=36px]
 * @cssproperty {pixel} [--c2-split-button__caret--min-width-coarse=44px] - Caret width on a touch screen.
 * @cssproperty {padding} [--c2-split-button__caret--padding=0 8px]
 * @cssproperty {color} [--c2-split-button__caret--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-split-button__caret--color=#ffffff]
 * @cssproperty {border} [--c2-split-button__caret--border=1px solid transparent]
 * @cssproperty {color} [--c2-split-button__caret__hover--background-color=rgb(1, 84, 184)]
 * @cssproperty {color} [--c2-split-button__caret__active--background-color=rgb(1, 70, 154)]
 * @cssproperty {color} [--c2-split-button__caret__open--background-color=rgb(1, 70, 154)] - The caret while the menu is open.
 * @cssproperty {border-radius} --c2-split-button__caret__open--border-radius - The caret's corners while open, e.g. the outer radius for a split caret that becomes a pill.
 * @cssproperty {pixel} [--c2-split-button__caret__icon--size=16px]
 * @cssproperty {angle} [--c2-split-button__caret__icon__open--rotate=180deg] - Turn of the caret icon while open. `0deg` for an icon that should not turn.
 *
 * @cssproperty {pixel} [--c2-split-button__divider--width=1px] - Hidden when the halves have a gap.
 * @cssproperty {color} [--c2-split-button__divider--color=color-mix(in srgb, currentColor 40%, transparent)]
 * @cssproperty {pixel} [--c2-split-button__divider--inset=0px] - Space left above and below the divider.
 *
 * @cssproperty {outline} [--c2-split-button__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-split-button__focus--outline-offset=2px]
 * @cssproperty {opacity} [--c2-split-button__disabled--opacity=0.38] - The whole control, or the main half alone under `main-disabled`.
 *
 * @cssproperty {pixel} [--c2-split-button__menu--min-width=128px] - Floor for the menu, which is never narrower than the control.
 *
 * @internalcomponent c2-menu
 * @slotcomponent c2-menu-item
 */
@customElement('c2-split-button')
export class SplitButton extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  /** `fixed`: the main action never changes. `choice`: the rows are radios and the checked one is the main action. */
  @property() mode: 'fixed' | 'choice' = 'fixed'

  /** Fixed mode: submitted with `name` when the main half submits a form. Choice mode: the chosen row's `value`. */
  @property() value = ''

  /** Form field name submitted with `value`. Reflects: a form-associated element is submitted under its `name` attribute. */
  @property({ reflect: true }) name = ''

  /** What the main half does in a form. */
  @property() type: 'button' | 'submit' | 'reset' = 'button'

  /** Accessible name of the main half when it shows only an icon, or when its text is not its name. */
  @property() label = ''

  /** Accessible name of the caret. Defaults to "More {label} options", or "More options" without a label. */
  @property({ attribute: 'caret-label' }) caretLabel = ''

  /** Disables both halves. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Disables only the main half: it stays focusable and announced, and the menu stays usable. */
  @property({ type: Boolean, reflect: true, attribute: 'main-disabled' }) mainDisabled = false

  /** Marks the main half as busy: the `running-icon` shows and activation is ignored. The caret still works. */
  @property({ type: Boolean, reflect: true }) running = false

  /** Makes the main half a toggle button (`aria-pressed`), e.g. mute. */
  @property({ type: Boolean, reflect: true }) toggle = false

  /** Pressed state of a `toggle` main half. Activating the main half flips it. */
  @property({ type: Boolean, reflect: true }) selected = false

  /** Whether the menu is open. Set it to open or close the menu from code. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Preferred placement of the menu (floating-ui names); it flips near the viewport edge. */
  @property() placement: Placement = 'bottom-end'

  @query('.main') private mainButton?: HTMLButtonElement

  @query('.caret') private caretButton?: HTMLButtonElement

  @query('c2-menu') private menu?: Menu

  @query('slot[name="menu"]') private menuSlot?: HTMLSlotElement

  /** Text of the default slot, for the caret's name. */
  @state() private mainText = ''

  /** Name of the chosen row in choice mode. A state set after the first update, so a server render matches. */
  @state() private chosenLabel = ''

  private readonly internals = isServer ? undefined : this.attachInternals()

  private readonly msg = new LocalizeController(this, splitButtonMessages)

  private formDisabled = false

  /** Which row the menu should focus when it next opens. `open` set from code moves no focus; `show()` does. */
  private pendingFocus: 'first' | 'last' | 'none' = 'none'

  /** Row text, row `label`/`disabled`/`value` and the main label change without a slotchange. */
  private readonly contentObserver = isServer ? undefined : new MutationObserver(() => this.handleContentChange())

  constructor() {
    super()
    // On the host, not inside the shadow root, so the app's own listeners have run by the time the pick is decided.
    if (!isServer) this.addEventListener('menu-select', this.handleMenuSelect)
  }

  override connectedCallback() {
    super.connectedCallback()
    this.contentObserver?.observe(this, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['label', 'disabled', 'value'],
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.contentObserver?.disconnect()
  }

  /** The `c2-menu-item` rows slotted into `menu`. */
  get menuItems(): MenuItem[] {
    const assigned = this.menuSlot?.assignedElements({ flatten: true }) ?? [...this.querySelectorAll(':scope > [slot="menu"]')]
    return assigned.filter((element): element is MenuItem => element instanceof MenuItem)
  }

  /** The associated form, matching the native button API. */
  get form(): HTMLFormElement | null {
    return this.internals?.form ?? null
  }

  /** Choice mode: the row whose `value` is `value`, else the first enabled row. */
  private get chosenItem(): MenuItem | undefined {
    if (this.mode !== 'choice') return undefined
    const items = this.menuItems
    return items.find((item) => item.value === this.value && !item.disabled) ?? items.find((item) => !item.disabled)
  }

  private get effectiveValue(): string {
    return this.mode === 'choice' ? (this.chosenItem?.value ?? this.value) : this.value
  }

  private get bothDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  private get mainUnavailable(): boolean {
    return this.bothDisabled || this.mainDisabled || this.running
  }

  /** Opens the menu. Pass `'last'` to start on the last row, `'none'` to leave focus where it is. */
  show(focus: 'first' | 'last' | 'none' = 'first'): void {
    if (this.bothDisabled) return
    this.pendingFocus = focus
    this.open = true
  }

  hide(): void {
    this.open = false
  }

  /** Opens the menu when closed and closes it when open. */
  toggleMenu(force?: boolean): void {
    if (force ?? !this.open) this.show()
    else this.hide()
  }

  /** Focuses the main half. */
  override focus(options?: FocusOptions): void {
    this.mainButton?.focus(options)
  }

  /** Focuses the caret. */
  focusCaret(options?: FocusOptions): void {
    this.caretButton?.focus(options)
  }

  formDisabledCallback(disabled: boolean) {
    this.formDisabled = disabled
    if (disabled) this.open = false
    this.syncStates()
    queueMicrotask(() => this.requestUpdate())
  }

  formResetCallback() {
    this.internals?.setFormValue(null)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // A disabled control has no open menu, whichever way `open` was set.
    if (this.open && this.bothDisabled) this.open = false
    // Not on the first update: the rows are read once they are slotted, so a server render and its hydration agree.
    if (this.hasUpdated && (changed.has('mode') || changed.has('value'))) this.syncChoices()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('open')) {
      const menu = this.menu
      if (menu && menu.open !== this.open) {
        if (this.open) menu.show(this.pendingFocus)
        else menu.hide()
      }
      this.pendingFocus = 'none'
    }
    this.syncStates()
  }

  private syncStates() {
    const internals = this.internals
    if (!internals) return
    const states: Record<string, boolean> = {
      open: this.open,
      running: this.running,
      selected: this.toggle && this.selected,
      'main-disabled': this.mainDisabled && !this.bothDisabled,
      disabled: this.bothDisabled,
      choice: this.mode === 'choice',
    }
    for (const [name, on] of Object.entries(states)) {
      if (on) internals.states.add(name)
      else internals.states.delete(name)
    }
    // A named group only when the author named the control: two buttons need no wrapper role otherwise.
    internals.role = this.label ? 'group' : null
    internals.ariaLabel = this.label || null
  }

  /** Marks the rows as choices in choice mode (a property, never an attribute on the author's rows) and names the main half. */
  private syncChoices() {
    const items = this.menuItems
    if (this.mode !== 'choice') {
      for (const item of items) if (item.choice) item.choice = undefined
      this.chosenLabel = ''
      return
    }
    const chosen = this.chosenItem
    for (const item of items) {
      const checked = item === chosen
      if (item.choice?.checked !== checked) item.choice = { checked }
    }
    this.chosenLabel = chosen ? rowText(chosen) : ''
    // `value` names what the main half shows and submits, so a bindings layer (v-model, a ControlValueAccessor) reads
    // the same choice the user sees. Not an attribute, and no event: the author did not pick anything.
    if (chosen && chosen.value !== this.value) this.value = chosen.value
  }

  private handleMainClick = () => {
    if (this.mainUnavailable) return
    const action = new CustomEvent<SplitButtonActionDetail>('action', {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: { value: this.effectiveValue },
    })
    if (!this.dispatchEvent(action)) return
    if (this.toggle) this.selected = !this.selected
    const form = this.form
    if (!form) return
    if (this.type === 'reset') {
      HTMLFormElement.prototype.reset.call(form)
    } else if (this.type === 'submit') {
      this.internals?.setFormValue(this.name ? this.effectiveValue : null)
      HTMLFormElement.prototype.requestSubmit.call(form)
      this.internals?.setFormValue(null)
    }
  }

  /** The caret's own click is the menu's business; only `action` speaks for the control. */
  private handleMenuClick = (event: Event) => {
    if (this.caretButton && event.composedPath().includes(this.caretButton)) event.stopPropagation()
  }

  private handleMenuSelect = (event: Event) => {
    if (this.mode !== 'choice') return
    const item = event.target instanceof MenuItem ? event.target : undefined
    if (!item || !this.menuItems.includes(item)) return
    // A user pick is a click or a key, so this runs once every listener of the event has seen it.
    queueMicrotask(() => {
      if (event.defaultPrevented || item.value === this.effectiveValue) return
      this.value = item.value
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    })
  }

  private handleMenuToggle = (event: Event) => {
    if (event.target !== this.menu) return
    const isOpen = (event as ToggleEvent).newState === 'open'
    this.open = isOpen
    // In choice mode the menu opens on the current choice, the way a select does.
    if (isOpen && this.mode === 'choice') {
      const chosen = this.chosenItem
      const active = (this.getRootNode() as Document | ShadowRoot).activeElement
      if (chosen && active instanceof MenuItem && this.menuItems.includes(active)) chosen.focus()
    }
    redispatchEvent(this, event)
  }

  private handleMenuSlotChange = () => {
    this.syncChoices()
  }

  private handleContentChange() {
    this.syncChoices()
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot:not([name])')
    if (slot) this.readMainText(slot)
  }

  private handleDefaultSlotChange = (event: Event) => {
    this.readMainText(event.target as HTMLSlotElement)
  }

  private readMainText(slot: HTMLSlotElement) {
    this.mainText = slot
      .assignedNodes({ flatten: true })
      .map((node) => node.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private get caretName(): string {
    if (this.caretLabel) return this.caretLabel
    const label = this.label || (this.mode === 'choice' ? this.chosenLabel : this.mainText)
    return label ? this.msg.t('caretLabel', label) : this.msg.t('caretLabelPlain')
  }

  private renderMainContent() {
    const icon = this.running
      ? html`<span class="running-icon">
          <slot name="running-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" focusable="false">
              <path d="M21 12a9 9 0 1 1-6.22-8.56"></path>
            </svg>
          </slot>
        </span>`
      : html`<slot name="prefix-icon" class="icon"></slot>`
    const label =
      this.mode === 'choice'
        ? html`<span class="label">${this.chosenLabel}</span>`
        : html`<span class="label"><slot @slotchange=${this.handleDefaultSlotChange}></slot></span>`
    return html`${icon}${label}`
  }

  override render() {
    const choice = this.mode === 'choice' && this.chosenLabel !== ''
    return html`
      <button
        class="main"
        part="main"
        type="button"
        ?disabled=${this.bothDisabled}
        aria-disabled=${!this.bothDisabled && (this.mainDisabled || this.running) ? 'true' : nothing}
        aria-busy=${this.running ? 'true' : nothing}
        aria-pressed=${this.toggle ? String(this.selected) : nothing}
        aria-label=${this.label || nothing}
        @click=${this.handleMainClick}
      >
        ${this.renderMainContent()}
      </button>
      <c2-menu
        class="menu"
        .anchor=${this}
        .placement=${this.placement}
        ?disabled=${this.bothDisabled}
        @click=${this.handleMenuClick}
        @toggle=${this.handleMenuToggle}
      >
        <button
          slot="trigger"
          class="caret"
          part="caret"
          type="button"
          ?disabled=${this.bothDisabled}
          aria-label=${this.caretName}
          aria-describedby=${choice ? 'current-choice' : nothing}
        >
          <span class="caret-icon"
            ><slot name="caret-icon">
              ${svg`<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"></path></svg>`}
            </slot></span
          >
        </button>
        <slot name="menu" @slotchange=${this.handleMenuSlotChange}></slot>
      </c2-menu>
      ${choice ? html`<span id="current-choice" hidden>${this.msg.t('currentChoice', this.chosenLabel)}</span>` : nothing}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-split-button': SplitButton
  }
}
