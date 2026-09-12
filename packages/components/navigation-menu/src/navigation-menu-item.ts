import { LitElement, html, nothing, svg, unsafeCSS } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import type { Overlay, Placement } from '@c2n/overlay'
import styles from './navigation-menu-item.scss?inline'

import '@c2n/overlay'

export interface PanelToggleEventDetail {
  /** Whether the panel is now open. */
  open: boolean
  /** The `value` of the item the panel belongs to. */
  value: string
}

const PANEL_FOCUSABLE = 'a[href], button:not([disabled]), c2-navigation-menu-link:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** What marks the current page inside a panel: a `current` row, or any element announcing `aria-current`. */
const PANEL_CURRENT = '[current], [aria-current]:not([aria-current="false"])'

/**
 * One entry of a `c2-navigation-menu`. With an `href` and nothing in the `panel` slot it is a plain link; with content
 * in `panel` it becomes a trigger that opens that content below the bar, and the chevron and `aria-expanded` are
 * added for you. Mark the entry of the current page `current` to announce `aria-current="page"` and show the
 * indicator line.
 *
 * A trigger follows its own panel: while one of the panel's rows is the current page — a `current`
 * `c2-navigation-menu-link`, or any element carrying `aria-current` — the item marks itself `current-group` and wears
 * the same styling as a `current` item, so the bar keeps showing which section the visitor is in while the panel is
 * closed. Only the row keeps `aria-current`: the trigger is the group, not the page.
 *
 * The bar owns the open state: it sets `expanded`, hands the item the element its panel is anchored to, and handles
 * hover intent, the keyboard and dismissal. The panel itself is a `c2-overlay` popover, so it escapes any
 * `overflow: hidden` header, but a manual one: a bar that opens panels on hover cannot leave dismissal to the
 * browser, whose light dismiss then disagrees between engines about a press on the trigger of an open panel.
 *
 * In the bar's `mobile` mode the item renders flat instead: a plain link stays a row, and a trigger becomes a heading
 * with its panel's rows listed underneath it, so the whole navigation reads as one hierarchy. With the bar's
 * `collapsible` set, that heading is a button that opens and closes its group.
 *
 * @tag c2-navigation-menu-item
 *
 * @slot default - The label. Falls back to `label`.
 * @slot prefix-icon - Icon before the label.
 * @slot suffix-icon - Icon after the label. Defaults to a chevron that flips while the panel is open.
 * @slot panel - The panel content: `c2-navigation-menu-link` rows, or any markup you lay out yourself.
 *
 * @event {CustomEvent<PanelToggleEventDetail>} panel-toggle - Fired after the panel opens or closes, including when the browser light-dismisses it.
 *
 * @cssproperty {pixel} [--c2-navigation-menu-item--min-height=36px]
 * @cssproperty {pixel} [--c2-navigation-menu-item--gap=6px] - Space between the icons and the label.
 *
 * @cssproperty {padding} [--c2-navigation-menu-item--padding-top=8px]
 * @cssproperty {padding} [--c2-navigation-menu-item--padding-right=12px]
 * @cssproperty {padding} [--c2-navigation-menu-item--padding-bottom=8px]
 * @cssproperty {padding} [--c2-navigation-menu-item--padding-left=12px]
 *
 * @cssproperty {border-radius} [--c2-navigation-menu-item--border-top-left-radius=6px]
 * @cssproperty {border-radius} [--c2-navigation-menu-item--border-top-right-radius=6px]
 * @cssproperty {border-radius} [--c2-navigation-menu-item--border-bottom-left-radius=6px]
 * @cssproperty {border-radius} [--c2-navigation-menu-item--border-bottom-right-radius=6px]
 *
 * @cssproperty {font-size} [--c2-navigation-menu-item--font-size=14px]
 * @cssproperty {font-weight} [--c2-navigation-menu-item--font-weight=500]
 * @cssproperty {font-style} --c2-navigation-menu-item--font-style
 * @cssproperty {font-family} --c2-navigation-menu-item--font-family
 *
 * @cssproperty {color} [--c2-navigation-menu-item--color=#71717a]
 * @cssproperty {color} [--c2-navigation-menu-item--background=transparent]
 *
 * @cssproperty {color} [--c2-navigation-menu-item__hover--color=#18181b]
 * @cssproperty {color} [--c2-navigation-menu-item__hover--background=#f4f4f5]
 *
 * @cssproperty {color} [--c2-navigation-menu-item__expanded--color=#18181b]
 * @cssproperty {color} [--c2-navigation-menu-item__expanded--background=#f4f4f5]
 * @cssproperty {border-radius} [--c2-navigation-menu-item__expanded--border-bottom-left-radius=0px] - Square by default, so an open trigger and its panel read as one surface.
 * @cssproperty {border-radius} [--c2-navigation-menu-item__expanded--border-bottom-right-radius=0px]
 *
 * @cssproperty {color} [--c2-navigation-menu-item__current--color=#18181b] - Also used while `current-group` is set.
 * @cssproperty {font-weight} [--c2-navigation-menu-item__current--font-weight=600]
 * @cssproperty {color} --c2-navigation-menu-item__current--background
 *
 * @cssproperty {color} [--c2-navigation-menu-item__indicator--color=rgb(2, 101, 220)] - The line under an item that is current, holds the current row, or is expanded. Not drawn in the mobile list, where the current row is marked by `__current--color`.
 * @cssproperty {pixel} [--c2-navigation-menu-item__indicator--height=2px]
 * @cssproperty {pixel} [--c2-navigation-menu-item__indicator--bottom=0px]
 * @cssproperty {pixel} [--c2-navigation-menu-item__indicator--inset=0px] - How far the line stops short of the item on each side; `0` spans its whole width.
 * @cssproperty {border-radius} [--c2-navigation-menu-item__indicator--border-radius=999px]
 *
 * @cssproperty {pixel} [--c2-navigation-menu-item__icon--size=16px]
 * @cssproperty {color} --c2-navigation-menu-item__icon--color - Defaults to the label colour.
 *
 * @cssproperty {outline} [--c2-navigation-menu-item__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-navigation-menu-item__focus--outline-offset=1px]
 *
 * @cssproperty {opacity} [--c2-navigation-menu-item__disabled--opacity=0.38]
 *
 * @cssproperty {color} [--c2-navigation-menu-item__mobile-heading--color=#71717a] - The group heading in the mobile list.
 * @cssproperty {font-size} [--c2-navigation-menu-item__mobile-heading--font-size=11px]
 * @cssproperty {font-weight} [--c2-navigation-menu-item__mobile-heading--font-weight=600]
 * @cssproperty {letter-spacing} [--c2-navigation-menu-item__mobile-heading--letter-spacing=0.06em]
 * @cssproperty {text-transform} [--c2-navigation-menu-item__mobile-heading--text-transform=uppercase]
 * @cssproperty {padding} [--c2-navigation-menu-item__mobile-heading--padding-top=10px]
 * @cssproperty {padding} [--c2-navigation-menu-item__mobile-heading--padding-right=8px]
 * @cssproperty {padding} [--c2-navigation-menu-item__mobile-heading--padding-bottom=4px]
 * @cssproperty {padding} [--c2-navigation-menu-item__mobile-heading--padding-left=8px] - Also the inset of a top-level row in the mobile list, so the two line up.
 * @cssproperty {pixel} [--c2-navigation-menu-item__mobile-group--indent=12px] - How far the rows of a group are inset.
 * @cssproperty {pixel} [--c2-navigation-menu-item__mobile-heading__chevron--size=16px] - The toggle chevron of a collapsible group.
 *
 * @cssproperty {color} [--c2-navigation-menu-item__panel--background=#ffffff]
 * @cssproperty {pixel} [--c2-navigation-menu-item__panel--min-width=260px]
 * @cssproperty {pixel} --c2-navigation-menu-item__panel--max-width
 * @cssproperty {pixel} [--c2-navigation-menu-item__panel--max-height=min(70vh, var(--c2-overlay--available-height, 70vh))] - The panel scrolls past this height.
 * @cssproperty {border} [--c2-navigation-menu-item__panel--border-top=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-navigation-menu-item__panel--border-right=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-navigation-menu-item__panel--border-bottom=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-navigation-menu-item__panel--border-left=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-navigation-menu-item__panel--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-navigation-menu-item__panel--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-navigation-menu-item__panel--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-navigation-menu-item__panel--border-bottom-right-radius=8px]
 * @cssproperty {box-shadow} [--c2-navigation-menu-item__panel--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {padding} [--c2-navigation-menu-item__panel--padding-top=8px]
 * @cssproperty {padding} [--c2-navigation-menu-item__panel--padding-right=8px]
 * @cssproperty {padding} [--c2-navigation-menu-item__panel--padding-bottom=8px]
 * @cssproperty {padding} [--c2-navigation-menu-item__panel--padding-left=8px]
 *
 * @internalcomponent c2-overlay
 *
 * @slotcomponent c2-navigation-menu-link
 */
@customElement('c2-navigation-menu-item')
export class NavigationMenuItem extends LitElement {
  static override styles = unsafeCSS(styles)

  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  /** Identifies the item in the bar's `value`. The bar fills in `item-<position>` when the markup omits it. */
  @property({ reflect: true }) value = ''

  /** Makes the item a link. An item with panel content is always a trigger, even with an `href`. */
  @property() href?: string

  @property() target?: string

  /** The entry of the page being shown: announced as `aria-current="page"` and styled with the `__current` variables. */
  @property({ type: Boolean, reflect: true }) current = false

  /** Dims the item and ignores pointer and keyboard. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Label used as the default slot's fallback content. */
  @property({ reflect: true }) label?: string

  /** Whether the panel is open. Set by the parent bar; announced as `aria-expanded`. */
  @property({ type: Boolean, reflect: true }) expanded = false

  /**
   * Whether the current page is one of this item's panel rows. The item maintains it as the panel changes; style it
   * with the `__current` variables, or with the `current-group` attribute for a look of its own.
   */
  @property({ type: Boolean, reflect: true, attribute: 'current-group' }) currentGroup = false

  /** Preferred placement of the panel (floating-ui names). */
  @property({ reflect: true }) placement: Placement = 'bottom-start'

  /** Anchor the panel to this element instead of to the item. Set by the bar's `panel-anchor`. Not an attribute. */
  @property({ attribute: false }) panelAnchorElement: HTMLElement | null = null

  /**
   * Set by the bar in `mobile` mode: the item becomes one entry of a hierarchy list — a row for a link, a heading
   * with its panel's rows underneath for a trigger — instead of a trigger with a popover.
   */
  @property({ type: Boolean, reflect: true }) mobile = false

  /** Set by the bar's `collapsible`: in `mobile` mode the heading becomes a button that opens and closes the group. */
  @property({ type: Boolean, reflect: true }) collapsible = false

  @state() private panelPresent = false

  @query('.trigger') private trigger?: HTMLElement

  @query('#overlay') private overlayElement?: Overlay

  @query('slot[name="panel"]') private panelSlot?: HTMLSlotElement

  /** `role` written by the author, kept over the automatic one. */
  private authorRole: string | null = null

  /** Watches the panel content so `current-group` follows a row that becomes current later, as a route change does. */
  private panelObserver?: MutationObserver

  /** Whether anything is slotted into `panel`. */
  get hasPanel(): boolean {
    return this.panelPresent
  }

  override connectedCallback() {
    super.connectedCallback()
    if (this.authorRole === null) this.authorRole = this.getAttribute('role')
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.panelObserver?.disconnect()
  }

  /** Focuses the item's own control, never the panel. */
  override focus(options?: FocusOptions) {
    this.trigger?.focus(options)
  }

  /** Moves focus to the first focusable element of the panel. Returns whether there was one. */
  focusPanel(): boolean {
    const target = this.panelFocusables()[0]
    target?.focus()
    return !!target
  }

  /** Whether `node` is part of the panel content, rather than of the item's own label and icons. */
  panelContains(node: Node): boolean {
    return (this.panelSlot?.assignedElements({ flatten: true }) ?? []).some((element) => element === node || element.contains(node))
  }

  private panelFocusables(): HTMLElement[] {
    const assigned = this.panelSlot?.assignedElements({ flatten: true }) ?? []
    return assigned.flatMap((element) => {
      const found = element.matches(PANEL_FOCUSABLE) ? [element] : Array.from(element.querySelectorAll(PANEL_FOCUSABLE))
      return found.filter((item): item is HTMLElement => item instanceof HTMLElement)
    })
  }

  /** The panel is shown by the overlay's own update, so `updateComplete` has to wait for that too. */
  protected override async getUpdateComplete(): Promise<boolean> {
    const complete = (await super.getUpdateComplete()) as boolean
    await this.overlayElement?.updateComplete
    return complete
  }

  private handlePanelSlotChange(event: Event) {
    this.panelPresent = (event.target as HTMLSlotElement).assignedElements({ flatten: true }).length > 0
    this.watchPanel()
    this.syncCurrentGroup()
  }

  private panelRoots(): Element[] {
    return this.panelSlot?.assignedElements({ flatten: true }) ?? []
  }

  private syncCurrentGroup() {
    this.currentGroup = this.panelRoots().some((root) => root.matches(PANEL_CURRENT) || !!root.querySelector(PANEL_CURRENT))
  }

  private watchPanel() {
    this.panelObserver?.disconnect()
    const roots = this.panelRoots()
    if (roots.length === 0) return
    this.panelObserver ??= new MutationObserver(() => this.syncCurrentGroup())
    for (const root of roots) {
      this.panelObserver.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['current', 'aria-current'] })
    }
  }

  private handleOverlayToggle = (event: Event) => {
    const open = (event as ToggleEvent).newState === 'open'
    if (open !== this.expanded) this.expanded = open
    this.dispatchEvent(new CustomEvent<PanelToggleEventDetail>('panel-toggle', { bubbles: true, composed: true, detail: { open, value: this.value } }))
  }

  protected override updated(): void {
    this.setAttribute('role', this.authorRole ?? 'listitem')
  }

  private renderChevron() {
    return svg`<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"></path></svg>`
  }

  private renderInner() {
    return html`<slot name="prefix-icon"></slot>
      <span class="label"><slot>${this.label ?? nothing}</slot></span>
      <slot name="suffix-icon">${this.panelPresent ? this.renderChevron() : nothing}</slot>
      <span class="indicator" aria-hidden="true"></span>`
  }

  /** Mobile: a link row, or a heading with the panel's rows listed under it — behind a toggle when collapsible. */
  private renderMobile() {
    const label = html`<slot name="prefix-icon"></slot> <span class="label"><slot>${this.label ?? nothing}</slot></span>`

    const heading = this.collapsible
      ? html`<button
          type="button"
          class="heading heading-button"
          id="trigger"
          ?disabled=${this.disabled}
          aria-expanded=${this.expanded ? 'true' : 'false'}
          aria-controls="panel"
        >
          ${label}
          <span class="heading-chevron">${this.renderChevron()}</span>
        </button>`
      : html`<div class="heading" id="trigger">${label}</div>`

    // The panel slot is rendered either way: an item only learns that it has a panel from that slot's first change.
    return html`${this.panelPresent ? heading : this.renderControl()}
      <div class="mobile-group" id="panel" ?hidden=${!this.panelPresent || (this.collapsible && !this.expanded)}>
        <slot name="panel" @slotchange=${this.handlePanelSlotChange}></slot>
      </div>`
  }

  private renderControl() {
    const control =
      this.panelPresent || !this.href
        ? html`<button
            type="button"
            class="trigger"
            id="trigger"
            ?disabled=${this.disabled}
            aria-expanded=${this.panelPresent ? (this.expanded ? 'true' : 'false') : nothing}
            aria-controls=${this.panelPresent ? 'panel' : nothing}
            aria-current=${this.current ? 'page' : nothing}
          >
            ${this.renderInner()}
          </button>`
        : html`<a
            class="trigger"
            id="trigger"
            href=${ifDefined(this.disabled ? undefined : this.href)}
            target=${ifDefined(this.target)}
            rel=${this.target === '_blank' ? 'noopener noreferrer' : nothing}
            aria-current=${this.current ? 'page' : nothing}
            aria-disabled=${this.disabled ? 'true' : nothing}
            >${this.renderInner()}</a
          >`

    return control
  }

  override render() {
    if (this.mobile) return this.renderMobile()

    return html`${this.renderControl()}
      <c2-overlay
        id="overlay"
        class="overlay"
        popover="manual"
        .anchor=${this.panelAnchorElement ?? this}
        .placement=${this.placement}
        .open=${this.expanded && this.panelPresent}
        free-width
        @toggle=${this.handleOverlayToggle}
      >
        <div class="panel" id="panel" role="group" aria-labelledby="trigger">
          <slot name="panel" @slotchange=${this.handlePanelSlotChange}></slot>
        </div>
      </c2-overlay>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-navigation-menu-item': NavigationMenuItem
  }
}
