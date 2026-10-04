import { LitElement, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { ariaKeyShortcuts, formatShortcut, registerShortcuts, type ShortcutBindingOptions, type ShortcutMatch } from '@c2n/core/shortcut-helper.js'
import styles from './shortcut.scss?inline'

export { formatShortcut, ariaKeyShortcuts, parseShortcut, isApplePlatform } from '@c2n/core/shortcut-helper.js'

/** One keyboard shortcut held by a `c2-shortcut` element. Only `keys` is required. */
export interface ShortcutBinding extends ShortcutBindingOptions {
  /** `mod+k`, `ctrl+shift+p`, `mod+k, alt+/` (alternatives), `mod+k mod+s` (a sequence). `mod` is ⌘ on Apple platforms, Ctrl elsewhere. Every key needs Ctrl, ⌘ or Alt; only `escape` and `f1`–`f24` may stand alone. */
  keys: string
  /** Name to switch on in the `shortcut` event (`detail.action`). */
  action?: string
  /** Id of an element to activate when the shortcut fires: a text field (native or `c2-text-field`-like) is focused, anything else is clicked. */
  for?: string
  /** Called when the shortcut fires, after the `shortcut` event, unless that event was cancelled. Script only. */
  handler?: (detail: ShortcutEventDetail) => void
  /** Human text for a cheatsheet or a command palette. */
  description?: string
}

/** A binding with its platform-aware labels, as returned by {@link Shortcut.entries}. */
export interface ShortcutEntry extends ShortcutBinding {
  /** Display label of every alternative joined with `, ` (`⌘K, ⌥/` on macOS, `Ctrl+K, Alt+/` elsewhere). */
  label: string
  /** Display label of each alternative. */
  labels: string[]
}

export interface ShortcutEventDetail {
  action: string | undefined
  /** The alternative that matched, as written in `keys`. */
  keys: string
  binding: ShortcutBinding
  originalEvent: KeyboardEvent
}

/** Events fired by {@link Shortcut}, keyed for `addEventListener`. */
export interface ShortcutEventMap {
  shortcut: CustomEvent<ShortcutEventDetail>
}

export interface Shortcut {
  addEventListener: TypedAddEventListener<Shortcut, ShortcutEventMap>
  removeEventListener: TypedRemoveEventListener<Shortcut, ShortcutEventMap>
}

const EDITABLE_TARGET =
  'input:not([type=button],[type=checkbox],[type=radio],[type=submit],[type=reset],[type=file],[type=range],[type=color],[type=image]),textarea,select,[contenteditable]:not([contenteditable=false])'

const INNER_CONTROL = 'button, input, a[href], summary, [role=button], [role=switch], [role=checkbox], [role=tab], [role=menuitem]'

/**
 * Turns keyboard shortcuts into events. One element holds every shortcut of an application (or of a region) in
 * its `bindings` list and renders nothing. When a binding's keys are pressed the element calls `preventDefault()`
 * on the key event, fires `shortcut` with the binding's `action`, then runs the binding's `handler` and activates
 * its `for` target, unless the event was cancelled.
 *
 * Every key must be composed with Ctrl, ⌘ or Alt (`mod+k`, `alt+1`, `mod+k mod+s`); only Escape and F1–F24 may be
 * bound on their own, and those are ignored while the user types in a field unless `allowInInputs` is set. A binding's `scope` limits it to focus inside the element's parent (`parent`) or inside any element matching
 * a CSS selector; when several bindings match, the most narrowly scoped wins, across every `c2-shortcut` on the page.
 * A key a component has already handled (`preventDefault()` on it) is left alone.
 *
 * @tag c2-shortcut
 *
 * @event {CustomEvent<ShortcutEventDetail>} shortcut - Fired when a binding's keys are pressed. `detail.action` is the binding's `action`, `detail.keys` the alternative that matched, `detail.binding` the binding and `detail.originalEvent` the `keydown`. Cancelable: `preventDefault()` skips the binding's `handler` and `for` target. Does not bubble.
 */
@customElement('c2-shortcut')
export class Shortcut extends LitElement {
  static override styles = unsafeCSS(styles)

  /**
   * The shortcuts: `{ keys, action?, for?, handler?, scope?, description?, allowInInputs?, allowDefault?, repeat?, disabled? }`
   * objects. As an attribute, a JSON array. Assigning a new array replaces every binding.
   */
  @property({ converter: jsonPropertyConverter }) bindings: ShortcutBinding[] = []

  /** Pause every binding of this element. */
  @property({ type: Boolean, reflect: true }) disabled = false

  private unregister: (() => void) | undefined
  /** Targets this element wrote `aria-keyshortcuts` on, so it removes only what it added. */
  private labelledTargets = new Map<Element, string>()

  /** Every binding with its platform-aware display labels, for a cheatsheet or a command palette. */
  get entries(): ShortcutEntry[] {
    return this.validBindings().map((binding) => {
      const labels = formatShortcut(binding.keys)
      return { ...binding, labels, label: labels.join(', ') }
    })
  }

  override connectedCallback() {
    super.connectedCallback()
    if (isServer) return
    this.unregister = registerShortcuts(
      this,
      () => (this.disabled ? [] : this.validBindings()),
      (match) => this.handleMatch(match),
    )
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unregister?.()
    this.unregister = undefined
    this.clearAriaKeyShortcuts()
  }

  protected override updated(changed: PropertyValues<this>) {
    if (changed.has('bindings') || changed.has('disabled')) this.syncAriaKeyShortcuts()
  }

  override render() {
    return nothing
  }

  private validBindings(): ShortcutBinding[] {
    return Array.isArray(this.bindings) ? this.bindings.filter((binding) => binding && typeof binding.keys === 'string' && binding.keys.trim()) : []
  }

  private findTarget(id: string): HTMLElement | null {
    const root = this.getRootNode() as Document | ShadowRoot
    return (root.getElementById?.(id) as HTMLElement | null) ?? (typeof document === 'undefined' ? null : document.getElementById(id))
  }

  private handleMatch({ binding, keys, event }: ShortcutMatch<ShortcutBinding>) {
    const detail: ShortcutEventDetail = { action: binding.action, keys, binding, originalEvent: event }
    const proceed = this.dispatchEvent(new CustomEvent('shortcut', { detail, cancelable: true }))
    if (!proceed) return
    binding.handler?.(detail)
    if (binding.for) this.activate(binding.for)
  }

  private activate(id: string) {
    const target = this.findTarget(id)
    if (!target || (target as HTMLElement & { disabled?: boolean }).disabled) return
    // A field (native, or a custom element wrapping one, such as `c2-text-field`) is focused; clicking it would not.
    const field = target.matches(EDITABLE_TARGET) || !!target.shadowRoot?.querySelector(EDITABLE_TARGET)
    if (field) target.focus()
    // A click dispatched on a custom element's host never reaches the control inside it (a `c2-switch` would not
    // toggle), so the inner control is clicked; its click is composed and still reaches listeners on the host.
    else (target.shadowRoot?.querySelector<HTMLElement>(INNER_CONTROL) ?? target).click()
  }

  /** Announce each `for` target's shortcut, leaving any `aria-keyshortcuts` the author wrote untouched. */
  private syncAriaKeyShortcuts() {
    this.clearAriaKeyShortcuts()
    if (this.disabled || !this.isConnected) return
    const values = new Map<HTMLElement, string[]>()
    for (const binding of this.validBindings()) {
      if (!binding.for || binding.disabled) continue
      const target = this.findTarget(binding.for)
      const value = ariaKeyShortcuts(binding.keys)
      if (!target || !value || target.hasAttribute('aria-keyshortcuts')) continue
      values.set(target, [...(values.get(target) ?? []), value])
    }
    for (const [target, list] of values) {
      const value = list.join(' ')
      target.setAttribute('aria-keyshortcuts', value)
      this.labelledTargets.set(target, value)
    }
  }

  private clearAriaKeyShortcuts() {
    for (const [target, value] of this.labelledTargets) {
      if (target.getAttribute('aria-keyshortcuts') === value) target.removeAttribute('aria-keyshortcuts')
    }
    this.labelledTargets.clear()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-shortcut': Shortcut
  }
}
