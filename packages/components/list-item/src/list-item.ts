import { LitElement, html, nothing, unsafeCSS, type PropertyValueMap } from 'lit'
import { query } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './list-item.scss?inline'
import { LIST_ITEM_FOCUS_REQUEST_EVENT, selectedItemValueContext } from './list-item-context'
import { ContextConsumer } from '@c2n/core/controllers/context-consumer.js'
import { redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import { FIELD_CONNECT_EVENT } from '@c2n/core/contexts/field.js'

// The settings-row behaviour (naming and activating the control in the `control` slot) loads the first time a row has
// a control; from then on it runs synchronously. A failed load (offline, a stale deploy) is tried again next time.
type ControlModule = typeof import('./list-item-control.js')
let controlModule: ControlModule | undefined
let controlModuleLoad: Promise<void> | undefined
function withControlModule(run: (module: ControlModule) => void) {
  if (controlModule) return run(controlModule)
  controlModuleLoad ??= import('./list-item-control.js').then(
    (module) => void (controlModule = module),
    () => void (controlModuleLoad = undefined),
  )
  void controlModuleLoad.then(() => controlModule && run(controlModule))
}

/** Events fired by {@link ListItem}, keyed for `addEventListener`. */
export interface ListItemEventMap {
  'selected-change': CustomEvent<{ selected: boolean; value: string }>
  click: MouseEvent
}

/**
 * Elements that act on their own when clicked or keyed. A click or key press that starts inside one of them belongs to
 * that control, not to the row around it.
 */
const INTERACTIVE_SELECTOR =
  'a[href], button, input, select, textarea, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="textbox"], [role="searchbox"], [tabindex]:not([tabindex="-1"])'

/**
 * Whether `event` started on an interactive element placed inside `row` (a delete button in the `suffix-icon` slot, a
 * checkbox, a text field…) rather than on the row itself. The row and the parent list leave such events alone: the
 * click is neither turned into a row click nor a selection, and Enter / Space reach the control.
 */
export function isFromInteractiveContent(event: Event, row: Element): boolean {
  for (const node of event.composedPath()) {
    if (node === row) return false
    // The row's own shadow tree (the `<a>` of an `href` row) is the row itself. Everything else before the row is the
    // author's content, including the shadow trees of nested components (the native control inside `c2-select`).
    if (node instanceof Element && node.getRootNode() !== row.shadowRoot && node.matches(INTERACTIVE_SELECTOR)) return true
  }
  return false
}

export interface ListItem {
  addEventListener: TypedAddEventListener<ListItem, ListItemEventMap>
  removeEventListener: TypedRemoveEventListener<ListItem, ListItemEventMap>
}

/**
 * A selectable row. On its own it is a toggle: click, Enter or Space flips `selected`. Inside a `c2-list` (and
 * therefore inside a `c2-select`) the list drives the selected state through context, handles the keyboard and the row
 * only reports clicks. The default slot is the primary text, `description` a second, muted line, `prefix-icon` and
 * `suffix-icon` take an inline SVG, a `c2-feather-*` icon or a `c2-mat-icon` and are sized by
 * `--c2-list-item__icon--size` — anything else in them, a shortcut hint or a badge, keeps its own size.
 * Interactive content placed in a row (a delete button in `suffix-icon`, a checkbox in `prefix-icon`) keeps its own
 * events: clicking it neither selects the row nor fires the row's `click`, the original event bubbles on with the
 * control as its `target`, and Enter / Space activate the control instead of the row.
 * A focusable control in the `control` slot (a `c2-switch`, `c2-checkbox` or `c2-select`) turns the row into a
 * settings row: the row is no longer a button or an option, it takes no focus and does not toggle `selected`. The
 * control keeps its own role, focus and keyboard; a click anywhere else on the row focuses it, and flips a switch or
 * checkbox, as the label of a `c2-form-field` does. A `c2-*` switch, checkbox or select is named by the row's text and
 * described by its `description`; a text field keeps its own hint and error line, so give it an `aria-label`. For a
 * row that opens another page with its current value, use an `href` row with the value in `suffix-icon` instead. Do
 * not combine a control with `href` or put such a row in a `c2-list`, whose rows are options.
 * With `href` the row is a link; `current` marks the link of the page the reader is on (`aria-current="page"`), as a
 * navigation list does for the current route, and draws it with the `current` variables. In a multiple-selection list, adjacent selected rows lose the corner radius between
 * them (the list sets `joinedBefore` / `joinedAfter`, exposed as `:state(joined-before)` / `:state(joined-after)`) so a run of
 * selected rows reads as one block.
 *
 * Accessibility: standalone rows are `role="button"` with `aria-pressed`; rows in a list are `role="option"` with
 * `aria-selected` and a roving `tabindex` managed by the list; a row with a `control` has no role of its own. Set your
 * own `role` to override.
 *
 * @tag c2-list-item
 *
 * @slot default - The row content. Falls back to `label`, then `value`, when empty.
 * @slot description - Secondary line under the content (muted, smaller).
 * @slot prefix-icon - Icon (or avatar, badge, …) shown before the content.
 * @slot suffix-icon - Icon shown after the content, e.g. a check mark or shortcut hint.
 * @slot control - A trailing control the whole row labels and activates, such as a `c2-switch` or a `c2-select`.
 *
 * @csspart control - The `control` slot itself, which projects the trailing control at the end of the row. Like any slot it has no box (`display: contents`) until you give it one; the assigned control keeps its own styles.
 *
 * @event {CustomEvent<{ selected: boolean; value: string }>} selected-change - Fired after `selected` changes, whether from a click or from the parent list.
 * @event {MouseEvent} click - Fired when an enabled row is activated; a row with `href` also navigates.
 *
 * @cssproperty {pixel} [--c2-list-item--min-height=36px]
 * @cssproperty {pixel} [--c2-list-item--gap=8px] - Space between the icons and the content.
 *
 * @cssproperty {border-radius} [--c2-list-item--border-top-left-radius=6px]
 * @cssproperty {border-radius} [--c2-list-item--border-top-right-radius=6px]
 * @cssproperty {border-radius} [--c2-list-item--border-bottom-left-radius=6px]
 * @cssproperty {border-radius} [--c2-list-item--border-bottom-right-radius=6px]
 *
 * @cssproperty {padding} [--c2-list-item--padding-top=6px]
 * @cssproperty {padding} [--c2-list-item--padding-right=10px]
 * @cssproperty {padding} [--c2-list-item--padding-bottom=6px]
 * @cssproperty {padding} [--c2-list-item--padding-left=10px]
 *
 * @cssproperty {font-size} [--c2-list-item--font-size=14px]
 * @cssproperty {font-weight} --c2-list-item--font-weight
 * @cssproperty {font-style} --c2-list-item--font-style
 * @cssproperty {font-family} --c2-list-item--font-family
 * @cssproperty {pixel} [--c2-list-item--line-height=20px]
 *
 * @cssproperty {border} --c2-list-item--border-top
 * @cssproperty {border} --c2-list-item--border-bottom
 * @cssproperty {border} --c2-list-item--border-right
 * @cssproperty {border} --c2-list-item--border-left
 *
 * @cssproperty {color} [--c2-list-item--color=#18181b]
 * @cssproperty {color} [--c2-list-item--background=transparent]
 *
 * @cssproperty {color} [--c2-list-item__description--color=#71717a]
 * @cssproperty {font-size} [--c2-list-item__description--font-size=12px]
 * @cssproperty {pixel} [--c2-list-item__description--line-height=16px]
 * @cssproperty {pixel} [--c2-list-item__description--margin-top=1px]
 *
 * @cssproperty {border} --c2-list-item__hover--border-top
 * @cssproperty {border} --c2-list-item__hover--border-bottom
 * @cssproperty {border} --c2-list-item__hover--border-right
 * @cssproperty {border} --c2-list-item__hover--border-left
 * @cssproperty {color} --c2-list-item__hover--color
 * @cssproperty {color} [--c2-list-item__hover--background=#f4f4f5]
 *
 * @cssproperty {border} --c2-list-item__selected--border-top
 * @cssproperty {border} --c2-list-item__selected--border-bottom
 * @cssproperty {border} --c2-list-item__selected--border-right
 * @cssproperty {border} --c2-list-item__selected--border-left
 * @cssproperty {color} [--c2-list-item__selected--color=#2f56e6]
 * @cssproperty {color} [--c2-list-item__selected--background=#edf1fe]
 * @cssproperty {color} [--c2-list-item__selected__hover--background=#e2e9fd]
 * @cssproperty {color} --c2-list-item__selected__description--color - Defaults to the description colour.
 *
 * @cssproperty {border} --c2-list-item__current--border-top - Defaults to the selected border.
 * @cssproperty {border} --c2-list-item__current--border-bottom - Defaults to the selected border.
 * @cssproperty {border} --c2-list-item__current--border-right - Defaults to the selected border.
 * @cssproperty {border} --c2-list-item__current--border-left - Defaults to the selected border; a coloured left border is the accent-bar idiom.
 * @cssproperty {color} --c2-list-item__current--color - Defaults to the selected colour.
 * @cssproperty {color} --c2-list-item__current--background - Defaults to the selected background.
 * @cssproperty {color} --c2-list-item__current__hover--background - Defaults to `current--background` when that is set, else to the selected hover background.
 * @cssproperty {font-weight} --c2-list-item__current--font-weight - Defaults to the row's font weight.
 *
 * @cssproperty {outline} [--c2-list-item__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-list-item__focus--outline-offset=-2px]
 *
 * @cssproperty {opacity} [--c2-list-item__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-list-item__icon--size=16px] - Width and height of the icon, also given to a slotted c2 icon.
 * @cssproperty {color} --c2-list-item__icon--color - Defaults to the row text colour.
 */
@customElement('c2-list-item')
export class ListItem extends LitElement {
  static override styles = unsafeCSS(styles)

  private contextConsumer = new ContextConsumer(this, {
    context: selectedItemValueContext,
    subscribe: true,
    callback: (value) => {
      this.selected = value ? value.includes(this.value) : false
    },
  })

  /** Whether the row is selected. Toggled by a click on a standalone row; controlled by the list otherwise. */
  @property({ type: Boolean, reflect: true }) selected = false

  /** Dims the row and ignores clicks and keyboard. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The value reported to the parent list / select. */
  @property({ reflect: true }) value = ''

  /**
   * Text shown by the parent select for this row instead of the slotted content. Also the fallback content of the
   * default slot when it is empty. Use it when the row content is rich (icons, two lines) but the trigger should show a
   * short label.
   */
  @property({ reflect: true }) label?: string

  /** Makes the row a link. Selection still works when the row sits in a list. */
  @property() href: string | undefined = undefined

  /**
   * Marks the row as the current page of a navigation list: announced as `aria-current="page"` and drawn with the
   * `--c2-list-item__current--*` variables, which default to the selected look. Independent of `selected`.
   */
  @property({ type: Boolean, reflect: true }) current = false

  /** Browsing context used when `href` is set, such as `_blank`. */
  @property() target: string | undefined = undefined

  /** Arbitrary payload returned alongside `value` in the list's `selection-change` event. Not an attribute. */
  @property({ attribute: false }) data?: unknown

  /**
   * Private: set by the parent `c2-list` (or written as an attribute by `c2-virtual-list`) when the row above is
   * selected too, so the facing corners square off. Exposed as `:state(joined-before)`; never reflected.
   */
  @property({ type: Boolean, attribute: 'joined-before' }) joinedBefore = false

  /** Private: the `joinedBefore` counterpart for the row below. Exposed as `:state(joined-after)`; never reflected. */
  @property({ type: Boolean, attribute: 'joined-after' }) joinedAfter = false

  /**
   * Private property, it will use context value to setup selected state of component.
   */
  @property({ attribute: false }) applyContext = false

  private readonly slotPresence = new SlotPresenceController(this, ['description'])

  @query('slot:not([name])')
  private contentSlot!: HTMLSlotElement

  // Semantics live on ElementInternals, not host attributes: an attribute the element writes on itself is one the
  // server never rendered, and React reports it as a hydration mismatch. An author-set attribute still wins.
  private readonly internals = this.attachInternals()

  private hadControl = false

  /** The element in the `control` slot, or `null`. */
  get controlElement(): HTMLElement | null {
    let control = this.querySelector(':scope > [slot="control"]')
    // A wrapper around a single element (Astro's `<astro-island>`, a `<label>`) stands for the element it holds.
    while (control && !control.shadowRoot && control.childElementCount === 1) control = control.firstElementChild
    return control as HTMLElement | null
  }

  /** The text a `c2-select` shows for this row: `label` when set, otherwise the text content of the default slot. */
  get displayText(): string {
    if (this.label !== undefined) return this.label

    return (
      (this.contentSlot
        .assignedNodes({ flatten: true })
        .flatMap((item) => (item as HTMLElement).innerText ?? (item as HTMLElement).textContent)
        .join(' ')
        .trim() ||
        this.contentSlot.innerText) ??
      this.contentSlot.textContent
    )
  }

  override connectedCallback() {
    super.connectedCallback()
    this.addEventListener('keydown', this.handleKeydown)
    this.addEventListener('click', this.blockDisabledClick, true)
    this.addEventListener(FIELD_CONNECT_EVENT, this.handleFieldConnect)
    // A settings row let its control go when it left the page; name it again.
    if (this.hadControl) this.requestUpdate()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('keydown', this.handleKeydown)
    this.removeEventListener('click', this.blockDisabledClick, true)
    this.removeEventListener(FIELD_CONNECT_EVENT, this.handleFieldConnect)
    if (this.hadControl) withControlModule((module) => module.releaseControl(this))
  }

  // A control that upgrades after the row: name it, and keep an outer field from claiming it.
  private handleFieldConnect = (event: Event) => {
    if (event.target !== this.controlElement) return
    event.stopPropagation()
    this.requestUpdate()
  }

  private handleSlotChange = (event: Event) => {
    this.slotPresence.handleSlotChange(event)
    this.requestUpdate()
  }

  private blockDisabledClick = (event: Event) => {
    // A control inside a disabled row is the author's to disable; only the row's own click is blocked.
    if (!this.disabled || isFromInteractiveContent(event, this)) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  /** Behaves like a click: dispatches `click` on the row and, for a standalone row, toggles `selected`. */
  activate() {
    if (this.disabled) return
    const control = this.controlElement
    if (control) return withControlModule((module) => module.activateControl(control))
    const dispatched = this.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }))
    if (dispatched && !this.applyContext) this.selected = !this.selected
  }

  private handleClick = (event: Event) => {
    // A button (or other control) inside the row owns its click: let it bubble untouched, with its own target.
    if (isFromInteractiveContent(event, this)) return
    if (this.disabled) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    // A settings row hands the click to its control, which reports the change itself.
    const control = this.controlElement
    if (control) {
      if (!event.composedPath().includes(control)) withControlModule((module) => module.activateControl(control))
      return
    }
    const dispatched = redispatchEvent(this, event)

    if (dispatched && this.applyContext == false) {
      this.selected = !this.selected
    }
  }

  private handleKeydown = (event: KeyboardEvent) => {
    // Inside a list the list owns the keyboard; in a settings row the keys come from the control, caught just below.
    if (this.applyContext || this.disabled || isFromInteractiveContent(event, this)) return
    // modern-web-ignore: ime-enter the row renders no text field (the match is a selector string); keys from slotted interactive content return early above
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (this.href) this.renderRoot.querySelector('a')?.click()
      else this.activate()
    }
  }

  protected override willUpdate(changedProperties: PropertyValueMap<this>): void {
    // Custom states rather than host attributes: the list joins rows while the page upgrades, before a framework
    // hydrates, and an attribute the server never rendered is a hydration mismatch.
    if (changedProperties.has('joinedBefore')) this.toggleState('joined-before', this.joinedBefore)
    if (changedProperties.has('joinedAfter')) this.toggleState('joined-after', this.joinedAfter)
    if (changedProperties.has('applyContext')) {
      if (this.applyContext) {
        this.contextConsumer.applyContext()
      } else if (this.applyContext == false) {
        this.contextConsumer.unApplyContext()
      }
    }
  }

  protected override updated(changedProperties: PropertyValueMap<this>): void {
    // Only report real changes, not the initial render.
    if (changedProperties.has('selected') && changedProperties.get('selected') !== undefined) {
      this.dispatchEvent(
        new CustomEvent('selected-change', {
          bubbles: true,
          composed: true,
          detail: { selected: this.selected, value: this.value },
        }),
      )
    }
    this.syncAria()
    // A settings row names its control from a module loaded the first time a control slot is filled.
    // Once a row has had a control, it keeps syncing so that it lets the control go when it leaves.
    if (this.controlElement || this.hadControl) {
      this.hadControl = !!this.controlElement
      withControlModule((module) => module.syncControl(this))
    }
  }

  private toggleState(name: string, on: boolean) {
    if (on) this.internals.states.add(name)
    else this.internals.states.delete(name)
  }

  /**
   * Whether a `c2-list` owns this row, before it has said so through `applyContext`: the row is inside one, or is
   * slotted into one in another component's shadow root (`c2-select` slots its options that way), or sits in a
   * `c2-select`, whose list may not have rendered yet.
   */
  private belongsToList(): boolean {
    if (this.closest('c2-list, c2-select')) return true
    for (let slot = this.assignedSlot; slot; slot = slot.assignedSlot) {
      if (slot.closest('c2-list')) return true
      const host = (slot.getRootNode() as ShadowRoot).host
      if (host?.localName === 'c2-list') return true
    }
    return false
  }

  /** In a list that has not written its roving tabindex yet, asks it to first, so the row can take focus. */
  override focus(options?: FocusOptions): void {
    if (!this.hasAttribute('tabindex') && (this.applyContext || this.belongsToList())) {
      this.dispatchEvent(new Event(LIST_ITEM_FOCUS_REQUEST_EVENT, { bubbles: true }))
    }
    super.focus(options)
  }

  private syncAria() {
    const inList = this.applyContext
    const hasControl = !!this.controlElement
    // A `role` the author writes on the host wins in the accessibility tree; follow it for the state it implies.
    const role = this.getAttribute('role') ?? (hasControl ? null : this.href ? 'link' : inList ? 'option' : 'button')
    this.internals.role = role
    this.internals.ariaSelected = role === 'option' ? String(this.selected) : null
    this.internals.ariaPressed = role === 'button' ? String(this.selected) : null
    this.internals.ariaDisabled = this.disabled ? 'true' : null
    this.internals.ariaCurrent = this.current ? 'page' : null
    // Standalone rows are tab stops themselves; in a list the list assigns the roving tabindex. A standalone settings
    // row leaves the focus to its control (a tabindex on a row with no role of its own would be a stray tab stop).
    // A row inside a `c2-list` may update before the list has adopted it: it is still the list's, which writes the
    // tabindex only once it is used (a tabindex written while the page upgrades breaks a framework's hydration).
    if (!inList && !this.belongsToList()) {
      if (hasControl) this.removeAttribute('tabindex')
      else this.tabIndex = this.disabled ? -1 : 0
    } else if (this.disabled && this.hasAttribute('tabindex')) this.tabIndex = -1
  }

  private renderInner() {
    return html`
      <slot name="prefix-icon"></slot>
      <div class="c2-list-item__content">
        <div class="c2-list-item__text"><slot @slotchange=${this.handleSlotChange}>${this.label ?? this.value}</slot></div>
        <div class="c2-list-item__description" ?hidden=${!this.slotPresence.has('description')}>
          <slot name="description" @slotchange=${this.handleSlotChange}></slot>
        </div>
      </div>
      <slot name="suffix-icon"></slot>
      <slot name="control" part="control" @slotchange=${this.handleSlotChange}></slot>
    `
  }

  override render() {
    if (this.href && !this.disabled) {
      return html`<a
        class="c2-list-item"
        href=${this.href}
        target=${ifDefined(this.target)}
        rel=${this.target === '_blank' ? 'noopener noreferrer' : nothing}
        tabindex="-1"
        @click=${this.handleClick}
        >${this.renderInner()}</a
      >`
    }
    return html`<div class="c2-list-item" @click=${this.handleClick}>${this.renderInner()}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-list-item': ListItem
  }
}
