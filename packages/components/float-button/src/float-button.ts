import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { FloatButtonAction } from './float-button-action'
import { floatButtonMessages } from './messages'
import styles from './float-button.scss?inline'

import './float-button-action'

export { FloatButtonAction }

/** Where the speed dial's actions fan out from the button. */
export type FloatButtonDirection = 'up' | 'down' | 'left' | 'right'

/** What opens the speed dial. */
export type FloatButtonTrigger = 'click' | 'hover'

/** `detail` of the `action-select` event. */
export interface FloatButtonSelectEventDetail {
  /** The activated action's `value`. */
  value: string
  /** The activated action. */
  action: FloatButtonAction
}

/** Events fired by {@link FloatButton}, keyed for `addEventListener`. */
export interface FloatButtonEventMap {
  'action-select': CustomEvent<FloatButtonSelectEventDetail>
  toggle: ToggleEvent
}

export interface FloatButton {
  addEventListener: TypedAddEventListener<FloatButton, FloatButtonEventMap>
  removeEventListener: TypedRemoveEventListener<FloatButton, FloatButtonEventMap>
}

/** Arrow keys that move focus away from the button (+1) or back towards it (-1), per direction. */
const ARROW_STEPS: Record<FloatButtonDirection, Record<string, number>> = {
  up: { ArrowUp: 1, ArrowDown: -1 },
  down: { ArrowDown: 1, ArrowUp: -1 },
  left: { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 1, ArrowUp: -1 },
  right: { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 },
}

/** How long the pointer may leave a `trigger="hover"` dial before it closes. */
const HOVER_CLOSE_DELAY = 200

/**
 * How long after a touch "mouse" pointer events are taken to be emulated. iOS Safari follows a tap with a mouse
 * `pointerenter` and `pointerleave` on the tapped element, which would otherwise open a hover dial and close it again.
 */
const EMULATED_MOUSE_WINDOW = 1000

let lastTouch = -Infinity
if (!isServer) {
  const onTouch = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') lastTouch = event.timeStamp
  }
  document.addEventListener('pointerdown', onTouch, { capture: true, passive: true })
  document.addEventListener('pointerup', onTouch, { capture: true, passive: true })
}

/** A pointer event from a real mouse, not one emulated after a touch. */
const isMouse = (event: PointerEvent) => event.pointerType === 'mouse' && event.timeStamp - lastTouch > EMULATED_MOUSE_WINDOW

/**
 * A raised button pinned to a corner of the viewport for the screen's main action ("Compose", "New task"). Give it
 * `c2-float-button-action` children and it becomes a speed dial: the button opens a short menu of related actions
 * that fan out in `direction`, its plus turning into a cross.
 *
 * Without actions it is a plain button and fires the native `click`. With actions the button follows the menu-button
 * pattern: Enter, Space or an arrow key opens the dial and focuses the first action, the arrow keys move between
 * actions, Escape closes it and returns focus, and Tab or a click outside closes it.
 *
 * The button is `position: fixed` 24px from the bottom-right corner by default; set `--c2-float-button--position`
 * and `--c2-float-button--inset` to place it elsewhere or in the flow. Show its `label` next to the icon (an
 * "extended" button) with `--c2-float-button__label--display: inline`.
 *
 * @tag c2-float-button
 *
 * @slot - The speed dial's `c2-float-button-action` elements, nearest the button first.
 * @slot icon - The button's icon. Defaults to a plus that turns into a cross while the dial is open.
 * @slot open-icon - Replaces the icon while the dial is open.
 *
 * @slotcomponent c2-float-button-action
 *
 * @csspart button - The native button.
 * @csspart label - The visible label of an extended button.
 * @csspart actions - The speed dial's menu container.
 *
 * @event {CustomEvent<FloatButtonSelectEventDetail>} action-select - An action was activated by a click, Enter or Space: `detail.value` and `detail.action`. Cancelable: `preventDefault()` keeps the dial open.
 * @event {ToggleEvent} toggle - The speed dial opened or closed; `newState` is `open` or `closed`.
 *
 * @cssproperty {position} [--c2-float-button--position=fixed] - `absolute` to pin the button inside a positioned container, `static` to keep it in the flow.
 * @cssproperty {inset} [--c2-float-button--inset=auto 24px 24px auto] - Distance from the edges of the viewport (or container); top right bottom left.
 * @cssproperty {number} [--c2-float-button--z-index=100]
 *
 * @cssproperty {pixel} [--c2-float-button__button--size=56px] - Height, and minimum width, of the button.
 * @cssproperty {padding} [--c2-float-button__button--padding-inline=16px] - Side padding; with the 24px icon it makes a 56px circle.
 * @cssproperty {pixel} [--c2-float-button__button--gap=8px] - Space between the icon and the visible label.
 * @cssproperty {border-radius} [--c2-float-button__button--border-radius=999px]
 * @cssproperty {border} [--c2-float-button__button--border=none]
 * @cssproperty {color} [--c2-float-button__button--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-float-button__button__hover--background-color=#0154b8]
 * @cssproperty {color} [--c2-float-button__button__open--background-color=#0154b8]
 * @cssproperty {color} [--c2-float-button__button--color=#ffffff] - Icon and label colour.
 * @cssproperty {shadow} [--c2-float-button__button--box-shadow=0 6px 16px rgba(24, 24, 27, 0.2), 0 2px 4px rgba(24, 24, 27, 0.12)]
 * @cssproperty {shadow} [--c2-float-button__button__hover--box-shadow=0 10px 24px rgba(24, 24, 27, 0.24), 0 3px 6px rgba(24, 24, 27, 0.14)]
 * @cssproperty {outline} [--c2-float-button__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-float-button__focus--outline-offset=3px]
 * @cssproperty {opacity} [--c2-float-button__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-float-button__icon--size=24px]
 * @cssproperty {transform} [--c2-float-button__icon__open--transform=rotate(45deg)] - The icon's turn while open; `none` to keep it still.
 *
 * @cssproperty {display} [--c2-float-button__label--display=none] - `inline` shows `label` next to the icon (an extended button).
 * @cssproperty {font-size} [--c2-float-button__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-float-button__label--font-weight=600]
 *
 * @cssproperty {pixel} [--c2-float-button__actions--gap=12px] - Space between actions.
 * @cssproperty {pixel} [--c2-float-button__actions--offset=16px] - Space between the button and the nearest action.
 * @cssproperty {time} [--c2-float-button__actions--transition-duration=200ms]
 * @cssproperty {time} [--c2-float-button__actions--stagger=30ms] - Delay added per action as the dial opens.
 */
@customElement('c2-float-button')
export class FloatButton extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  /** Accessible name of the button and its speed dial, also the visible text of an extended button. Defaults to "Actions". */
  @property() label = ''

  /** Whether the speed dial is expanded. Has no effect without actions. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Where the actions fan out from the button. */
  @property() direction: FloatButtonDirection = 'up'

  /** `hover` also opens the dial while a mouse pointer is over it; a click or the keyboard still toggle it. */
  @property() trigger: FloatButtonTrigger = 'click'

  /** Disables the button and closes the dial. */
  @property({ type: Boolean, reflect: true }) disabled = false

  @state() private hasActions = false
  @state() private hasOpenIcon = false

  @query('.button') private button!: HTMLButtonElement

  private readonly msg = new LocalizeController(this, floatButtonMessages)
  private hoverTimer: ReturnType<typeof setTimeout> | undefined
  /** The dial was opened by the mouse entering it, so the click that usually follows must not close it again. */
  private openedByHover = false
  /** The actions as last read, kept current by {@link refreshActions}. */
  private actionList: FloatButtonAction[] = []
  // Actions may be added inside a wrapper element, which fires no slotchange.
  private readonly observer = isServer ? undefined : new MutationObserver(() => this.refreshActions())

  /**
   * The actions in DOM order, nearest the button first. They may sit in a framework's wrapper element (an Astro
   * island, a `display: contents` component root), so any descendant counts unless a nested float button owns it.
   */
  get actions(): FloatButtonAction[] {
    return [...this.querySelectorAll('c2-float-button-action')].filter((action) => action.closest('c2-float-button') === this) as FloatButtonAction[]
  }

  constructor() {
    super()
    if (!isServer) {
      this.addEventListener('focusout', this.onFocusOut)
      this.addEventListener('pointerenter', this.onPointerEnter)
      this.addEventListener('pointerleave', this.onPointerLeave)
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    this.observer?.observe(this, { childList: true, subtree: true })
    // A dial moved while open still closes on an outside click.
    if (this.open) document.addEventListener('pointerdown', this.onDocumentPointerDown, true)
    if (this.hasUpdated) this.refreshActions()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.observer?.disconnect()
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true)
    clearTimeout(this.hoverTimer)
  }

  /** Opens the speed dial. */
  show() {
    if (this.hasActions && !this.disabled) this.open = true
  }

  /** Closes the speed dial. */
  hide() {
    this.open = false
    this.openedByHover = false
  }

  /** Opens or closes the speed dial. */
  toggle() {
    if (this.open) this.hide()
    else this.show()
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (this.disabled && this.open) this.open = false
    if (changed.has('open') && this.open && !this.hasActions && this.hasUpdated) this.open = false
  }

  protected override firstUpdated() {
    // A server-rendered shadow root has its slots filled before hydration, so no slotchange follows: read them now.
    this.refreshActions()
  }

  protected override updated(changed: PropertyValues<this>) {
    if (!changed.has('open')) return
    const previous = changed.get('open')
    if (this.open) document.addEventListener('pointerdown', this.onDocumentPointerDown, true)
    else document.removeEventListener('pointerdown', this.onDocumentPointerDown, true)
    // The first render is not a change.
    if (previous === undefined) return
    const states = { oldState: this.open ? 'closed' : 'open', newState: this.open ? 'open' : 'closed' }
    // Safari before 17 has no ToggleEvent constructor: hand listeners the same two fields on a plain event.
    this.dispatchEvent(typeof ToggleEvent === 'function' ? new ToggleEvent('toggle', states) : Object.assign(new Event('toggle'), states))
  }

  override render() {
    const label = this.label || this.msg.t('actions')
    const vertical = this.direction === 'up' || this.direction === 'down'
    const classes = {
      root: true,
      [`direction-${this.direction}`]: true,
      open: this.open,
      'has-actions': this.hasActions,
      'has-open-icon': this.hasOpenIcon,
    }
    return html`
      <div class=${classMap(classes)}>
        <div
          class="actions"
          id="actions"
          part="actions"
          role="menu"
          aria-label=${label}
          aria-orientation=${vertical ? 'vertical' : 'horizontal'}
          ?inert=${!this.open}
          @click=${this.onActionClick}
          @keydown=${this.onActionKeyDown}
        >
          <slot @slotchange=${this.refreshActions}></slot>
        </div>
        <button
          class="button"
          part="button"
          type="button"
          ?disabled=${this.disabled}
          aria-label=${label}
          aria-haspopup=${this.hasActions ? 'menu' : nothing}
          aria-expanded=${this.hasActions ? String(this.open) : nothing}
          aria-controls=${this.hasActions ? 'actions' : nothing}
          @click=${this.onButtonClick}
          @keydown=${this.onButtonKeyDown}
        >
          <span class="icons">
            <span class="icon">
              <slot name="icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </slot>
            </span>
            <span class="open-icon"><slot name="open-icon" @slotchange=${this.refreshActions}></slot></span>
          </span>
          ${this.label ? html`<span class="label" part="label" aria-hidden="true">${this.label}</span>` : nothing}
        </button>
      </div>
    `
  }

  private refreshActions() {
    const actions = this.actions
    this.actionList = actions
    this.hasActions = actions.length > 0
    this.hasOpenIcon = this.querySelector(':scope > [slot="open-icon"]') !== null
    actions.forEach((action, index) => {
      // Like a menu's rows, actions are reached with the arrow keys only, so Tab leaves the dial.
      if (action.getAttribute('tabindex') !== '-1') action.tabIndex = -1
      action.setDialIndex(index)
    })
    if (!this.hasActions) this.open = false
  }

  private onButtonClick(event: MouseEvent) {
    if (!this.hasActions) return
    // The mouse that just opened a hover dial clicks it next, as on any button: keep it open.
    if (this.openedByHover && event.detail > 0) {
      this.openedByHover = false
      return
    }
    this.toggle()
    // A click from Enter or Space has no pointer position: move into the dial like a menu button.
    if (this.open && event.detail === 0) void this.focusAction(0)
  }

  private onButtonKeyDown(event: KeyboardEvent) {
    if (!this.hasActions) return
    if (event.key === 'Escape' && this.open) {
      event.preventDefault()
      this.hide()
      return
    }
    const step = ARROW_STEPS[this.direction]?.[event.key]
    if (step !== undefined) {
      event.preventDefault()
      this.show()
      void this.focusAction(step === 1 ? 0 : this.enabledActions().length - 1)
    }
  }

  private onActionKeyDown(event: KeyboardEvent) {
    const action = this.actionFrom(event)
    if (!action) return
    const enabled = this.enabledActions()
    const index = enabled.indexOf(action)
    const step = ARROW_STEPS[this.direction]?.[event.key]
    if (step !== undefined) {
      event.preventDefault()
      const next = index + step
      if (next < 0) this.button.focus()
      else void this.focusAction(Math.min(next, enabled.length - 1))
      return
    }
    switch (event.key) {
      case 'Home':
        event.preventDefault()
        void this.focusAction(0)
        break
      case 'End':
        event.preventDefault()
        void this.focusAction(enabled.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        this.hide()
        this.button.focus()
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        this.select(action)
        break
    }
  }

  private onActionClick(event: MouseEvent) {
    const action = this.actionFrom(event)
    if (action) this.select(action)
  }

  private select(action: FloatButtonAction) {
    if (action.disabled) return
    const selected = new CustomEvent<FloatButtonSelectEventDetail>('action-select', {
      detail: { value: action.value, action },
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    if (!this.dispatchEvent(selected)) return
    const hadFocus = this.matches(':focus-within')
    this.hide()
    if (hadFocus) this.button.focus()
  }

  private actionFrom(event: Event): FloatButtonAction | undefined {
    return event.composedPath().find((node): node is FloatButtonAction => node instanceof FloatButtonAction && node.closest('c2-float-button') === this)
  }

  private enabledActions() {
    return this.actionList.filter((action) => !action.disabled)
  }

  private async focusAction(index: number) {
    // Wait for the dial to become visible: a hidden element cannot take focus.
    await this.updateComplete
    this.enabledActions()[index]?.focus()
  }

  private readonly onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null
    // Focus leaving the window (another app, a notification) is not focus leaving the dial.
    if (!next && !document.hasFocus()) return
    if (this.open && (!next || (next !== this && !this.contains(next) && !this.shadowRoot?.contains(next)))) this.hide()
  }

  private readonly onDocumentPointerDown = (event: PointerEvent) => {
    if (!event.composedPath().includes(this)) this.hide()
  }

  private readonly onPointerEnter = (event: PointerEvent) => {
    if (this.trigger !== 'hover' || !isMouse(event)) return
    clearTimeout(this.hoverTimer)
    if (!this.open) {
      this.show()
      this.openedByHover = this.open
    }
  }

  private readonly onPointerLeave = (event: PointerEvent) => {
    if (this.trigger !== 'hover' || !isMouse(event)) return
    clearTimeout(this.hoverTimer)
    this.hoverTimer = setTimeout(() => this.hide(), HOVER_CLOSE_DELAY)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-float-button': FloatButton
  }
}
