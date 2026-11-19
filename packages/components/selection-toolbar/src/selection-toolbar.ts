import { LitElement, isServer, nothing, html, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { computePosition, autoUpdate, flip, shift, offset, type VirtualElement } from '@floating-ui/dom'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { composedSelectionRange, isFormControl } from '@c2n/core/dom-helper.js'
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
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), c2-button, c2-icon-button, c2-toggle-button, c2-text-field, c2-textarea, c2-chat-input'

/** `node`, or the host of the shadow root holding it, climbed until it is in `root`'s tree; null when it never is. */
function retarget(node: Node, root: Node): Node | null {
  let current: Node = node
  while (current.getRootNode() !== root) {
    const own = current.getRootNode()
    if (!(own instanceof ShadowRoot)) return null
    current = own.host
  }
  return current
}

/** Whether `node` is inside `ancestor`, through the hosts of the shadow roots between them. */
function composedContains(ancestor: Element, node: Node): boolean {
  const own = retarget(node, ancestor.getRootNode())
  return !!own && ancestor.contains(own)
}

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
 * once per selection. Selections inside form fields are theirs, not this toolbar's, and so by default are selections
 * inside other components' shadow roots: `composed` opts in to those (a `c2-text-annotator`'s text, say).
 *
 * `prompting` (or pressing a control with `data-prompt`) turns it into an inline prompt at the same anchor: the
 * `prompt` and `result` slots replace the controls, focus moves to the first field, and the selection, or the caret
 * when nothing is selected, stays frozen until Escape or `prompting = false`.
 *
 * @tag c2-selection-toolbar
 *
 * @slot - The content whose selections the toolbar acts on: text, a `c2-markdown` answer, a `c2-text-field`.
 * @slot toolbar - The toolbar's controls: `c2-button`, `c2-icon-button` or any focusable element. Give one `data-action` to have it fire `selection-action`.
 * @slot prompt - Shown while `prompting`: the field (a `c2-chat-input` or `c2-text-field`) and quick actions.
 * @slot result - Shown while `prompting`: the answer and its actions (Replace, Retry…).
 *
 * @event {CustomEvent<{ text: string }>} selection-change - Fired when the toolbar shows for a selection or its selection changes. Does not bubble.
 * @event {CustomEvent<{ action: string; text: string }>} selection-action - Fired when a control with `data-action` (toolbar, prompt or result) is pressed, with the action and the selected text.
 * @event {CustomEvent<{ open: boolean }>} toggle - Fired when the toolbar opens or closes.
 *
 * @csspart toolbar - The floating toolbar.
 * @csspart prompt - Wrapper of the `prompt` slot.
 * @csspart result - Wrapper of the `result` slot.
 *
 * @cssproperty {color} [--c2-selection-toolbar--background=#ffffff]
 * @cssproperty {border} [--c2-selection-toolbar--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-selection-toolbar--border-radius=8px]
 * @cssproperty {shadow} [--c2-selection-toolbar--box-shadow=0 4px 12px rgba(0, 0, 0, 0.12)]
 * @cssproperty {padding} [--c2-selection-toolbar--padding=4px]
 * @cssproperty {pixel} [--c2-selection-toolbar--gap=2px] - Space between the controls.
 * @cssproperty {pixel} [--c2-selection-toolbar--offset=8px] - Distance from the selection.
 * @cssproperty {pixel} [--c2-selection-toolbar__prompt--width=360px] - Width of the toolbar while it shows the prompt, capped by the viewport.
 * @cssproperty {pixel} [--c2-selection-toolbar__prompt--gap=8px] - Space between the rows of the prompt and the result, and between the two.
 * @cssproperty {pixel} [--c2-selection-toolbar__result--max-height=240px] - Height past which the result scrolls.
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

  /**
   * Also acts on a selection inside the open shadow roots of the content. WebKit reports one as a caret next to the
   * component's host, so it is read there with `Selection.getComposedRanges()`. A selection that crosses a shadow
   * boundary is read as it is without `composed`.
   */
  @property({ type: Boolean }) composed = false

  /** Shows the inline prompt, anchored to the selection or the caret. Escape sets it back to false. */
  @property({ type: Boolean }) prompting = false

  @state() private open = false
  @state() private hint = ''
  @state() private hasResult = false

  private readonly msg = new LocalizeController(this, selectionToolbarMessages)
  private range: Range | null = null
  /** The last selection or caret seen in the content. WebKit drops it when focus moves to a control there. */
  private lastRange: Range | null = null
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
    this.lastRange = null
    document.removeEventListener('selectionchange', this.handleSelectionChange)
    document.removeEventListener('pointerup', this.handlePointerUp, true)
    document.removeEventListener('pointercancel', this.handlePointerUp, true)
    document.removeEventListener('keydown', this.handleDocumentKeydown, true)
    this.removeEventListener('pointerdown', this.handlePointerDown)
    clearTimeout(this.settleTimer)
    this.hide()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (isServer) return
    // A result rendered by the server fired its slotchange before the listener was bound.
    if (!this.hasUpdated) this.hasResult = !!this.querySelector(':scope > [slot="result"]')
    if (changed.has('disabled') && this.disabled) this.hide()
    if (!changed.has('prompting')) return
    if (!this.prompting || this.disabled) return this.hide()
    this.keepFocus()
    if (this.open) return
    // Opened without a toolbar: anchor to the selection or the caret in the content, else to the content itself.
    const current = this.currentSelection()
    const owned = !!current && this.ownsRange(current.range, false)
    // Focus on a control in the content (an "Ask AI" button) keeps the caret it left, even where the engine dropped it.
    const active = this.focusedInOwnTree()
    const last = !owned && active && this.contains(active) && !this.inToolbar(active) && this.lastRange?.startContainer.isConnected ? this.lastRange : null
    this.range = owned ? current.range : last
    this.text = owned ? current.text : (last?.toString() ?? '')
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('prompting') && this.prompting) void this.show().then(() => this.controls('prompt')[0]?.focus())
  }

  /** Remembers where focus is, to give it back when the panel hides, unless it is already in the panel. */
  private keepFocus(): void {
    const active = this.focusedInOwnTree()
    if (!this.inToolbar(active)) this.returnFocus = active instanceof HTMLElement ? active : null
  }

  private readonly handleResultChange = (event: Event) => {
    this.hasResult = (event.target as HTMLSlotElement).assignedNodes().length > 0
  }

  private get panel(): HTMLElement | null {
    return this.renderRoot?.querySelector<HTMLElement>('.toolbar') ?? null
  }

  /** The controls of a slot, in order. */
  private controls(name = this.prompting ? 'prompt' : 'toolbar'): HTMLElement[] {
    const slot = this.renderRoot?.querySelector<HTMLSlotElement>(`slot[name="${name}"]`)
    const assigned = (slot?.assignedElements({ flatten: true }) ?? []) as HTMLElement[]
    return assigned
      .flatMap((element) => (element.matches(FOCUSABLE) ? [element] : [...element.querySelectorAll<HTMLElement>(FOCUSABLE)]))
      .filter((element) => !element.hasAttribute('disabled'))
  }

  /** Whether a node is in one of the floating panel's slots. */
  private inToolbar(node: Node | null): boolean {
    return !!node && [...this.toolbarElements()].some((element) => element.contains(node))
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
    // A prompt keeps its anchor while focus and the selection move into its field.
    if (this.pointerDown || this.prompting) return
    clearTimeout(this.settleTimer)
    const current = this.currentSelection()
    if (current && this.ownsRange(current.range, false)) this.lastRange = current.range
    // A collapsed selection, or one that left the content, hides at once; a growing one waits to settle.
    if (!current || current.range.collapsed || !this.ownsRange(current.range)) {
      if (this.open && !this.inToolbar(this.focusedInOwnTree())) this.hide()
      return
    }
    this.settleTimer = setTimeout(() => this.refresh(), KEYBOARD_SETTLE)
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    // Escape during an IME composition in the prompt's field cancels the composition, not the prompt.
    if (!this.open || event.isComposing || event.keyCode === 229) return
    if (event.key === 'F10' && event.altKey) {
      event.preventDefault()
      const first = this.controls()[0]
      if (!first) return
      this.keepFocus()
      first.focus()
    } else if (event.key === 'Escape') {
      const focusInside = this.inToolbar(this.focusedInOwnTree())
      this.hide()
      if (focusInside) {
        event.preventDefault()
        this.returnFocus?.focus()
        this.returnFocus = null
      }
    }
  }

  /**
   * The document's selection as a range and its text. With `composed`, a selection inside an open shadow root of the
   * content is read through `getComposedRanges`, since `getRangeAt` reports it as a caret at the host.
   */
  private currentSelection(): { range: Range; readonly text: string } | null {
    const selection = document.getSelection()
    if (!selection || selection.rangeCount === 0) return null
    // The text is read only once the selection is known to be the toolbar's: serializing it costs a layout walk.
    const plain = {
      range: selection.getRangeAt(0).cloneRange(),
      get text() {
        return selection.toString()
      },
    }
    // Chromium and Firefox report a selection inside a shadow root as it is; WebKit as a caret next to the host, which
    // `getComposedRanges` resolves. Anything else is read as is.
    if (!plain.range.collapsed || typeof selection.getComposedRanges !== 'function') return plain
    const { startContainer, startOffset } = plain.range
    const nodes = startContainer.childNodes
    // The caret sits right before or right after the host: anything else (a caret in text, every other caret move) is
    // read as is.
    const host = [nodes[startOffset], nodes[startOffset - 1]].find((node): node is Element => node instanceof Element && !!node.shadowRoot)
    if (!host) return plain
    // The host is in the content (only with `composed`), or, for a toolbar that is itself in a shadow root, it is a host
    // around the toolbar, whose own content always counts.
    const around = !this.inContent(host)
    if (around ? !composedContains(host, this) : !this.composed) return plain
    const shadowRoots = [...this.enclosingShadowRoots(), ...(this.composed ? this.openShadowRoots(around ? this : host) : [])]
    if (!shadowRoots.length) return plain
    const composed = composedSelectionRange(selection, shadowRoots)
    // Both ends in one shadow tree: a Range cannot span two, and a selection crossing a boundary is read as is.
    if (!composed || composed.startContainer.getRootNode() !== composed.endContainer.getRootNode()) return plain
    const range = document.createRange()
    range.setStart(composed.startContainer, composed.startOffset)
    range.setEnd(composed.endContainer, composed.endOffset)
    return { range, text: range.toString() }
  }

  /** The open shadow roots under an element of the content, nested ones included, in one walk. */
  private openShadowRoots(near: Node): ShadowRoot[] {
    const start = near instanceof Element ? near : near.parentElement
    if (!start) return []
    const toolbarElements = this.toolbarElements()
    const roots: ShadowRoot[] = []
    const walk = (root: Element | ShadowRoot) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        // A control in the toolbar's slots is not content: skip it and what it holds.
        acceptNode: (node) => (toolbarElements.has(node as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      })
      for (let node = walker.currentNode as Element | null; node; node = walker.nextNode() as Element | null) {
        // The toolbar's own shadow root is its panel, not content.
        if (node.shadowRoot && node !== this) {
          roots.push(node.shadowRoot)
          walk(node.shadowRoot)
        }
      }
    }
    walk(start)
    return roots
  }

  /** The elements in the floating panel's slots. */
  private toolbarElements(): Set<Element> {
    const slots = [...(this.renderRoot?.querySelectorAll<HTMLSlotElement>('.toolbar slot') ?? [])]
    return new Set(slots.flatMap((slot) => slot.assignedElements()))
  }

  /** The shadow roots this toolbar sits in, innermost first. */
  private enclosingShadowRoots(): ShadowRoot[] {
    const roots: ShadowRoot[] = []
    for (let root = this.getRootNode(); root instanceof ShadowRoot; root = root.host.getRootNode()) roots.push(root)
    return roots
  }

  /** Whether a node is inside the content, through the hosts of the shadow roots it is in. */
  private inContent(node: Node): boolean {
    const own = retarget(node, this.getRootNode())
    return !!own && own !== this && this.contains(own) && !this.inToolbar(own)
  }

  /** The focused element of the tree this toolbar is in (the document, or the shadow root holding it). */
  private focusedInOwnTree(): Element | null {
    return (this.getRootNode() as Document | ShadowRoot).activeElement ?? null
  }

  /** Whether the range lies inside the content (and not in the toolbar). */
  private ownsRange(range: Range, strict = true): boolean {
    // Text selected in a form field is the field's: some engines report it as a range around the field.
    // Focus may sit inside a component's shadow root (a c2-text-field), so walk down to the innermost element.
    // Focus as seen from the toolbar's own tree, which may itself be a shadow root.
    const focused = this.focusedInOwnTree()
    let active = focused
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
    if (focused && this.contains(focused) && (isFormControl(active) || (strict && isFormControl(focused)))) return false
    // Both ends inside the content, so a selection across two paragraphs (whose common ancestor is this element) counts.
    if (!this.composed) {
      const inside = (node: Node) => node !== this && this.contains(node) && !this.inToolbar(node)
      return inside(range.startContainer) && inside(range.endContainer)
    }
    return this.inContent(range.startContainer) && this.inContent(range.endContainer)
  }

  /** Shows, moves or hides the toolbar for the current selection. */
  private refresh(): void {
    if (this.prompting) return
    const current = this.currentSelection()
    if (this.disabled || !current || current.range.collapsed || !this.ownsRange(current.range)) {
      this.hide()
      return
    }
    const { range, text } = current
    if (text.trim().length < Math.max(1, this.minLength || 1)) {
      this.hide()
      return
    }
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
      if (!this.prompting) this.announce()
      this.dispatchEvent(new CustomEvent('toggle', { detail: { open: true } }))
    }
    this.cleanupPosition?.()
    const range = this.range
    const anchor: VirtualElement | HTMLElement = range
      ? { getBoundingClientRect: () => range.getBoundingClientRect(), getClientRects: () => range.getClientRects(), contextElement: this }
      : this
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
    this.prompting = false
    if (!this.open) return
    // Focus in the panel would be lost once it hides: give it back to where it was.
    if (this.inToolbar(this.focusedInOwnTree())) this.returnFocus?.focus()
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
    if (this.prompting || target.closest('input, textarea, select, [contenteditable]')) return
    event.preventDefault()
  }

  private handleToolbarClick(event: Event): void {
    const target = event.target as HTMLElement
    const opener = target.closest('[data-prompt]')
    if (opener && this.inToolbar(opener) && this.open) this.prompting = true
    const control = target.closest<HTMLElement>('[data-action]')
    if (!control || !this.inToolbar(control) || !this.open) return
    this.dispatchEvent(
      new CustomEvent('selection-action', { detail: { action: control.dataset.action ?? '', text: this.text }, bubbles: true, composed: true }),
    )
  }

  private handleToolbarKeydown(event: KeyboardEvent): void {
    // A prompt holds text fields: the arrows and Home/End are theirs, and Tab moves between its controls.
    if (this.prompting) return
    const controls = this.controls()
    const focused = this.focusedInOwnTree()
    const at = controls.findIndex((control) => control === focused || control.contains(focused))
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
    const prompting = this.prompting
    return html`<slot></slot>
      <div
        class="toolbar ${this.open ? 'toolbar--open' : ''} ${prompting ? 'toolbar--prompt' : ''}"
        part="toolbar"
        popover="manual"
        role=${prompting ? 'dialog' : 'toolbar'}
        aria-orientation=${prompting ? nothing : 'horizontal'}
        aria-label=${prompting ? this.msg.t('prompt') : this.label || this.msg.t('label')}
        @pointerdown=${this.handleToolbarPointerDown}
        @mousedown=${this.handleToolbarPointerDown}
        @click=${this.handleToolbarClick}
        @keydown=${this.handleToolbarKeydown}
      >
        <slot name="toolbar"></slot>
        <div class="prompt" part="prompt"><slot name="prompt"></slot></div>
        <div class="result" part="result" ?hidden=${!this.hasResult}>
          <slot name="result" @slotchange=${this.handleResultChange}></slot>
        </div>
      </div>
      <div class="visually-hidden" role="status">${this.hint || nothing}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-selection-toolbar': SelectionToolbar
  }
}
