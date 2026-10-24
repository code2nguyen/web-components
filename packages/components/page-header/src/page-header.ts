import { LitElement, html, nothing, svg, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, assignSlot } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { MenuSelectEventDetail } from '@c2n/menu'
import '@c2n/menu'
import '@c2n/menu/menu-item.js'
import { pageHeaderMessages } from './messages.js'
import styles from './page-header.scss?inline'

export interface CondensedChangeEventDetail {
  condensed: boolean
}

export interface OverflowChangeEventDetail {
  /** The actions now in "More actions", in the order they appear there. */
  folded: Element[]
}

/** Events fired by {@link PageHeader}, keyed for `addEventListener`. */
export interface PageHeaderEventMap {
  'condensed-change': CustomEvent<CondensedChangeEventDetail>
  'overflow-change': CustomEvent<OverflowChangeEventDetail>
}

export interface PageHeader {
  addEventListener: TypedAddEventListener<PageHeader, PageHeaderEventMap>
  removeEventListener: TypedRemoveEventListener<PageHeader, PageHeaderEventMap>
}

/** Below this width of its own the page header stacks: parent link instead of the breadcrumb, actions on their own row. */
const NARROW_MAX = 600

const NAMED_SLOTS = ['breadcrumb', 'parent', 'leading', 'title-suffix', 'description', 'meta', 'actions', 'navigation', 'toolbar'] as const
type NamedSlot = (typeof NAMED_SLOTS)[number]

const BACK = svg`<path d="m15 18-6-6 6-6" />`
const MORE = svg`<circle cx="5" cy="12" r="1.25" /><circle cx="12" cy="12" r="1.25" /><circle cx="19" cy="12" r="1.25" />`

type Action = HTMLElement & { disabled?: boolean; href?: string; target?: string; type?: string; form?: HTMLFormElement | null; label?: string }

/** Actions whose activation a menu row can reproduce: a link navigates, a button clicks or submits. */
function isFoldable(element: Element): boolean {
  const tag = element.localName
  if (tag === 'a') return element.hasAttribute('href')
  return tag === 'button' || tag === 'c2-button' || tag === 'c2-icon-button' || tag === 'c2-link-button'
}

function isDisabled(action: Action): boolean {
  return action.disabled === true || action.hasAttribute('disabled') || action.getAttribute('aria-disabled') === 'true'
}

/** The text a folded action is known by in "More actions". */
function actionLabel(action: Action): string {
  return (
    action.getAttribute('menu-label') ||
    (typeof action.label === 'string' && action.label) ||
    action.getAttribute('aria-label') ||
    (action.textContent ?? '').replace(/\s+/g, ' ').trim()
  )
}

/** Folding order: actions without `overflow-priority` first (last in the row first), then by ascending priority. */
function foldOrder(actions: Action[]): Action[] {
  const priority = (action: Action) => {
    const value = Number.parseFloat(action.getAttribute('overflow-priority') ?? '')
    return Number.isFinite(value) ? value : -Infinity
  }
  return actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => priority(a.action) - priority(b.action) || b.index - a.index)
    .map(({ action }) => action)
}

/**
 * The top of a page: where you are (a breadcrumb, or a parent link on narrow widths), what this is (your heading, a
 * leading visual, status badges, a description, metadata), what you can do (page actions) and where you can go next
 * (tabs), with an optional toolbar for search and filters. Write the heading yourself — usually an `<h1>` — in the
 * default slot; the page header styles it and never decides its level.
 *
 * The layout follows its **own width**: below 600px the parent link replaces the breadcrumb, the leading visual hides
 * and the actions take their own row. The parent link is the `parent` slot, or is derived from the second-to-last item
 * of a slotted `c2-breadcrumb`.
 *
 * Actions that do not fit fold into a "More actions" menu, those without `overflow-priority` first (from the end of the
 * row), then by ascending priority. The action marked `primary` never folds and is drawn last. Only actions a menu row
 * can reproduce fold: `c2-button`, `c2-icon-button`, `c2-link-button`, `<button>` and `<a href>` (a folded link stays a
 * link, a folded submit button submits its form); anything else, such as a `c2-split-button`, always stays. A page
 * header rendered on the server cannot fold (its declarative shadow root cannot assign slots by hand), so its actions
 * wrap instead.
 *
 * With `sticky`, once the title has scrolled out a condensed bar stays at `--c2-page-header--sticky-top`, showing the
 * parent link, the title, a copy of the title badges and the primary action itself. Inside a `c2-app-shell` the offset
 * comes from the shell, so the bar sits under its header with no CSS.
 *
 * @tag c2-page-header
 *
 * @slot breadcrumb - Where the page sits: usually a `c2-breadcrumb`. Hidden below 600px.
 * @slot parent - A link to the parent page, shown below 600px instead of the breadcrumb. Without it, the link is derived from the breadcrumb.
 * @slot leading - A visual before the title: an icon, an avatar, a logo. Hidden below 600px.
 * @slot - The page title: your heading element, usually an `<h1>`.
 * @slot title-suffix - Status after the title, such as `c2-badge`s.
 * @slot description - A sentence under the title.
 * @slot meta - Facts about the page: a `c2-description-list`, dates, owners.
 * @slot actions - Page actions. Mark the main one `primary`; set `overflow-priority` on the others to choose which fold first.
 * @slot navigation - Tabs below the title, usually links with `aria-current="page"` on the current one.
 * @slot toolbar - A row of search and filters at the bottom of the header.
 *
 * @csspart base - The `<header>` element.
 * @csspart context - Container of the breadcrumb.
 * @csspart parent - Container of the parent link.
 * @csspart title-row - The row holding the title area and the actions.
 * @csspart leading - Container of the leading visual.
 * @csspart actions - Container of the actions.
 * @csspart more-actions - The "More actions" button.
 * @csspart navigation - Container of the tabs.
 * @csspart toolbar - Container of the toolbar.
 * @csspart condensed - The condensed bar of a sticky page header.
 *
 * @event {CustomEvent<CondensedChangeEventDetail>} condensed-change - A sticky page header's title scrolled out of view or back in. Does not bubble.
 * @event {CustomEvent<OverflowChangeEventDetail>} overflow-change - The set of actions folded into "More actions" changed. Does not bubble.
 *
 * @cssproperty {padding} [--c2-page-header--padding-top=20px]
 * @cssproperty {padding} [--c2-page-header--padding-right=24px]
 * @cssproperty {padding} [--c2-page-header--padding-bottom=16px]
 * @cssproperty {padding} [--c2-page-header--padding-left=24px]
 * @cssproperty {pixel} [--c2-page-header--gap=12px] - Space between the rows.
 * @cssproperty {color} [--c2-page-header--background-color=transparent]
 * @cssproperty {color} --c2-page-header--color
 * @cssproperty {border} [--c2-page-header--border-bottom=none]
 * @cssproperty {pixel} [--c2-page-header--sticky-top=var(--c2-app-shell--sticky-offset, 0px)] - Where a sticky page header's condensed bar stays. Inside a `c2-app-shell` it follows the shell.
 * @cssproperty {number} [--c2-page-header--z-index=5] - Stacking of a sticky page header above the page.
 * @cssproperty {time} [--c2-page-header--transition-duration=180ms]
 * @cssproperty {font-size} [--c2-page-header__title--font-size=24px]
 * @cssproperty {font-weight} [--c2-page-header__title--font-weight=600]
 * @cssproperty {line-height} [--c2-page-header__title--line-height=1.25]
 * @cssproperty {number} [--c2-page-header__title--line-clamp=2]
 * @cssproperty {color} [--c2-page-header__title--color=#18181b]
 * @cssproperty {pixel} [--c2-page-header__title--min-width=240px] - Room kept for the title before actions fold.
 * @cssproperty {font-size} [--c2-page-header__title__narrow--font-size=20px]
 * @cssproperty {pixel} [--c2-page-header__leading--size=40px]
 * @cssproperty {color} [--c2-page-header__description--color=#52525b]
 * @cssproperty {font-size} [--c2-page-header__description--font-size=14px]
 * @cssproperty {color} [--c2-page-header__meta--color=#71717a]
 * @cssproperty {font-size} [--c2-page-header__meta--font-size=12px]
 * @cssproperty {pixel} [--c2-page-header__meta--gap=4px 16px]
 * @cssproperty {pixel} [--c2-page-header__actions--gap=8px]
 * @cssproperty {color} [--c2-page-header__link--color=rgb(2, 101, 220)] - The parent link.
 * @cssproperty {font-size} [--c2-page-header__link--font-size=14px]
 * @cssproperty {pixel} [--c2-page-header__more--size=36px]
 * @cssproperty {border-radius} [--c2-page-header__more--border-radius=8px]
 * @cssproperty {border} [--c2-page-header__more--border=1px solid #bcbcc6]
 * @cssproperty {color} [--c2-page-header__more--background-color=#ffffff]
 * @cssproperty {color} [--c2-page-header__more--color=#18181b]
 * @cssproperty {color} [--c2-page-header__more__hover--background-color=#f4f4f5]
 * @cssproperty {outline} [--c2-page-header__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-page-header__navigation--margin-top=4px]
 * @cssproperty {pixel} [--c2-page-header__condensed--height=48px]
 * @cssproperty {color} [--c2-page-header__condensed--background-color=rgba(255, 255, 255, 0.92)]
 * @cssproperty {backdrop-filter} [--c2-page-header__condensed--backdrop-filter=blur(12px)]
 * @cssproperty {border} [--c2-page-header__condensed--border-bottom=1px solid #e4e4e7]
 * @cssproperty {font-size} [--c2-page-header__condensed__title--font-size=14px]
 *
 * @internalcomponent c2-menu
 */
@customElement('c2-page-header')
export class PageHeader extends LitElement {
  static override styles = unsafeCSS(styles)

  // Slots pick their children by hand, so a folded action can be left out without writing `slot` on it (an attribute
  // the server never rendered, which React reports as a hydration mismatch).
  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, slotAssignment: 'manual' }

  /** Keep a condensed bar with the title and the primary action once the title has scrolled out of view. */
  @property({ type: Boolean, reflect: true }) sticky = false

  /** Overrides the target of the parent link derived from the breadcrumb. */
  @property({ attribute: 'parent-href' }) parentHref = ''

  /** Overrides the text of the parent link derived from the breadcrumb. */
  @property({ attribute: 'parent-label' }) parentLabel = ''

  /** Accessible name of the "More actions" button. Empty: "More actions" in the page language. */
  @property({ attribute: 'more-actions-label' }) moreActionsLabel = ''

  @state() private groups = new Map<string, (Element | Text)[]>()
  @state() private folded: Action[] = []
  @state() private narrow = false
  @state() private isCondensed = false
  @state() private parentLink: { href: string; label: string } | null = null
  @state() private primaryShift = { x: 0, y: 0, width: 0 }
  /**
   * False for the first render, on the server and in the browser alike: a server renderer cannot see the light DOM, so
   * the first render shows every part and no derived content, which is also what hydration expects to find.
   */
  @state() private collected = false

  @query('.title-line') private titleLine?: HTMLElement
  @query('.title-row') private titleRow?: HTMLElement
  @query('.actions') private actionsElement?: HTMLElement
  @query('.primary') private primaryElement?: HTMLElement
  @query('.more') private moreElement?: HTMLElement

  private readonly internals = isServer ? undefined : this.attachInternals()
  private readonly msg = new LocalizeController(this, pageHeaderMessages)

  private mutationObserver?: MutationObserver
  private breadcrumbObserver?: MutationObserver
  private resizeObserver?: ResizeObserver
  private intersectionObserver?: IntersectionObserver
  private measuredWidth = -1
  private foldScheduled = false
  private sheet?: CSSStyleSheet
  private observedTop = 0

  /** Whether the condensed bar is showing. */
  get condensed(): boolean {
    return this.isCondensed
  }

  /** The actions currently folded into "More actions". */
  get foldedActions(): Element[] {
    return [...this.folded]
  }

  /** False only when the shadow root came from declarative shadow DOM (server rendering), which is always in named mode. */
  private get manualSlots(): boolean {
    return (this.renderRoot as ShadowRoot | undefined)?.slotAssignment === 'manual'
  }

  private get actions(): Action[] {
    return (this.groups.get('actions') ?? []).filter((node): node is Action => node instanceof HTMLElement)
  }

  private get primary(): Action | undefined {
    return this.actions.find((action) => action.hasAttribute('primary'))
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (isServer) return
    this.collectChildren()
    this.mutationObserver ??= new MutationObserver((records) => {
      const own = (record: MutationRecord) => (record.type === 'childList' ? record.target === this : (record.target as Node).parentNode === this)
      if (records.some(own)) this.collectChildren()
    })
    this.mutationObserver.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['slot', 'primary', 'overflow-priority', 'hidden'],
    })
    this.resizeObserver ??= new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      const width = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width
      // Any height change moves the point where a sticky header stops sliding up.
      if (this.sticky) {
        this.syncCondensedGeometry()
        this.observeTitle()
      }
      if (Math.abs(width - this.measuredWidth) < 0.5) return
      this.measuredWidth = width
      this.narrow = width < NARROW_MAX
      this.scheduleFold()
    })
    this.resizeObserver.observe(this)
    this.observeTitle()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.mutationObserver?.disconnect()
    this.breadcrumbObserver?.disconnect()
    this.resizeObserver?.disconnect()
    this.intersectionObserver?.disconnect()
    this.intersectionObserver = undefined
  }

  protected override firstUpdated(): void {
    if (isServer) return
    this.collected = true
    // A shell measures its header after both have rendered; pick up its offset once it has.
    requestAnimationFrame(() => requestAnimationFrame(() => this.observeTitle()))
    this.sheet = new CSSStyleSheet()
    const root = this.renderRoot as ShadowRoot
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, this.sheet]
    this.observeTitle()
  }

  /** Groups the light-DOM children by the slot they asked for; each slot is then assigned its group by hand. */
  private collectChildren() {
    const groups = new Map<string, (Element | Text)[]>()
    for (const node of this.childNodes) {
      let name = ''
      if (node instanceof Element) name = node.getAttribute('slot') ?? ''
      else if (!(node instanceof Text) || !(node.textContent ?? '').trim()) continue
      if (name && !NAMED_SLOTS.includes(name as NamedSlot)) continue
      groups.set(name, [...(groups.get(name) ?? []), node as Element | Text])
    }
    this.groups = groups
    this.folded = this.folded.filter((action) => this.actions.includes(action))
    this.observeBreadcrumb()
    this.deriveParent()
    this.scheduleFold()
  }

  /** The parent link: the breadcrumb's second-to-last item, overridden by `parent-href` / `parent-label`. */
  private deriveParent() {
    const breadcrumb = (this.groups.get('breadcrumb') ?? []).find((node): node is Element => node instanceof Element && node.localName === 'c2-breadcrumb')
    const items = breadcrumb ? [...breadcrumb.children].filter((child) => child.getAttribute('slot') !== 'separator') : []
    const item = items.length >= 2 ? (items[items.length - 2] as Action) : undefined
    const href = this.parentHref || item?.href || item?.getAttribute('href') || ''
    const label = this.parentLabel || (item?.textContent ?? '').replace(/\s+/g, ' ').trim()
    this.parentLink = href && label ? { href, label } : null
  }

  private observeBreadcrumb() {
    this.breadcrumbObserver?.disconnect()
    const breadcrumb = (this.groups.get('breadcrumb') ?? []).find((node): node is Element => node instanceof Element)
    if (!breadcrumb) return
    this.breadcrumbObserver ??= new MutationObserver(() => this.deriveParent())
    this.breadcrumbObserver.observe(breadcrumb, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href'] })
  }

  private get stickyTop(): number {
    return Math.round(Number.parseFloat(getComputedStyle(this).getPropertyValue('--c2-page-header--sticky-top')) || 0)
  }

  /**
   * Watches the title line against the area below `--c2-page-header--sticky-top`. The offset can change after the
   * observer was made (a `c2-app-shell` measures its header after both have rendered), so it is re-read on every
   * callback and resize, and the observer is rebuilt when it moved.
   */
  private observeTitle() {
    if (isServer || !this.sticky || !this.titleLine) return
    const top = this.stickyTop
    if (this.intersectionObserver && top === this.observedTop) return
    this.intersectionObserver?.disconnect()
    this.observedTop = top
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (this.stickyTop !== this.observedTop) return this.observeTitle()
        const entry = entries[entries.length - 1]
        // Condensed when the title has left through the top, not when it is still below the fold.
        const condensed = !entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0) + 1
        this.setCondensed(condensed)
      },
      { rootMargin: `${-top}px 0px 0px 0px` },
    )
    this.intersectionObserver.observe(this.titleLine)
  }

  private setCondensed(condensed: boolean) {
    if (condensed === this.isCondensed) return
    this.isCondensed = condensed
    this.dispatchEvent(new CustomEvent<CondensedChangeEventDetail>('condensed-change', { detail: { condensed } }))
  }

  private scheduleFold() {
    if (isServer || this.foldScheduled || !this.manualSlots) return
    this.foldScheduled = true
    // Unfold everything, let it render, then measure and fold what does not fit; both happen before paint.
    const previous = this.folded
    this.folded = []
    void this.updateComplete.then(() => {
      this.foldScheduled = false
      this.fold(previous)
    })
  }

  private fold(previous: Action[]) {
    const row = this.titleRow
    const actionsElement = this.actionsElement
    if (!row || !actionsElement) return
    const style = getComputedStyle(this)
    const gap = Number.parseFloat(getComputedStyle(actionsElement).columnGap) || 0
    const minTitle = Number.parseFloat(style.getPropertyValue('--c2-page-header__title--min-width')) || 240
    const rowGap = Number.parseFloat(getComputedStyle(row).columnGap) || 0
    const available = this.narrow ? row.clientWidth : row.clientWidth - minTitle - rowGap
    const visible = this.actions.filter((action) => !action.hidden)
    const width = (action: Element) => action.getBoundingClientRect().width
    const moreWidth = this.moreElement ? this.moreElement.getBoundingClientRect().width || 36 : 36
    let total = visible.reduce((sum, action) => sum + width(action), 0) + gap * Math.max(0, visible.length - 1)
    const folded: Action[] = []
    if (total > available + 0.5) {
      total += moreWidth + gap
      for (const action of foldOrder(visible.filter((action) => action !== this.primary && isFoldable(action)))) {
        if (total <= available + 0.5) break
        folded.push(action)
        total -= width(action) + gap
      }
    }
    // The menu lists them in row order.
    const ordered = visible.filter((action) => folded.includes(action))
    this.folded = ordered
    if (ordered.length !== previous.length || ordered.some((action, index) => action !== previous[index])) {
      this.dispatchEvent(new CustomEvent<OverflowChangeEventDetail>('overflow-change', { detail: { folded: [...ordered] } }))
    }
  }

  private handleMenuSelect(event: CustomEvent<MenuSelectEventDetail>) {
    // The menu is an implementation detail: its event must not reach the page as if it came from the header.
    event.stopPropagation()
    const action = this.folded[Number(event.detail.value)]
    if (!action || isDisabled(action)) return
    // A link row navigates by itself.
    if (action.localName === 'a' || action.localName === 'c2-link-button') return
    const type = (action.type ?? action.getAttribute('type') ?? '').toLowerCase()
    const form = action.form ?? action.closest('form')
    if ((type === 'submit' || type === 'reset') && form && action.localName !== 'a') {
      if (type === 'reset') form.reset()
      else if (action instanceof HTMLButtonElement) form.requestSubmit(action)
      else form.requestSubmit()
      return
    }
    action.click()
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('parentHref') || changed.has('parentLabel')) this.deriveParent()
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has('sticky')) {
      this.intersectionObserver?.disconnect()
      this.intersectionObserver = undefined
      if (this.sticky) this.observeTitle()
      else this.setCondensed(false)
    }
    if (this.sticky && !this.isServerRendered) this.syncCondensedGeometry()
    const internals = this.internals
    if (internals) {
      const states: Record<string, boolean> = { narrow: this.narrow, condensed: this.isCondensed, 'has-folded': this.folded.length > 0 }
      for (const [name, on] of Object.entries(states)) {
        if (on) internals.states.add(name)
        else internals.states.delete(name)
      }
    }
  }

  private get isServerRendered(): boolean {
    return isServer || !this.sheet
  }

  /**
   * The host sticks with only its last `--c2-page-header__condensed--height` pixels in view, so it never leaves its
   * containing block; the primary action is shifted (not moved) into the bar, keeping its place, state and focus.
   */
  private syncCondensedGeometry() {
    const condensedHeight = Number.parseFloat(getComputedStyle(this).getPropertyValue('--c2-page-header__condensed--height')) || 48
    const offset = Math.max(0, Math.round(this.offsetHeight - condensedHeight))
    this.sheet?.replaceSync(`:host { --_collapse-offset: ${offset}px; }`)
    const primary = this.primaryElement
    if (!primary || !this.isCondensed) {
      if (this.primaryShift.x || this.primaryShift.y) this.primaryShift = { x: 0, y: 0, width: primary?.offsetWidth ?? 0 }
      return
    }
    const right = Number.parseFloat(getComputedStyle(this).getPropertyValue('--c2-page-header--padding-right')) || 24
    const box = this.relativeBox(primary)
    const x = Math.round(this.clientWidth - right - box.width - box.left)
    const y = Math.round(this.offsetHeight - condensedHeight + (condensedHeight - box.height) / 2 - box.top)
    if (x !== this.primaryShift.x || y !== this.primaryShift.y || box.width !== this.primaryShift.width) this.primaryShift = { x, y, width: box.width }
  }

  /** The element's layout box relative to the host, ignoring any transform on it. */
  private relativeBox(element: HTMLElement) {
    let left = 0
    let top = 0
    let node: HTMLElement | null = element
    while (node && node !== this) {
      left += node.offsetLeft
      top += node.offsetTop
      node = node.offsetParent as HTMLElement | null
    }
    return { left, top, width: element.offsetWidth, height: element.offsetHeight }
  }

  private renderSlot(name: NamedSlot | '', nodes?: (Element | Text)[], fallback: unknown = nothing) {
    const assigned = nodes ?? this.groups.get(name) ?? []
    return this.manualSlots
      ? html`<slot name=${name || nothing} ${assignSlot(assigned)}>${fallback}</slot>`
      : html`<slot name=${name || nothing}>${fallback}</slot>`
  }

  private renderParentLink(compact = false) {
    const link = this.parentLink
    if (!link || !this.collected) return nothing
    const name = this.msg.t('backTo', link.label)
    return html`<a class="parent-link ${compact ? 'compact' : ''}" href=${link.href} aria-label=${name} title=${compact ? name : nothing}
      ><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${BACK}</svg
      >${compact ? nothing : html`<span>${link.label}</span>`}</a
    >`
  }

  private renderMore() {
    const folded = this.folded
    return html`<c2-menu class="more-menu" @menu-select=${this.handleMenuSelect}>
      <button
        slot="trigger"
        class="more"
        part="more-actions"
        type="button"
        ?hidden=${folded.length === 0}
        aria-label=${this.moreActionsLabel || this.msg.t('moreActions')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${MORE}</svg>
      </button>
      ${folded.map(
        (action, index) =>
          html`<c2-menu-item
            value=${String(index)}
            ?disabled=${isDisabled(action)}
            href=${action.localName === 'a' || action.localName === 'c2-link-button' ? (action.href ?? action.getAttribute('href') ?? nothing) : nothing}
            target=${action.target || nothing}
            >${actionLabel(action)}</c2-menu-item
          >`,
      )}
    </c2-menu>`
  }

  private renderCondensed() {
    if (!this.sticky) return nothing
    if (!this.collected) return html`<div class="condensed-bar" part="condensed"></div>`
    const title = (this.groups.get('') ?? [])
      .map((node) => node.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    const suffix = (this.groups.get('title-suffix') ?? []).filter((node): node is Element => node instanceof Element).map((node) => node.cloneNode(true))
    return html`<div class="condensed-bar" part="condensed" style=${styleMap({ '--_primary-width': `${this.primaryShift.width}px` })}>
      ${this.renderParentLink(true)}
      <span class="condensed-title" aria-hidden="true">${title}</span>
      <span class="condensed-suffix" aria-hidden="true">${suffix}</span>
    </div>`
  }

  override render() {
    const manual = this.manualSlots
    const primary = this.primary
    const rowActions = manual ? this.actions.filter((action) => action !== primary && !this.folded.includes(action)) : undefined
    const has = (name: NamedSlot | '') => !this.collected || (this.groups.get(name)?.length ?? 0) > 0
    const shift = this.isCondensed ? `translate(${this.primaryShift.x}px, ${this.primaryShift.y}px)` : ''
    return html`
      <header
        class=${classMap({
          'c2-page-header': true,
          narrow: this.narrow,
          condensed: this.isCondensed,
          'has-parent': this.collected && ((this.groups.get('parent')?.length ?? 0) > 0 || this.parentLink !== null),
          'has-leading': has('leading'),
          'has-navigation': has('navigation'),
          'has-toolbar': has('toolbar'),
        })}
        part="base"
      >
        <div class="context" part="context" ?hidden=${!has('breadcrumb')}>${this.renderSlot('breadcrumb')}</div>
        <div class="parent" part="parent">${this.renderSlot('parent', undefined, this.renderParentLink())}</div>
        <div class="title-row" part="title-row">
          <div class="title-area">
            <div class="title-line">
              <div class="leading" part="leading" ?hidden=${!has('leading')}>${this.renderSlot('leading')}</div>
              <div class="heading">${this.renderSlot('')}</div>
              <div class="suffix" ?hidden=${!has('title-suffix')}>${this.renderSlot('title-suffix')}</div>
            </div>
            <div class="description" ?hidden=${!has('description')}>${this.renderSlot('description')}</div>
            <div class="meta" ?hidden=${!has('meta')}>${this.renderSlot('meta')}</div>
          </div>
          <div class="actions" part="actions" ?hidden=${!has('actions')}>
            <span class="row-actions">${this.renderSlot('actions', rowActions)}</span>
            ${manual ? this.renderMore() : nothing}
            ${manual && primary ? html`<span class="primary" style=${styleMap({ transform: shift })}>${html`<slot name="primary-action" ${assignSlot([primary])}></slot>`}</span>` : nothing}
          </div>
        </div>
        <div class="navigation" part="navigation" ?hidden=${!has('navigation')}>${this.renderSlot('navigation')}</div>
        <div class="toolbar" part="toolbar" ?hidden=${!has('toolbar')}>${this.renderSlot('toolbar')}</div>
        ${this.renderCondensed()}
      </header>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-page-header': PageHeader
  }
}
