import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { consume } from '@lit/context'
import styles from './tab.scss?inline'
import { selectedTabContext } from './tab-context'

/** Events fired by {@link Tab}, keyed for `addEventListener`. */
export interface TabEventMap {
  'tab-change': CustomEvent<string>
}

export interface Tab {
  addEventListener: TypedAddEventListener<Tab, TabEventMap>
  removeEventListener: TypedRemoveEventListener<Tab, TabEventMap>
}

/**
 * A single tab inside `<c2-tabs>`. Its `for` attribute names the `id` of the panel it controls.
 * The parent owns selection: it sets `selected` and the roving `tabindex`; this element exposes
 * them as `role="tab"`, `aria-selected`, `aria-controls` and `aria-disabled` through `ElementInternals`, so no host attribute is written.
 * The selected tab matches `c2-tab:state(selected)`.
 *
 * Given an `href`, the tab is a link instead, for `<c2-tab-nav>`: it renders an `<a>` that covers the whole tab, is
 * a `listitem` rather than a `tab`, and `current` marks it as the page being shown (`aria-current="page"`). A link tab
 * belongs in `<c2-tab-nav>` only: inside `<c2-tabs>` it is not supported, and `for` and `disabled` do not apply to it.
 *
 * @tag c2-tab
 *
 * @slot - Tab label. Defaults to the `label` attribute.
 *
 * @csspart link - The `<a>` of a tab that has an `href`. It wraps the label and covers the tab.
 *
 * @event {CustomEvent<string>} tab-change - Fired when the user activates this tab (click, Enter or Space). `detail` is the `for` value. Cancelable: `preventDefault()` keeps the current tab.
 */
@customElement('c2-tab')
export class Tab extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Text label, used when no content is slotted. Reflected so SSR keeps it as an attribute. */
  @property({ type: String, reflect: true }) label = ''

  /** `id` of the panel this tab controls. */
  @property({ type: String, reflect: true }) for = ''

  /**
   * URL the tab links to. Makes it a link tab for `<c2-tab-nav>`: an `<a href>` the user follows, so the page (or the
   * application's router) decides what is shown, not a panel.
   */
  @property({ type: String }) href = ''

  /** Link tabs only: marks the tab of the page being shown, announced as `aria-current="page"`. */
  @property({ type: Boolean, reflect: true }) current = false

  /** Prevents activation and removes this tab from keyboard navigation. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /**
   * Set by the parent `<c2-tabs>`; do not set by hand. Not reflected: the strip selects a tab while the page upgrades,
   * before a framework hydrates, so it is exposed as the custom state `c2-tab:state(selected)` instead.
   */
  @property({ type: Boolean }) selected = false

  @consume({ context: selectedTabContext, subscribe: true })
  private selectedTab: string = ''

  // Semantics live on ElementInternals, not host attributes: an attribute the element writes on itself is one the
  // server never rendered, and React reports it as a hydration mismatch. An author-set `role` still wins.
  private readonly internals = this.attachInternals()

  /** The `tabindex` this tab gave itself (a link tab is reached through its `<a>`, so it drops it again). */
  private ownTabIndex = false

  constructor() {
    super()
    this.internals.role = 'tab'
    if (!isServer) {
      this.addEventListener('click', this.handleClick)
      this.addEventListener('keydown', this.handleKeydown)
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    // No `slot` attribute: `<c2-tabs>` assigns its tabs to the strip itself (manual slot assignment), so a tab never
    // writes on its own host. (Nor may a constructor: `document.createElement('c2-tab')` throws `NotSupportedError`
    // when one sets an attribute, which is how Angular's renderer builds the element.)
    if (!this.hasAttribute('tabindex') && !this.href) {
      this.tabIndex = -1
      this.ownTabIndex = true
    }
  }

  override updated(_changed: PropertyValues<this>) {
    if (this.href) {
      // A link tab is a list item holding a link; the `<a>` carries `aria-current` and takes focus itself.
      this.internals.role = 'listitem'
      this.internals.ariaSelected = null
      this.internals.ariaDisabled = null
      this.internals.ariaControlsElements = null
      this.internals.states.delete('selected')
      // modern-web-ignore: host-attribute-write removes only the tabindex this tab wrote on itself before it became a link
      if (this.ownTabIndex && this.getAttribute('tabindex') === '-1') this.removeAttribute('tabindex')
      this.ownTabIndex = false
      return
    }
    this.internals.role = 'tab'
    if (this.selected) this.internals.states.add('selected')
    else this.internals.states.delete('selected')
    this.internals.ariaSelected = String(this.selected)
    this.internals.ariaDisabled = this.disabled ? 'true' : null
    // Resolved on every update: the panel may be added after the tab, and `<c2-tabs>` re-requests an update then.
    const panel = this.for ? (this.getRootNode() as Document | ShadowRoot).getElementById?.(this.for) : null
    this.internals.ariaControlsElements = panel ? [panel] : null
  }

  private handleClick = () => {
    this.activate()
  }

  private handleKeydown = (event: KeyboardEvent) => {
    // A link follows itself on Enter; preventing the default here would stop it.
    if (this.href) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.activate()
    }
  }

  private activate() {
    if (this.href || this.disabled || this.selectedTab === this.for) return
    this.dispatchEvent(new CustomEvent('tab-change', { bubbles: true, cancelable: true, detail: this.for }))
  }

  override render() {
    const label = html`<slot>${this.label || nothing}</slot>`
    return this.href ? html`<a part="link" href=${this.href} aria-current=${this.current ? 'page' : nothing}>${label}</a>` : label
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tab': Tab
  }
}
