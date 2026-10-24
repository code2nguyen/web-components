import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { masterDetailMessages } from './messages'
import styles from './master-detail.scss?inline'

/** How the panes are laid out: side by side, one at a time, or the detail over the master. */
export type MasterDetailLayout = 'split' | 'stack' | 'overlay'
/** The layout used below `breakpoint`. */
export type MasterDetailCollapse = 'stack' | 'overlay'
/** What asked the open detail to close. */
export type MasterDetailCloseReason = 'back' | 'escape' | 'backdrop'

/** Events fired by {@link MasterDetail}, keyed for `addEventListener`. */
export interface MasterDetailEventMap {
  'close-request': CustomEvent<{ reason: MasterDetailCloseReason }>
  'layout-change': CustomEvent<{ layout: MasterDetailLayout }>
}

export interface MasterDetail {
  addEventListener: TypedAddEventListener<MasterDetail, MasterDetailEventMap>
  removeEventListener: TypedRemoveEventListener<MasterDetail, MasterDetailEventMap>
}

/** An open popover or dialog, which takes Escape before the layout. `:popover-open` throws where it is unsupported. */
const isOpenPopup = (element: Element): boolean => {
  if (element.matches('dialog[open]')) return true
  try {
    return element.matches(':popover-open')
  } catch {
    return false
  }
}

/** Attribute that turns any element inside the detail into a back button. */
export const MASTER_DETAIL_BACK_ATTRIBUTE = 'master-detail-back'

/**
 * A list and the record it opens: an inbox and the open message, orders and the order, files and the preview. The
 * layout follows the element's **own width**, not the window, so it is right inside a dialog, a split panel or a
 * docs frame:
 *
 * - **split** (width ≥ `breakpoint`): the master column beside the detail. While `open` is false the detail pane shows
 *   the `placeholder` slot ("Select a conversation").
 * - **stack** (below it, `collapse="stack"`, the default): one pane at a time. Opening slides the detail in over the
 *   master and moves focus into it (to an `autofocus` element, else the pane); the Back bar brings the list back and
 *   returns focus to where it was.
 * - **overlay** (below it, `collapse="overlay"`): the detail slides over the master, which stays visible behind a
 *   backdrop and is inert. Back, Escape or a click on the backdrop closes it.
 *
 * The element owns no selection: the app shows a record in the `detail` slot and sets `open` (or calls `show()`).
 * When the user asks to close (the Back bar, an element with the `master-detail-back` attribute, Escape or the
 * backdrop in overlay) a cancelable `close-request` fires and, unless it is cancelled, `open` turns false. The current
 * layout is the read-only `layout` property, the `layout-change` event and the `:state(split)`, `:state(stack)` and
 * `:state(overlay)` custom states, so page CSS can hide an author's own back button in split
 * (`c2-master-detail:state(split) [master-detail-back] { display: none }`).
 *
 * Give the host a height (it fills it, and each pane scrolls on its own). The host is an inline-size container, so it
 * does not grow to fit its content: in a flex or other shrink-to-fit parent give it a width too. Before it is upgraded
 * or measured — a server-rendered page — a container query on the host lays it out at a fixed 720px breakpoint.
 *
 * @tag c2-master-detail
 *
 * @slot master - The list: a `c2-list`, `c2-table`, `c2-tree`, anything. Fills the master pane, which scrolls.
 * @slot detail - The open record. Shown in the detail pane while `open` is true.
 * @slot placeholder - Shown in the detail pane in the split layout while nothing is open; hidden in the other two.
 * @slot toolbar - Extra content after the Back button in the stack and overlay layouts (a title, actions).
 * @slot back-icon - Replaces the chevron of the Back button. Mirrored in a right-to-left context.
 *
 * @event {CustomEvent<{ reason: 'back' | 'escape' | 'backdrop' }>} close-request - Fired when the user asks to close the open detail, before `open` turns false. Cancelable: `preventDefault()` keeps it open (unsaved changes). Not fired by `close()` or by setting `open`. Does not bubble.
 * @event {CustomEvent<{ layout: 'split' | 'stack' | 'overlay' }>} layout-change - Fired when the element's width crosses `breakpoint` or `collapse` changes, after the first measurement. Does not bubble.
 *
 * @csspart layout - Grid holding the panes.
 * @csspart master - Pane wrapping the `master` slot; scrolls its content.
 * @csspart detail - Pane holding the toolbar and the `detail` slot; a `region` named by `detail-label`, a `dialog` in the overlay layout.
 * @csspart body - Scrolling box wrapping the `detail` slot, under the toolbar.
 * @csspart toolbar - Bar at the top of the detail in the stack and overlay layouts, wrapping the Back button and the `toolbar` slot.
 * @csspart back - The built-in Back button.
 * @csspart placeholder - Region of the detail column wrapping the `placeholder` slot.
 * @csspart backdrop - Shade over the master while the detail is open in the overlay layout.
 *
 * @cssproperty {pixel} [--c2-master-detail__master--width=320px] - Width of the master column in the split layout.
 * @cssproperty {background} [--c2-master-detail__master--background=transparent]
 * @cssproperty {background} [--c2-master-detail__detail--background=#ffffff] - Opaque by default: in the stack and overlay layouts the detail slides over the master.
 * @cssproperty {color} [--c2-master-detail__detail--color=#18181b]
 * @cssproperty {border} [--c2-master-detail__divider--border=1px solid #e4e4e7] - Line between the panes in the split layout.
 * @cssproperty {overflow} [--c2-master-detail__pane--overflow=auto] - Overflow of the master pane and of the detail body.
 * @cssproperty {color} [--c2-master-detail__placeholder--color=#71717a]
 * @cssproperty {background} [--c2-master-detail__placeholder--background=transparent]
 * @cssproperty {pixel} [--c2-master-detail__placeholder--padding=24px]
 * @cssproperty {pixel} [--c2-master-detail__overlay--width=420px] - Width of the detail in the overlay layout; never wider than the host.
 * @cssproperty {shadow} [--c2-master-detail__overlay--box-shadow=0 24px 60px rgba(0, 0, 0, 0.25)] - Shadow of the detail in the overlay layout.
 * @cssproperty {background} [--c2-master-detail__backdrop--background=rgba(9, 9, 11, 0.45)]
 * @cssproperty {time} [--c2-master-detail--transition-duration=280ms] - Slide of the detail in the stack and overlay layouts. Reduced motion turns it off.
 * @cssproperty {display} [--c2-master-detail__toolbar--display=flex] - `none` removes the bar, for a detail that renders its own `master-detail-back` button.
 * @cssproperty {pixel} [--c2-master-detail__toolbar--min-height=44px]
 * @cssproperty {pixel} [--c2-master-detail__toolbar--padding=4px 8px]
 * @cssproperty {pixel} [--c2-master-detail__toolbar--gap=8px]
 * @cssproperty {border} [--c2-master-detail__toolbar--border-bottom=1px solid #e4e4e7]
 * @cssproperty {background} [--c2-master-detail__toolbar--background=transparent]
 * @cssproperty {pixel} [--c2-master-detail__back--height=36px]
 * @cssproperty {pixel} [--c2-master-detail__back--padding=0 12px 0 6px]
 * @cssproperty {pixel} [--c2-master-detail__back--gap=4px]
 * @cssproperty {pixel} [--c2-master-detail__back--icon-size=20px]
 * @cssproperty {color} [--c2-master-detail__back--color=rgb(2, 101, 220)]
 * @cssproperty {background} [--c2-master-detail__back--background=transparent]
 * @cssproperty {background} [--c2-master-detail__back__hover--background=#f4f4f5]
 * @cssproperty {length} [--c2-master-detail__back--font-size=14px]
 * @cssproperty {number} [--c2-master-detail__back--font-weight=500]
 * @cssproperty {border-radius} [--c2-master-detail__back--border-radius=6px]
 * @cssproperty {outline} [--c2-master-detail__back__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-master-detail')
export class MasterDetail extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, masterDetailMessages)

  /** The detail is showing. The app sets it when the user picks a record; the element clears it on Back, Escape (overlay) and the backdrop. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Width of the element, in pixels, from which master and detail sit side by side. */
  @property({ type: Number }) breakpoint = 720

  /** Layout below `breakpoint`: `stack` shows one pane at a time, `overlay` slides the detail over the master. */
  @property({ reflect: true }) collapse: MasterDetailCollapse = 'stack'

  /** Accessible name of the detail pane. Defaults to "Details" in the nearest `lang`. */
  @property({ attribute: 'detail-label' }) detailLabel = ''

  /** Text of the built-in Back button. Defaults to "Back" in the nearest `lang`. */
  @property({ attribute: 'back-label' }) backLabel = ''

  @state() private measuredLayout: MasterDetailLayout | undefined = undefined

  @query('.master') private masterPane!: HTMLElement
  @query('.detail') private detailPane!: HTMLElement
  @query('slot[name="detail"]') private detailSlot!: HTMLSlotElement

  private resizeObserver?: ResizeObserver
  private width = 0
  private returnFocus: Element | null = null
  private instantFrame = 0
  private masterHadFocus = false

  constructor() {
    super()
    this.addEventListener('keydown', this.handleKeydown)
    this.addEventListener('click', this.handleClick)
  }

  /**
   * The layout in use: `split`, `stack` or `overlay`. Before the element has been measured (not yet connected, or
   * rendered on a server) it is computed from `breakpoint` against the current width.
   */
  get layout(): MasterDetailLayout {
    return this.measuredLayout ?? this.layoutFor(this.isConnected ? this.getBoundingClientRect().width : 0)
  }

  /** Opens the detail, as setting `open` does. */
  show(): void {
    this.open = true
  }

  /** Closes the detail without a `close-request`, as clearing `open` does. Focus returns to the master in the stack and overlay layouts. */
  close(): void {
    this.open = false
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (typeof ResizeObserver === 'undefined') return
    this.resizeObserver ??= new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      this.width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width
      this.measure()
    })
    this.resizeObserver.observe(this)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    cancelAnimationFrame(this.instantFrame)
    this.toggleState('instant', false)
  }

  private layoutFor(width: number): MasterDetailLayout {
    return width >= this.breakpoint ? 'split' : this.collapse === 'overlay' ? 'overlay' : 'stack'
  }

  private measure(): void {
    const next = this.layoutFor(this.width)
    const previous = this.measuredLayout
    if (next === previous) return
    this.measuredLayout = next
    // No slide when the width, not the user, changes the layout.
    if (previous !== undefined) this.setInstant()
  }

  private setInstant(): void {
    this.toggleState('instant', true)
    cancelAnimationFrame(this.instantFrame)
    this.instantFrame = requestAnimationFrame(() => {
      this.instantFrame = requestAnimationFrame(() => this.toggleState('instant', false))
    })
  }

  private toggleState(name: string, on: boolean): void {
    // `states` is missing from the server's internals shim and from browsers before custom states.
    const states = this.internals.states as CustomStateSet | undefined
    if (!states) return
    if (on) states.add(name)
    else states.delete(name)
  }

  protected override willUpdate(changed: PropertyValues): void {
    if ((changed.has('breakpoint') || changed.has('collapse')) && this.measuredLayout !== undefined) this.measure()
    // Read before the render makes the master inert, which drops the focus to the body.
    if (changed.has('measuredLayout') || changed.has('open')) {
      const active = this.focusedInRoot()
      this.masterHadFocus = this.slotOf(active) === 'master'
      if (changed.has('open') && this.open) this.returnFocus = this.masterHadFocus ? active : null
    }
  }

  protected override updated(changed: PropertyValues): void {
    const layout = this.measuredLayout
    if (changed.has('measuredLayout')) {
      for (const name of ['split', 'stack', 'overlay'] as const) this.toggleState(name, layout === name)
      this.toggleState('measured', layout !== undefined)
      const previous = changed.get('measuredLayout') as MasterDetailLayout | undefined
      if (previous !== undefined && layout !== undefined) {
        this.dispatchEvent(new CustomEvent('layout-change', { detail: { layout } }))
        // The master went inert under the focus: carry it to the detail the user is now looking at.
        if (layout !== 'split' && this.open && this.masterHadFocus) this.focusDetail()
      }
    }
    // The initial value of `open` moves no focus.
    const firstUpdate = changed.get('open') === undefined
    if (changed.has('open') && !firstUpdate && layout !== undefined && layout !== 'split') {
      if (this.open) this.focusDetail()
      else this.restoreFocus()
    }
  }

  /** The element of this shadow tree holding focus (the Back button, a pane), or `null` when it is elsewhere. */
  private focusedInShadow(): Element | null {
    return this.shadowRoot?.activeElement ?? null
  }

  /** The focused element as seen from the tree this element lives in: a slotted child's descendant, or a host above. */
  private focusedInRoot(): Element | null {
    return (this.getRootNode() as Document | ShadowRoot).activeElement
  }

  /** The slot of the child of this element that holds `element`, or `undefined` when it is not inside one. */
  private slotOf(element: Element | null): string | undefined {
    let node = element
    while (node && node.parentElement !== this) node = node.parentElement
    return node ? (node.getAttribute('slot') ?? '') : undefined
  }

  private focusDetail(): void {
    const autofocus = this.detailSlot
      ?.assignedElements({ flatten: true })
      .map((element) => (element.matches('[autofocus]') ? element : element.querySelector('[autofocus]')))
      .find((element): element is HTMLElement => element instanceof HTMLElement)
    ;(autofocus ?? this.detailPane)?.focus({ preventScroll: true })
  }

  private restoreFocus(): void {
    // Focus is lost when it fell to the body as the detail went inert, or still sits in the detail (its own slots or
    // the Back button). Focus the app moved elsewhere stays where it is.
    const slot = this.slotOf(this.focusedInRoot())
    const outside = document.activeElement
    const lost = !outside || outside === document.body || this.detailPane.contains(this.focusedInShadow()) || slot === 'detail' || slot === 'toolbar'
    if (!lost) return
    const target = this.returnFocus
    this.returnFocus = null
    if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true })
    else this.masterPane.focus({ preventScroll: true })
  }

  private requestClose(reason: MasterDetailCloseReason): void {
    if (!this.open) return
    const event = new CustomEvent('close-request', { detail: { reason }, cancelable: true })
    if (this.dispatchEvent(event)) this.open = false
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented || !this.open || this.layout !== 'overlay') return
    // Escape in an open popup inside the detail closes that popup first.
    if (event.composedPath().some((node) => node instanceof Element && isOpenPopup(node))) return
    event.preventDefault()
    this.requestClose('escape')
  }

  private handleClick = (event: MouseEvent): void => {
    if (event.defaultPrevented) return
    // The composed path crosses the shadow roots of components rendered in the detail.
    let back = false
    for (const node of event.composedPath()) {
      if (node === this) break
      if (!(node instanceof Element)) continue
      if (node.hasAttribute(MASTER_DETAIL_BACK_ATTRIBUTE)) back = true
      // A back button inside a nested layout belongs to that layout.
      else if (back && node instanceof MasterDetail) return
    }
    if (back) this.requestClose('back')
  }

  override render() {
    const layout = this.measuredLayout
    const collapsed = layout === 'stack' || layout === 'overlay'
    const overlayOpen = layout === 'overlay' && this.open
    return html`
      <div class="layout" part="layout">
        <div class="master" part="master" tabindex="-1" ?inert=${collapsed && this.open}>
          <slot name="master"></slot>
        </div>
        <div class="backdrop" part="backdrop" aria-hidden="true" @click=${() => this.requestClose('backdrop')}></div>
        <div
          class="detail"
          part="detail"
          role=${overlayOpen ? 'dialog' : 'region'}
          aria-modal=${overlayOpen ? 'true' : nothing}
          aria-label=${this.detailLabel || this.msg.t('details')}
          tabindex="-1"
          ?inert=${layout !== undefined && !this.open}
        >
          <div class="toolbar" part="toolbar">
            <button class="back" part="back" type="button" @click=${() => this.requestClose('back')}>
              <span class="back-icon" aria-hidden="true">
                <slot name="back-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m15 18-6-6 6-6"></path>
                  </svg>
                </slot>
              </span>
              <span>${this.backLabel || this.msg.t('back')}</span>
            </button>
            <slot name="toolbar"></slot>
          </div>
          <div class="body" part="body"><slot name="detail"></slot></div>
        </div>
        <div class="placeholder" part="placeholder" ?inert=${this.open || collapsed}>
          <slot name="placeholder"></slot>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-master-detail': MasterDetail
  }
}
