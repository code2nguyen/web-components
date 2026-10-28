import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { computePosition, autoUpdate, flip, shift, offset, type VirtualElement } from '@floating-ui/dom'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { selectionToolbarMessages } from './messages'
import styles from './selection-toolbar.scss?inline'

export { selectionToolbarMessages } from './messages'

/** The selection the toolbar is showing for. */
export interface ToolbarSelection {
  /** The selected text. */
  text: string
  /** A copy of the selected range. */
  range: Range
}

/** Events fired by {@link SelectionToolbar}, keyed for `addEventListener`. */
export interface SelectionToolbarEventMap {
  'selection-change': CustomEvent<{ text: string }>
  'selection-action': CustomEvent<{ action: string; text: string }>
  toggle: CustomEvent<{ open: boolean }>
}

export interface SelectionToolbar {
  addEventListener: TypedAddEventListener<SelectionToolbar, SelectionToolbarEventMap>
  removeEventListener: TypedRemoveEventListener<SelectionToolbar, SelectionToolbarEventMap>
}

/** Elements that take focus in the toolbar, in order. */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), c2-button, c2-icon-button, c2-toggle-button'

/** How long a keyboard selection has to stay still before the toolbar shows. */
const KEYBOARD_SETTLE = 300

/**
 * A toolbar that appears over the text a user selects, like the selection bubbles of Notion and Medium, the "Add
 * comment" button of Google Docs or "Ask ChatGPT" on a selection. It wraps the content it watches; the controls in its
 * `toolbar` slot are what it shows.
 *
 * It appears once a selection inside the content is complete (on pointer up, or after a short pause in a keyboard
 * selection) of at least `min-length` characters, centred above it (`placement="bottom"` puts it below; it flips when
 * there is no room), in the top layer so no overflow clips it, and follows the selection on scroll. It hides when the
 * selection collapses or leaves the content, and on Escape. Pressing one of its controls keeps the selection, so
 * `selection` (`{ text, range }`) is still there in the click handler; a control with `data-action` also fires
 * `selection-action` with that action and the text.
 *
 * Alt+F10 moves focus into the toolbar (the convention of TinyMCE, CKEditor and Google Docs); the arrow keys move
 * between its controls, Home and End go to the ends, and Escape returns focus to where it was. The toolbar is announced
 * once per selection. Selections inside other components' shadow roots and inside form fields are theirs, not this
 * toolbar's.
 *
 * @tag c2-selection-toolbar
 *
 * @slot - The content whose selections the toolbar acts on.
 * @slot toolbar - The toolbar's controls: `c2-button`, `c2-icon-button` or any focusable element. Give one `data-action` to have it fire `selection-action`.
 *
 * @event {CustomEvent<{ text: string }>} selection-change - Fired when the toolbar shows for a selection or its selection changes. Does not bubble.
 * @event {CustomEvent<{ action: string; text: string }>} selection-action - Fired when a toolbar control with `data-action` is pressed, with the action and the selected text.
 * @event {CustomEvent<{ open: boolean }>} toggle - Fired when the toolbar opens or closes.
 *
 * @csspart toolbar - The floating toolbar.
 *
 * @cssproperty {color} [--c2-selection-toolbar--background=#ffffff]
 * @cssproperty {border} [--c2-selection-toolbar--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-selection-toolbar--border-radius=8px]
 * @cssproperty {shadow} [--c2-selection-toolbar--box-shadow=0 4px 12px rgba(0, 0, 0, 0.12)]
 * @cssproperty {padding} [--c2-selection-toolbar--padding=4px]
 * @cssproperty {pixel} [--c2-selection-toolbar--gap=2px] - Space between the controls.
 * @cssproperty {pixel} [--c2-selection-toolbar--offset=8px] - Distance from the selection.
 */
@customElement('c2-selection-toolbar')
export class SelectionToolbar extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Where the toolbar sits: above the selection, or below it. It flips when there is no room. */
  @property({ reflect: true }) placement: 'top' | 'bottom' = 'top'

  /** The fewest characters, once trimmed, a selection needs for the toolbar to show. */
  @property({ type: Number, attribute: 'min-length' }) minLength = 1

  /** Never shows the toolbar. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The toolbar's accessible name. */
  @property() label = ''

  @state() private open = false
  @state() private hint = ''

  private readonly msg = new LocalizeController(this, selectionToolbarMessages)
  private range: Range | null = null
  private text = ''
  private pointerDown = false
  private settleTimer: ReturnType<typeof setTimeout> | undefined
  private cleanupPosition: (() => void) | undefined
  /** Where focus was before Alt+F10, to return it on Escape. */
  private returnFocus: HTMLElement | null = null

  /** The selection the toolbar is showing for, or `null` while it is hidden. */
  get selection(): ToolbarSelection | null {
    return this.open && this.range ? { text: this.text, range: this.range.cloneRange() } : null
  }

  override connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('selectionchange', this.handleSelectionChange)
    document.addEventListener('pointerup', this.handlePointerUp, true)
    // A touch long-press hands the gesture to native selection with a pointercancel, not a pointerup.
    document.addEventListener('pointercancel', this.handlePointerUp, true)
    document.addEventListener('keydown', this.handleDocumentKeydown, true)
    this.addEventListener('pointerdown', this.handlePointerDown)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    document.removeEventListener('selectionchange', this.handleSelectionChange)
    document.removeEventListener('pointerup', this.handlePointerUp, true)
    document.removeEventListener('pointercancel', this.handlePointerUp, true)
    document.removeEventListener('keydown', this.handleDocumentKeydown, true)
    this.removeEventListener('pointerdown', this.handlePointerDown)
    clearTimeout(this.settleTimer)
    this.hide()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('disabled') && this.disabled) this.hide()
  }

  private get panel(): HTMLElement | null {
    return this.renderRoot?.querySelector<HTMLElement>('.toolbar') ?? null
  }

  /** The toolbar's controls, in order. */
  private controls(): HTMLElement[] {
    const slot = this.renderRoot?.querySelector<HTMLSlotElement>('slot[name="toolbar"]')
    const assigned = (slot?.assignedElements({ flatten: true }) ?? []) as HTMLElement[]
    return assigned
      .flatMap((element) => (element.matches(FOCUSABLE) ? [element] : [...element.querySelectorAll<HTMLElement>(FOCUSABLE)]))
      .filter((element) => !element.hasAttribute('disabled'))
  }

  private inToolbar(node: Node | null): boolean {
    const slot = this.renderRoot?.querySelector<HTMLSlotElement>('slot[name="toolbar"]')
    return !!node && (slot?.assignedElements() ?? []).some((element) => element.contains(node))
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (this.inToolbar(event.target as Node)) return
    this.pointerDown = true
  }

  private readonly handlePointerUp = () => {
    if (!this.pointerDown) return
    this.pointerDown = false
    // The selection is final once the pointer is up; read it after the browser updates it.
    setTimeout(() => this.refresh(), 0)
  }

  private readonly handleSelectionChange = () => {
    if (this.pointerDown) return
    clearTimeout(this.settleTimer)
    const selection = document.getSelection()
    // A collapsed selection, or one that left the content, hides at once; a growing one waits to settle.
    if (!selection || selection.isCollapsed || !this.ownsSelection(selection)) {
      if (this.open && !this.inToolbar(document.activeElement)) this.hide()
      return
    }
    this.settleTimer = setTimeout(() => this.refresh(), KEYBOARD_SETTLE)
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if (!this.open) return
    if (event.key === 'F10' && event.altKey) {
      event.preventDefault()
      const first = this.controls()[0]
      if (!first) return
      this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      first.focus()
    } else if (event.key === 'Escape') {
      const focusInside = this.inToolbar(document.activeElement)
      this.hide()
      if (focusInside) {
        event.preventDefault()
        this.returnFocus?.focus()
        this.returnFocus = null
      }
    }
  }

  /** Whether the selection lies inside the content (and not in the toolbar). */
  private ownsSelection(selection: Selection): boolean {
    if (selection.rangeCount === 0) return false
    // Text selected in a form field is the field's: some engines report it as a range around the field.
    // Focus may sit inside a component's shadow root (a c2-text-field), so walk down to the innermost element.
    let active = document.activeElement
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
    const field = (element: Element | null) =>
      !!element && (element.matches('input, textarea') || (element.constructor as { formAssociated?: boolean }).formAssociated === true)
    if (document.activeElement && this.contains(document.activeElement) && (field(active) || field(document.activeElement))) return false
    // Both ends inside the content, so a selection across two paragraphs (whose common ancestor is this element) counts.
    const range = selection.getRangeAt(0)
    const inside = (node: Node) => node !== this && this.contains(node) && !this.inToolbar(node)
    return inside(range.startContainer) && inside(range.endContainer)
  }

  /** Shows, moves or hides the toolbar for the current selection. */
  private refresh(): void {
    const selection = document.getSelection()
    if (this.disabled || !selection || selection.isCollapsed || !this.ownsSelection(selection)) {
      this.hide()
      return
    }
    const text = selection.toString()
    if (text.trim().length < Math.max(1, this.minLength || 1)) {
      this.hide()
      return
    }
    const range = selection.getRangeAt(0).cloneRange()
    const changed = text !== this.text || !this.open
    this.range = range
    this.text = text
    void this.show()
    if (changed) this.dispatchEvent(new CustomEvent('selection-change', { detail: { text } }))
  }

  private async show(): Promise<void> {
    const wasOpen = this.open
    this.open = true
    await this.updateComplete
    const panel = this.panel
    // Hidden again while the render was pending.
    if (!panel || !this.open) return
    if (!wasOpen) {
      try {
        panel.showPopover()
      } catch {
        // Already shown, or popovers unsupported: it is still positioned below.
      }
      this.announce()
      this.dispatchEvent(new CustomEvent('toggle', { detail: { open: true } }))
    }
    this.cleanupPosition?.()
    const range = this.range
    if (!range) return
    const anchor: VirtualElement = {
      getBoundingClientRect: () => range.getBoundingClientRect(),
      getClientRects: () => range.getClientRects(),
      contextElement: this,
    }
    // The offset is resolved by the stylesheet onto scroll-margin-top, which computes to pixels whatever its unit.
    const resolved = parseFloat(getComputedStyle(panel).scrollMarginTop)
    const distance = Number.isFinite(resolved) ? resolved : 8
    this.cleanupPosition = autoUpdate(anchor, panel, async () => {
      const { x, y } = await computePosition(anchor, panel, {
        strategy: 'fixed',
        placement: this.placement === 'bottom' ? 'bottom' : 'top',
        middleware: [offset(distance), flip(), shift({ padding: 8 })],
      })
      panel.style.left = `${x}px`
      panel.style.top = `${y}px`
    })
  }

  private hide(): void {
    clearTimeout(this.settleTimer)
    this.cleanupPosition?.()
    this.cleanupPosition = undefined
    if (!this.open) return
    this.open = false
    this.range = null
    this.text = ''
    this.hint = ''
    try {
      this.panel?.hidePopover()
    } catch {
      // Not shown as a popover.
    }
    this.dispatchEvent(new CustomEvent('toggle', { detail: { open: false } }))
  }

  private announce(): void {
    this.hint = ''
    setTimeout(() => {
      if (this.open) this.hint = this.msg.t('hint')
    }, 100)
  }

  /** Keeps the selection when a control is pressed: focus moving to a button would otherwise clear it. */
  private handleToolbarPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable]')) return
    event.preventDefault()
  }

  private handleToolbarClick(event: Event): void {
    const control = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!control || !this.inToolbar(control) || !this.open) return
    this.dispatchEvent(
      new CustomEvent('selection-action', { detail: { action: control.dataset.action ?? '', text: this.text }, bubbles: true, composed: true }),
    )
  }

  private handleToolbarKeydown(event: KeyboardEvent): void {
    const controls = this.controls()
    const at = controls.findIndex((control) => control === document.activeElement || control.contains(document.activeElement))
    let target: HTMLElement | undefined
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        target = controls[(at + 1) % controls.length]
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        target = controls[(at - 1 + controls.length) % controls.length]
        break
      case 'Home':
        target = controls[0]
        break
      case 'End':
        target = controls[controls.length - 1]
        break
      default:
        return
    }
    event.preventDefault()
    target?.focus()
  }

  override render() {
    return html`<slot></slot>
      <div
        class="toolbar ${this.open ? 'toolbar--open' : ''}"
        part="toolbar"
        popover="manual"
        role="toolbar"
        aria-orientation="horizontal"
        aria-label=${this.label || this.msg.t('label')}
        @pointerdown=${this.handleToolbarPointerDown}
        @mousedown=${this.handleToolbarPointerDown}
        @click=${this.handleToolbarClick}
        @keydown=${this.handleToolbarKeydown}
      >
        <slot name="toolbar"></slot>
      </div>
      <div class="visually-hidden" role="status">${this.hint}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-selection-toolbar': SelectionToolbar
  }
}
