import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
// Registers `c2-button`, the usual item element.
import '@c2n/button'
// Registers `c2-icon-button`, so a client-only group can keep its item elements as direct children.
import '@c2n/icon-button'
import styles from './button-group.scss?inline'

export type ButtonGroupSelection = 'none' | 'single' | 'multiple'
export type ButtonGroupOrientation = 'horizontal' | 'vertical'
export type ButtonGroupAppearance = 'joined' | 'segmented'
export type ButtonGroupSize = 's' | 'm' | 'l'

const GROUP_DISABLED = 'data-c2-button-group-disabled'
/** Marks an item whose `tabindex` the group manages, holding the author's own value (empty when there was none). */
const ROVING = 'data-c2-button-group-tabindex'

/** Native elements that take focus without a `tabindex`. */
const NATIVELY_FOCUSABLE = 'button, input, select, textarea, a[href], [contenteditable=""], [contenteditable="true"]'

/** Events fired by {@link ButtonGroup}, keyed for `addEventListener`. */
export interface ButtonGroupEventMap {
  change: CustomEvent<{ value: string }>
  input: Event
}

export interface ButtonGroup {
  addEventListener: TypedAddEventListener<ButtonGroup, ButtonGroupEventMap>
  removeEventListener: TypedRemoveEventListener<ButtonGroup, ButtonGroupEventMap>
}

/**
 * Attaches related buttons into one control: shared borders, outside corners only, a divider between items. Children
 * are `c2-button` or `c2-icon-button` elements (any element works for layout). With `selection="single"` the group is
 * a segmented control that keeps one item pressed; with `selection="multiple"` each item toggles independently. Set
 * `orientation="vertical"` to stack either appearance and use Up/Down keyboard navigation. The
 * pressed items carry `selected` (and `aria-pressed`), the group reports them in `value` and fires `input` and `change`.
 *
 * A single-selection group is one Tab stop, like a radio group: Tab lands on the pressed item and the arrow keys move
 * the selection. Set `toolbar` for a toolbar: the group takes the `toolbar` role and stays one Tab stop, and the arrow
 * keys, Home and End move focus across every focusable child (buttons, `c2-select`, `c2-text-field`, links) without
 * changing the selection, which Space and Enter still do. A key the focused control uses itself — a caret moving in a
 * text field, a select opening — is left to it.
 *
 * With a `name`, the group is a form control: it submits its pressed values under that name (one entry per value
 * with `selection="multiple"`), resets with its form and follows a disabled `<fieldset>`.
 *
 * @tag c2-button-group
 *
 * @slot - The buttons, in order.
 *
 * @event {CustomEvent<{ value: string }>} change - Fired after the user changes the selection. `detail.value` is the new `value`. Not fired for programmatic changes.
 * @event {Event} input - Fired just before `change`, for two-way bindings that listen for `input`. Not fired for programmatic changes.
 *
 * @cssproperty {pixel} [--c2-button-group--gap=0px] - Space between items. Zero attaches them; a positive gap separates them into individually rounded buttons.
 * @cssproperty {border-radius} [--c2-button-group--border-radius=6px] - Outside corner radius. With a positive gap, applies to every item.
 * @cssproperty {border} [--c2-button-group--border=1px solid transparent] - Border applied to every item, e.g. `1px solid #d4d4d8` for an outlined group.
 * @cssproperty {pixel} [--c2-button-group__divider--width=1px] - Width of the line between attached items; also how much their borders overlap.
 * @cssproperty {color} [--c2-button-group__divider--color=rgba(255, 255, 255, 0.35)] - Colour of the line between attached items. Match the border colour for outlined groups, `transparent` for none.
 * @cssproperty {flex} [--c2-button-group__item--flex=0 0 auto] - `1 1 0` makes every item grow to the same width.
 * @cssproperty {color} [--c2-button-group__segmented--background-color=#f4f4f5] - Track background in the segmented appearance.
 * @cssproperty {border} [--c2-button-group__segmented--border=1px solid transparent] - Track border in the segmented appearance.
 * @cssproperty {padding} [--c2-button-group__segmented--padding=3px] - Space around the segmented items.
 * @cssproperty {pixel} [--c2-button-group__segmented--gap=2px] - Space between segmented items.
 * @cssproperty {color} [--c2-button-group__segmented-item--color=#52525b] - Segmented item text colour.
 * @cssproperty {color} [--c2-button-group__segmented-item__hover--background-color=rgba(0, 0, 0, 0.05)] - Segmented item hover background.
 * @cssproperty {color} [--c2-button-group__segmented-item__active--background-color=rgba(0, 0, 0, 0.08)] - Segmented item pressed background.
 * @cssproperty {color} [--c2-button-group__segmented-item__selected--color=#18181b] - Selected segmented item text colour.
 * @cssproperty {color} [--c2-button-group__indicator--background-color=#ffffff] - Sliding selection indicator background.
 * @cssproperty {border} [--c2-button-group__indicator--border=1px solid rgba(24, 24, 27, 0.08)] - Sliding selection indicator border.
 * @cssproperty {border-radius} [--c2-button-group__indicator--border-radius=6px] - Sliding selection indicator corner radius.
 * @cssproperty {box-shadow} [--c2-button-group__indicator--box-shadow=0 1px 3px rgba(24, 24, 27, 0.16)] - Sliding selection indicator shadow.
 * @cssproperty {duration} [--c2-button-group__indicator--transition-duration=200ms] - Sliding selection indicator animation duration.
 *
 * In the segmented appearance the group owns its children's surface variables with an important cascade layer. Theme
 * the control through the `segmented-*` and `indicator-*` variables above; app-wide `c2-button` defaults will not leak
 * into the segmented surface.
 * @slotcomponent c2-button
 * @slotcomponent c2-icon-button
 */
@customElement('c2-button-group')
export class ButtonGroup extends LitElement {
  static override styles = unsafeCSS(styles)
  static formAssociated = true

  // Semantics live on ElementInternals, not host attributes: an attribute the element writes on itself is one the
  // server never rendered, and React reports it as a hydration mismatch. An author-set attribute still wins.
  private readonly internals = this.attachInternals()

  /** `none` (default) for plain attached buttons, `single` for one pressed item, `multiple` for independent toggles. */
  @property({ reflect: true }) selection: ButtonGroupSelection = 'none'

  /** `value` of the pressed item; comma-separated values with `selection="multiple"`. Items without a `value` attribute use their index. */
  @property({ reflect: true }) value = ''

  /** Disables every item. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Stacks the items vertically. */
  @property({ reflect: true }) orientation: ButtonGroupOrientation = 'horizontal'

  /** `segmented` adds an inset track and sliding selected surface and always uses single selection. */
  @property({ reflect: true }) appearance: ButtonGroupAppearance = 'joined'

  /** Segmented control size. */
  @property({ reflect: true }) size: ButtonGroupSize = 'm'

  /**
   * Makes the group a toolbar: the `toolbar` role, one Tab stop, and arrow-key focus across every focusable child,
   * which may be any control rather than only buttons.
   */
  @property({ type: Boolean, reflect: true }) toolbar = false

  /** Name the pressed values are submitted under. Without one the group takes no part in a form. */
  @property() name = ''

  /** Makes the group and every item share the available width. */
  @property({ type: Boolean, reflect: true }) stretched = false

  /** Accessible name of the group. */
  @property({ type: String, attribute: 'aria-label' })
  override ariaLabel!: string

  /** The item that holds the group's Tab stop in a toolbar: the one focused last. */
  private activeItem?: HTMLElement
  /** `value` as the page first set it, restored by a form reset. */
  private defaultValue?: string
  /** Disabled by an ancestor `<fieldset>`, which the group treats like its own `disabled`. */
  @state() private formDisabled = false

  private observer?: MutationObserver
  private resizeObserver?: ResizeObserver
  private indicatorFrame?: number

  @state() private indicatorStyle: Record<string, string> = {}

  constructor() {
    super()
    if (!isServer) {
      this.addEventListener('click', this.handleClick)
      this.addEventListener('keydown', this.handleKeyDown)
      this.addEventListener('focusin', this.handleFocusIn)
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    this.internals.role = this.toolbar ? 'toolbar' : 'group'
    this.defaultValue ??= this.value
    if (!isServer) {
      this.observer ??= new MutationObserver(() => this.syncItems())
      this.observer.observe(this, { childList: true })
      this.resizeObserver ??= new ResizeObserver(() => this.queueIndicatorUpdate())
      this.resizeObserver.observe(this)
      this.syncItems()
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.observer?.disconnect()
    this.resizeObserver?.disconnect()
    if (this.indicatorFrame !== undefined) cancelAnimationFrame(this.indicatorFrame)
  }

  /** The item elements, in order. */
  get items(): HTMLElement[] {
    return [...this.children].filter((child): child is HTMLElement => child instanceof HTMLElement)
  }

  /** Values of the pressed items. */
  get selectedValues(): string[] {
    return this.value ? this.value.split(',').filter(Boolean) : []
  }

  private itemValue(item: HTMLElement, index: number): string {
    return item.getAttribute('value') ?? String(index)
  }

  /** Form reset: back to the value the page started with. */
  formResetCallback() {
    this.value = this.defaultValue ?? ''
  }

  /** A disabled `<fieldset>` disables the group exactly like its own `disabled`. */
  formDisabledCallback(disabled: boolean) {
    this.formDisabled = disabled
  }

  private get effectiveDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('toolbar')) {
      this.internals.role = this.toolbar ? 'toolbar' : 'group'
      if (this.toolbar) this.internals.ariaOrientation = this.orientation
      else this.internals.ariaOrientation = null
    } else if (changed.has('orientation') && this.toolbar) this.internals.ariaOrientation = this.orientation
    if (changed.has('value') || changed.has('selection') || changed.has('name')) this.syncFormValue()
    if (
      changed.has('value') ||
      changed.has('selection') ||
      changed.has('disabled') ||
      changed.has('formDisabled' as keyof ButtonGroup) ||
      changed.has('appearance') ||
      changed.has('toolbar')
    )
      this.syncItems()
    if (
      changed.has('value') ||
      changed.has('selection') ||
      changed.has('appearance') ||
      changed.has('orientation') ||
      changed.has('size') ||
      changed.has('stretched')
    )
      this.queueIndicatorUpdate()
  }

  /** What the form submits: nothing without a name, one entry per pressed value otherwise. */
  private syncFormValue() {
    const values = this.effectiveSelection === 'none' ? [] : this.selectedValues
    if (!this.name || !values.length) {
      this.internals.setFormValue(null)
      return
    }
    if (values.length === 1) {
      this.internals.setFormValue(values[0])
      return
    }
    const data = new FormData()
    for (const value of values) data.append(this.name, value)
    this.internals.setFormValue(data)
  }

  private get effectiveSelection(): ButtonGroupSelection {
    return this.appearance === 'segmented' ? 'single' : this.selection
  }

  /** Mirrors `value`, `selection` and `disabled` onto the items. */
  private syncItems() {
    const items = this.items
    const selection = this.effectiveSelection
    const selectable = selection !== 'none'
    if (selection === 'single' && this.appearance === 'segmented' && !this.value) {
      const firstEnabledIndex = items.findIndex((item) => !item.hasAttribute('disabled'))
      if (firstEnabledIndex >= 0) this.value = this.itemValue(items[firstEnabledIndex], firstEnabledIndex)
    }
    const selected = new Set(this.selectedValues)
    items.forEach((item, index) => {
      if (selectable) item.setAttribute('toggle', '')
      else item.removeAttribute('toggle')
      if (selectable && selected.has(this.itemValue(item, index))) item.setAttribute('selected', '')
      else item.removeAttribute('selected')

      if (this.effectiveDisabled) {
        if (!item.hasAttribute('disabled')) {
          item.setAttribute('disabled', '')
          item.setAttribute(GROUP_DISABLED, '')
        }
      } else if (item.hasAttribute(GROUP_DISABLED)) {
        item.removeAttribute('disabled')
        item.removeAttribute(GROUP_DISABLED)
      }
    })
    this.syncTabStops(items)
    this.resizeObserver?.disconnect()
    this.resizeObserver?.observe(this)
    items.forEach((item) => this.resizeObserver?.observe(item))
    this.queueIndicatorUpdate()
  }

  /** Whether the group is one Tab stop whose position it manages: a toolbar, or a single-selection group. */
  private get roving(): boolean {
    return this.toolbar || this.effectiveSelection === 'single'
  }

  /** Items the arrow keys can reach: enabled and focusable, in order. */
  private get focusableItems(): HTMLElement[] {
    return this.items.filter(
      (item) =>
        !item.hasAttribute('disabled') &&
        !item.hidden &&
        // A component takes focus by delegating it (`c2-button`, `c2-select`) or by forwarding `focus()` to its inner
        // control (`c2-text-field`); a managed item has had its own `tabindex` lowered by us.
        (item.shadowRoot?.delegatesFocus === true ||
          item.focus !== HTMLElement.prototype.focus ||
          item.hasAttribute(ROVING) ||
          item.tabIndex >= 0 ||
          item.matches(NATIVELY_FOCUSABLE)),
    )
  }

  /**
   * Keeps exactly one item in the Tab order while roving: the last focused item in a toolbar, otherwise the pressed
   * one, falling back to the first. The others get `tabindex="-1"`, which takes a host's whole shadow tree out of the
   * Tab order; the current one keeps the author's own `tabindex`, which is remembered and put back when roving stops.
   * (Giving it `tabindex="0"` instead would make a host that forwards `focus()` a Tab stop of its own.)
   */
  private syncTabStops(items = this.items) {
    if (!this.roving || this.effectiveDisabled) {
      for (const item of items) this.releaseTabStop(item)
      return
    }
    const focusable = this.focusableItems
    const pressed = focusable.find((item) => item.hasAttribute('selected'))
    const current =
      this.toolbar && this.activeItem && focusable.includes(this.activeItem)
        ? this.activeItem
        : (pressed ?? (this.activeItem && focusable.includes(this.activeItem) ? this.activeItem : focusable[0]))
    for (const item of items) {
      if (!focusable.includes(item)) {
        this.releaseTabStop(item)
        continue
      }
      if (!item.hasAttribute(ROVING)) item.setAttribute(ROVING, item.getAttribute('tabindex') ?? '')
      if (item !== current) item.setAttribute('tabindex', '-1')
      else {
        const original = item.getAttribute(ROVING)
        if (original) item.setAttribute('tabindex', original)
        else item.removeAttribute('tabindex')
      }
    }
  }

  private releaseTabStop(item: HTMLElement) {
    if (!item.hasAttribute(ROVING)) return
    const original = item.getAttribute(ROVING)
    if (original) item.setAttribute('tabindex', original)
    else item.removeAttribute('tabindex')
    item.removeAttribute(ROVING)
  }

  /** The direct child that contains the event's target, if any. */
  private itemOf(event: Event): HTMLElement | undefined {
    return event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.parentElement === this)
  }

  private handleFocusIn = (event: FocusEvent) => {
    const item = this.itemOf(event)
    if (!item || item === this.activeItem) return
    this.activeItem = item
    if (this.toolbar) this.syncTabStops()
  }

  /** Sets the selection the way a user does: `value`, then `input` and `change`. */
  private commit(next: string) {
    this.value = next
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new CustomEvent('change', { detail: { value: next }, bubbles: true, composed: true }))
  }

  private handleClick = (event: Event) => {
    const selection = this.effectiveSelection
    if (selection === 'none' || this.effectiveDisabled) return
    const items = this.items
    const item = this.itemOf(event)
    if (!item || item.hasAttribute('disabled')) return
    const value = this.itemValue(item, items.indexOf(item))
    let next: string
    if (selection === 'single') {
      if (this.value === value) return
      next = value
    } else {
      const values = this.selectedValues
      next = values.includes(value) ? values.filter((entry) => entry !== value).join(',') : [...values, value].join(',')
    }
    this.commit(next)
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    const directionKeys = this.orientation === 'vertical' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
    if (!this.roving || this.effectiveDisabled || ![...directionKeys, 'Home', 'End'].includes(event.key)) return
    // The focused control used the key itself: a select opening, a menu moving, a slider stepping.
    if (event.defaultPrevented) return
    // A caret moves on the arrow keys and Home/End, so a text control keeps them.
    const origin = event.composedPath()[0]
    if (origin instanceof HTMLElement && (origin.matches('input:not([type=button], [type=checkbox], [type=radio]), textarea') || origin.isContentEditable))
      return
    const enabledItems = this.focusableItems
    if (!enabledItems.length) return
    const current = this.itemOf(event)
    if (!current || !enabledItems.includes(current)) return

    event.preventDefault()
    const currentIndex = enabledItems.indexOf(current)
    const isRtl = getComputedStyle(this).direction === 'rtl'
    let nextIndex: number
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = enabledItems.length - 1
    else {
      const backwards = event.key === 'ArrowUp' || (event.key === 'ArrowLeft' && !isRtl) || (event.key === 'ArrowRight' && isRtl)
      nextIndex = (currentIndex + (backwards ? -1 : 1) + enabledItems.length) % enabledItems.length
    }
    const nextItem = enabledItems[nextIndex]
    this.activeItem = nextItem
    // A toolbar moves focus only; a single-selection group selects what it moves to, as a radio group does.
    if (this.toolbar) {
      // The Tab stop moves first: changing the `tabindex` of a host whose inner control already has focus drops it.
      this.syncTabStops()
      nextItem.focus()
      return
    }
    nextItem.focus()
    const value = this.itemValue(nextItem, this.items.indexOf(nextItem))
    if (this.value === value) return
    this.commit(value)
  }

  private queueIndicatorUpdate() {
    if (isServer) return
    if (this.indicatorFrame !== undefined) cancelAnimationFrame(this.indicatorFrame)
    this.indicatorFrame = requestAnimationFrame(() => {
      this.indicatorFrame = undefined
      const items = this.items
      const selected = items.find((item, index) => this.itemValue(item, index) === this.value)
      if (this.appearance !== 'segmented' || !selected) {
        this.indicatorStyle = {}
        return
      }
      const hostRect = this.getBoundingClientRect()
      const itemRect = selected.getBoundingClientRect()
      this.indicatorStyle = {
        width: `${itemRect.width}px`,
        height: `${itemRect.height}px`,
        transform: `translate3d(${itemRect.left - hostRect.left - this.clientLeft}px, ${itemRect.top - hostRect.top - this.clientTop}px, 0)`,
      }
    })
  }

  override render() {
    return html`
      <span class="indicator" style=${Object.keys(this.indicatorStyle).length ? styleMap(this.indicatorStyle) : nothing} aria-hidden="true"></span>
      <slot @slotchange=${this.syncItems}></slot>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-button-group': ButtonGroup
  }
}
