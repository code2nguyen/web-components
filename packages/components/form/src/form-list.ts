import { LitElement, html, isServer, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { hasSlottedContent } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { formListMessages } from './messages'
import styles from './form-list.scss?inline'

/** One row's values, keyed by each control's name in the template. A name used twice in a row becomes an array. */
export type FormListRowValue = Record<string, unknown>

/** What a `data-action` element in the list does. */
export type FormListAction = 'add' | 'remove' | 'duplicate' | 'move-up' | 'move-down'

export interface RowsChangeEventDetail {
  /** `add`, `remove`, `duplicate`, `move`, `set` (the `value` property) or `reset` (the form was reset). */
  action: 'add' | 'remove' | 'duplicate' | 'move' | 'set' | 'reset'
  /** The row's index after the change (for `remove`, the index it had). -1 for `set` and `reset`. */
  index: number
  /** For `move`: the index the row had before. */
  from?: number
  /** Every row's values after the change. */
  value: FormListRowValue[]
}

/** Events fired by {@link FormList}, keyed for `addEventListener`. */
export interface FormListEventMap {
  'rows-change': CustomEvent<RowsChangeEventDetail>
  change: Event
}

export interface FormList {
  addEventListener: TypedAddEventListener<FormList, FormListEventMap>
  removeEventListener: TypedRemoveEventListener<FormList, FormListEventMap>
}

type Control = HTMLElement & { name?: string; value?: unknown; checked?: unknown; disabled?: boolean }
type Actionable = HTMLElement & { disabled?: boolean }

/** The original name of each control, before the list wrote the row index into it. */
const keys = new WeakMap<Element, string>()

/**
 * A repeatable group of fields, the companion of `c2-form`: "Add another" appends a row cloned from a `<template>`,
 * and each row can be removed, duplicated and moved. The rows are light-DOM children, so their controls stay in the
 * native `<form>` and its `FormData`, validation and `c2-form-field`s work as for any other control.
 *
 * Put the row markup in a `<template>` child; rows authored next to it are the initial rows. With a `name`, each
 * control's name gets the row's index (`name="email"` in the template becomes `contacts.0.email`), which keeps radio
 * groups apart and lets a server read the rows back; without one, names stay as written. `value` reads and writes
 * the rows as an array of objects keyed by those template names.
 *
 * The list has no per-row buttons of its own: any element inside it with `data-action="remove"`, `"duplicate"`,
 * `"move-up"`, `"move-down"` or `"add"` does that to its row (`add` inserts after its row, or at the end outside a
 * row), and is disabled while the action is not possible (`min`, `max`, first and last row). The default `footer`
 * holds an "Add another" button. An element with `data-row-number` shows its row's 1-based position, for headings
 * such as "Contact 2".
 *
 * After adding or duplicating, focus moves to the new row's first control; after removing, to the next row, the
 * previous one, or the add button. Changes are announced to screen readers. Resetting the form restores the rows the
 * list started with (unless a `reset` listener that ran before the list's cancelled it).
 *
 * The host exposes custom states: `:state(empty)`, `:state(at-min)` and `:state(at-max)`.
 *
 * @tag c2-form-list
 *
 * @slot default - The `<template>` of a row, then the initial rows.
 * @slot footer - Replaces the default "Add another" button; an element with `data-action="add"` in it adds a row.
 * @slot empty - Shown while the list has no rows.
 *
 * @event {CustomEvent<RowsChangeEventDetail>} rows-change - A row was added, removed, duplicated or moved, or the rows were replaced by `value` or a form reset. Detail: `{ action, index, from, value }`. It does not bubble; a bubbling `change` also fires so a surrounding `c2-form` sees the edit.
 * @event {Event} change - Fired with `rows-change`, and bubbles, so a surrounding `c2-form` or a generic two-way binding sees the rows change.
 *
 * @cssproperty {grid-column} [--c2-form-list--grid-column=1 / -1] - Columns the list spans in a `c2-form` grid.
 * @cssproperty {pixel} [--c2-form-list--gap=12px] - Space between the rows, and before the footer.
 * @cssproperty {padding} [--c2-form-list__add--padding=6px 12px]
 * @cssproperty {border} [--c2-form-list__add--border=1px dashed #d4d4d8]
 * @cssproperty {border-radius} [--c2-form-list__add--border-radius=6px]
 * @cssproperty {color} [--c2-form-list__add--background=#ffffff]
 * @cssproperty {color} [--c2-form-list__add--color=#18181b]
 * @cssproperty {font-size} [--c2-form-list__add--font-size=14px]
 * @cssproperty {font-weight} [--c2-form-list__add--font-weight=500]
 * @cssproperty {color} [--c2-form-list__add__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-form-list__add__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {number} [--c2-form-list__add__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-form-list__empty--color=#71717a]
 * @cssproperty {font-size} [--c2-form-list__empty--font-size=14px]
 *
 * @csspart rows - The wrapper of the default slot.
 * @csspart footer - The wrapper of the `footer` slot.
 * @csspart add - The default "Add another" button.
 * @csspart empty - The wrapper of the `empty` slot.
 */
@customElement('c2-form-list')
export class FormList extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, formListMessages)

  /** Prefix of the controls' names: `contacts` names a template control `email` `contacts.0.email`, `contacts.1.email`… Empty leaves the names as written. */
  @property({ type: String }) name = ''

  /** The fewest rows: the list starts with that many, and `remove` is disabled at it. */
  @property({ type: Number }) min = 0

  /** The most rows: `add` and `duplicate` are disabled at it. Unset is no limit. */
  @property({ type: Number }) max: number | undefined = undefined

  /** Accessible name of the default add button. Empty uses the `add` message ("Add another"). */
  @property({ attribute: 'add-label' }) addLabel = ''

  @state() private announcement = ''
  @state() private count = 0
  @state() private hasEmpty = false
  @state() private hasTemplate = false

  private initialRows: Element[] | null = null
  private edited = false
  private waitingForParse = false
  private formElement: HTMLFormElement | null = null
  private ownDisabled = new WeakSet<Element>()

  /** The rows, in order. */
  get rows(): HTMLElement[] {
    return [...this.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement && !child.slot && !['template', 'script', 'style'].includes(child.localName),
    )
  }

  /** Every row's values, keyed by the template's control names. Setting it replaces the rows, kept within `min` and `max`. */
  get value(): FormListRowValue[] {
    return this.rows.map((row) => this.readRow(row))
  }

  set value(rows: FormListRowValue[]) {
    const wanted = Math.max(this.min || 0, Math.min(rows?.length ?? 0, this.limit))
    const current = this.rows
    this.edited = true
    for (const row of current.slice(wanted)) row.remove()
    for (let index = current.length; index < wanted; index++) this.insertRow(this.createRow(), this.rows.length)
    this.sync()
    this.rows.forEach((row, index) => this.writeRow(row, rows?.[index] ?? {}, true))
    this.notify('set', -1)
  }

  /** Inserts a row from the template at `index` (default: the end), filled with `values`. Returns it, or `null` at `max` or without a template. */
  addRow(values?: FormListRowValue, index = this.rows.length): HTMLElement | null {
    if (this.rows.length >= this.limit) return null
    const row = this.createRow()
    if (!row) return null
    this.edited = true
    this.insertRow(row, index)
    this.sync()
    if (values) this.writeRow(row, values)
    this.afterInsert(row, 'add')
    return row
  }

  /** Removes the row at `index`, unless the list is at `min`. */
  removeRow(index: number): boolean {
    const rows = this.rows
    const row = rows[index]
    if (!row || rows.length <= (this.min || 0)) return false
    const hadFocus = row.contains(this.activeElement())
    this.edited = true
    row.remove()
    this.sync()
    this.notify('remove', index)
    this.announce(this.msg.t('removed', index + 1))
    if (hadFocus) {
      const next = this.rows[index] ?? this.rows[index - 1]
      if (!next || !this.focusFirst(next)) this.focusAdd()
    }
    return true
  }

  /** Inserts a copy of the row at `index`, with its current values, right after it. */
  duplicateRow(index: number): HTMLElement | null {
    const source = this.rows[index]
    if (!source || this.rows.length >= this.limit) return null
    const values = this.readRow(source)
    const row = this.createRow() ?? (source.cloneNode(true) as HTMLElement)
    this.edited = true
    this.insertRow(row, index + 1)
    this.sync()
    this.writeRow(row, values)
    this.afterInsert(row, 'duplicate')
    return row
  }

  /** Moves the row at `from` to `to`. Focus stays where it was. */
  moveRow(from: number, to: number): boolean {
    const rows = this.rows
    const row = rows[from]
    if (!row || to < 0 || to >= rows.length || to === from) return false
    const active = this.activeElement()
    const reference = to > from ? rows[to].nextSibling : rows[to]
    this.edited = true
    this.insertBefore(row, reference)
    this.sync()
    if (active instanceof HTMLElement && row.contains(active)) {
      // Moving drops focus: restore it, or move it to the counterpart of a button now disabled at the edge.
      const counterpart = active.dataset.action === 'move-up' ? 'move-down' : active.dataset.action === 'move-down' ? 'move-up' : ''
      const other = counterpart ? row.querySelector<Actionable>(`[data-action="${counterpart}"]`) : null
      const target = !(active as Actionable).disabled ? active : other && !other.disabled ? other : null
      if (target) target.focus()
      else this.focusFirst(row)
    }
    this.notify('move', to, from)
    this.announce(this.msg.t('moved', to + 1, rows.length))
    return true
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener('click', this.handleClick)
    this.attachForm(this.closest('form'))
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener('click', this.handleClick)
    this.attachForm(null)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed)
    if (isServer) return
    if (!this.hasUpdated) this.hasEmpty = hasSlottedContent(this, 'empty')
    if (changed.has('name') || changed.has('min') || changed.has('max')) this.sync()
  }

  private get limit(): number {
    return typeof this.max === 'number' && !Number.isNaN(this.max) ? Math.max(this.max, 0) : Infinity
  }

  private get template(): HTMLTemplateElement | null {
    return [...this.children].find((child): child is HTMLTemplateElement => child instanceof HTMLTemplateElement) ?? null
  }

  private createRow(): HTMLElement | null {
    const fragment = this.template ? document.importNode(this.template.content, true) : undefined
    // So a c2-form-field connects with its control already upgraded.
    if (fragment) customElements.upgrade(fragment)
    const row = fragment ? [...fragment.children].find((child): child is HTMLElement => child instanceof HTMLElement) : undefined
    return row ?? null
  }

  private insertRow(row: HTMLElement | null, index: number) {
    if (!row) return
    const rows = this.rows
    const reference = rows[index] ?? rows[rows.length - 1]?.nextSibling ?? null
    this.insertBefore(row, reference && reference.parentNode === this ? reference : null)
    for (const element of [row, ...row.querySelectorAll('[name]')]) {
      if (element.hasAttribute('name') && !keys.has(element)) keys.set(element, this.parseKey(element.getAttribute('name') ?? ''))
    }
  }

  private afterInsert(row: HTMLElement, action: 'add' | 'duplicate') {
    const index = this.rows.indexOf(row)
    this.notify(action, index)
    this.announce(this.msg.t('added', index + 1))
    const pending = [...row.querySelectorAll('*')].map((element) => (element as Element & { updateComplete?: Promise<unknown> }).updateComplete)
    void Promise.all(pending).then(() => this.focusFirst(row))
  }

  /** Brings the rows to `min`, writes indexes into names and row numbers, and enables the actions that apply. */
  private sync() {
    let rows = this.rows
    // Filling to `min` while the parser appends authored rows would put a blank row first.
    const parsing = document.readyState === 'loading'
    if (parsing && !this.waitingForParse) {
      this.waitingForParse = true
      document.addEventListener('DOMContentLoaded', () => this.sync(), { once: true })
    }
    while (!parsing && rows.length < (this.min || 0) && rows.length < this.limit) {
      const row = this.createRow()
      if (!row) break
      this.insertRow(row, rows.length)
      rows = this.rows
    }
    // Until the first edit, the rows are the initial set a reset restores.
    if (!this.edited) this.initialRows = rows
    this.hasTemplate = !!this.template
    rows.forEach((row, index) => {
      for (const control of this.controls(row)) {
        const key = this.keyOf(control)
        const name = this.name ? `${this.name}.${index}.${key}` : key
        if (control.getAttribute('name') !== name) control.setAttribute('name', name)
      }
      for (const number of this.owned(row.querySelectorAll<HTMLElement>('[data-row-number]'))) {
        const text = String(index + 1)
        if (number.textContent !== text) number.textContent = text
      }
    })
    const count = rows.length
    this.count = count
    const indexes = new Map<Element, number>(rows.map((row, index) => [row, index]))
    for (const element of this.owned(this.querySelectorAll<HTMLElement>('[data-action]'))) {
      const row = this.rowOf(element)
      const index = row ? (indexes.get(row) ?? -1) : -1
      const action = element.dataset.action as FormListAction
      const possible =
        action === 'add' || action === 'duplicate'
          ? count < this.limit
          : action === 'remove'
            ? count > (this.min || 0)
            : action === 'move-up'
              ? index > 0
              : action === 'move-down'
                ? index >= 0 && index < count - 1
                : true
      this.setPossible(element as Actionable, possible)
    }
    const states: Record<string, boolean> = { empty: count === 0, 'at-min': count <= (this.min || 0), 'at-max': count >= this.limit }
    for (const [name, on] of Object.entries(states)) {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }
  }

  /** Disables an action the list cannot do, and re-enables only what the list itself disabled. */
  private setPossible(element: Actionable, possible: boolean) {
    if (!possible && !element.disabled) {
      element.disabled = true
      this.ownDisabled.add(element)
    } else if (possible && this.ownDisabled.has(element)) {
      element.disabled = false
      this.ownDisabled.delete(element)
    }
  }

  /** The elements in this list, not in a list nested inside one of its rows. */
  private *owned<T extends Element>(elements: Iterable<T>): Iterable<T> {
    for (const element of elements) {
      if ((element.localName === 'c2-form-list' ? element.parentElement : element)?.closest('c2-form-list') === (this as Element)) yield element
    }
  }

  private controls(row: HTMLElement): Control[] {
    const named = [row, ...row.querySelectorAll('[name]')].filter((element) => element.hasAttribute('name') && isControl(element))
    return [...this.owned(named)] as Control[]
  }

  private rowOf(element: Element): HTMLElement | null {
    let node: Element | null = element
    while (node && node.parentElement !== this) node = node.parentElement
    return node instanceof HTMLElement && !node.slot && node.localName !== 'template' ? node : null
  }

  private keyOf(control: Element): string {
    const known = keys.get(control)
    if (known !== undefined) return known
    const key = this.parseKey(control.getAttribute('name') ?? '')
    keys.set(control, key)
    return key
  }

  /** A name the list indexed (`contacts.0.email`, from a server render or a cloned row) without its prefix and index. */
  private parseKey(name: string): string {
    const prefix = `${this.name}.`
    const match = this.name && name.startsWith(prefix) ? /^\d+\.(.+)$/.exec(name.slice(prefix.length)) : null
    return match ? match[1] : name
  }

  private readRow(row: HTMLElement): FormListRowValue {
    const values: FormListRowValue = {}
    for (const control of this.controls(row)) {
      // As FormData, a control disabled itself or by its fieldset is left out.
      if (control.matches(':disabled')) continue
      let value: unknown
      if (isCheckable(control)) {
        if (!control.checked) continue
        value = control.value === undefined || control.value === '' ? 'on' : control.value
      } else if ('value' in control) {
        value = control.value
      } else {
        continue
      }
      const key = this.keyOf(control)
      const existing = values[key]
      values[key] = existing === undefined ? value : Array.isArray(existing) && !Array.isArray(value) ? [...existing, value] : [existing, value]
    }
    return values
  }

  /** Writes `values` into a row's controls; with `clear`, a control whose key is missing is emptied. */
  private writeRow(row: HTMLElement, values: FormListRowValue, clear = false) {
    for (const control of this.controls(row)) {
      const key = this.keyOf(control)
      if (!(key in values) && !clear) continue
      const value = key in values ? values[key] : control.localName === 'c2-form-list' ? [] : undefined
      if (isCheckable(control)) {
        const own = control.value === undefined || control.value === '' ? 'on' : control.value
        control.checked = value === true || value === own || (Array.isArray(value) && value.includes(own))
      } else if ('value' in control) {
        control.value = control.localName === 'c2-form-list' || Array.isArray(value) ? value : value == null ? '' : String(value)
      }
    }
  }

  private handleClick = (event: Event) => {
    const target = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute('data-action'))
    if (!target || [...this.owned([target])].length === 0 || (target as Actionable).disabled) return
    const row = this.rowOf(target)
    const index = row ? this.rows.indexOf(row) : -1
    const action = target.dataset.action as FormListAction
    if (action === 'add') this.addRow(undefined, index >= 0 ? index + 1 : this.rows.length)
    else if (index < 0) return
    else if (action === 'remove') this.removeRow(index)
    else if (action === 'duplicate') this.duplicateRow(index)
    else if (action === 'move-up') this.moveRow(index, index - 1)
    else if (action === 'move-down') this.moveRow(index, index + 1)
    else return
    event.preventDefault()
  }

  private attachForm(form: HTMLFormElement | null) {
    this.formElement?.removeEventListener('reset', this.handleReset)
    this.formElement = form
    form?.addEventListener('reset', this.handleReset)
  }

  /** The form resets its controls after this event: put the initial rows back first, so they reset with it. */
  private handleReset = (event: Event) => {
    const initial = this.initialRows
    if (event.defaultPrevented) return
    if (!initial) return
    const current = this.rows
    if (current.length === initial.length && current.every((row, index) => row === initial[index])) return
    for (const row of current) if (!initial.includes(row)) row.remove()
    for (const row of initial) this.appendChild(row)
    this.sync()
    this.notify('reset', -1)
  }

  private notify(action: RowsChangeEventDetail['action'], index: number, from?: number) {
    const read = () => this.value
    const detail: RowsChangeEventDetail = {
      action,
      index,
      get value() {
        return read()
      },
    }
    if (from !== undefined) detail.from = from
    this.dispatchEvent(new CustomEvent<RowsChangeEventDetail>('rows-change', { detail }))
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  private announce(message: string) {
    // Cleared first, so a repeated message is spoken again.
    this.announcement = ''
    void this.updateComplete.then(() => (this.announcement = message))
  }

  private focusAdd() {
    const own = this.owned(this.querySelectorAll<HTMLElement>('[data-action="add"]'))
    for (const element of own) {
      if (!(element as Actionable).disabled) return element.focus()
    }
    const button = this.renderRoot.querySelector<HTMLButtonElement>('[part="add"]')
    if (button && !button.disabled) button.focus()
  }

  private activeElement(): Element | null {
    return (this.getRootNode() as Document | ShadowRoot).activeElement ?? null
  }

  /** Focuses a row's first control, else its first focusable element. Returns whether the row took focus. */
  private focusFirst(row: HTMLElement): boolean {
    for (const element of [...this.controls(row), ...row.querySelectorAll<HTMLElement>(FOCUSABLE)]) {
      if (element === row || (element as Actionable).disabled) continue
      element.focus()
      if (row.contains(this.activeElement())) return true
    }
    return false
  }

  private handleSlotChange = () => this.sync()

  private handleEmptySlotChange = (event: Event) => {
    this.hasEmpty = (event.target as HTMLSlotElement).assignedNodes({ flatten: true }).length > 0
  }

  override render() {
    const atMax = this.count >= this.limit
    const label = this.addLabel || this.msg.t('add')
    return html`<div class="rows" part="rows"><slot @slotchange=${this.handleSlotChange}></slot></div>
      <div class="empty" part="empty" ?hidden=${!this.hasEmpty || this.count > 0}><slot name="empty" @slotchange=${this.handleEmptySlotChange}></slot></div>
      <div class="footer" part="footer">
        <slot name="footer">
          <button class="add" part="add" type="button" ?disabled=${atMax || !this.hasTemplate} @click=${() => this.addRow()}>
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M8 3v10M3 8h10" /></svg>
            <span>${label}</span>
          </button>
        </slot>
      </div>
      <div class="live" role="status" aria-live="polite">${this.announcement}</div>`
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable]'

/** A form control (native or form-associated) or a nested list: what carries a row's values. Not `c2-avatar name`. */
function isControl(element: Element): boolean {
  if (element.localName === 'c2-form-list') return true
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) return true
  return (element.constructor as { formAssociated?: boolean }).formAssociated === true
}

/** A checkbox or radio: its value counts only while checked. A text `<input>` has a `checked` property too. */
function isCheckable(control: Control): boolean {
  if (control instanceof HTMLInputElement) return control.type === 'checkbox' || control.type === 'radio'
  return typeof control.checked === 'boolean'
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-form-list': FormList
  }
}
