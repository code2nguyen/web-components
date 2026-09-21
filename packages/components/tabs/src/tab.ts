import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { isServer } from 'lit-html/is-server.js'
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
 * them as `role="tab"`, `aria-selected`, `aria-controls` and `aria-disabled`.
 *
 * @tag c2-tab
 *
 * @slot - Tab label. Defaults to the `label` attribute.
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

  /** Prevents activation and removes this tab from keyboard navigation. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Set by the parent `<c2-tabs>`; do not set by hand. */
  @property({ type: Boolean, reflect: true }) selected = false

  @consume({ context: selectedTabContext, subscribe: true })
  private selectedTab: string = ''

  constructor() {
    super()
    if (!isServer) {
      this.addEventListener('click', this.handleClick)
      this.addEventListener('keydown', this.handleKeydown)
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    // A custom element constructor must not set attributes: `document.createElement('c2-tab')` enforces that and
    // throws `NotSupportedError`. Parser-created tabs never hit the check, so this only shows up when a framework
    // builds the element imperatively — Angular's renderer does, and the whole tab strip dies with it.
    if (!isServer) this.setAttribute('slot', 'tab')
    if (!this.hasAttribute('role')) this.setAttribute('role', 'tab')
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('selected')) this.setAttribute('aria-selected', String(this.selected))
    if (changed.has('disabled')) {
      if (this.disabled) this.setAttribute('aria-disabled', 'true')
      else this.removeAttribute('aria-disabled')
    }
    if (changed.has('for')) {
      if (this.for) this.setAttribute('aria-controls', this.for)
      else this.removeAttribute('aria-controls')
    }
  }

  private handleClick = () => {
    this.activate()
  }

  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.activate()
    }
  }

  private activate() {
    if (this.disabled || this.selectedTab === this.for) return
    this.dispatchEvent(new CustomEvent('tab-change', { bubbles: true, cancelable: true, detail: this.for }))
  }

  override render() {
    return html`<slot>${this.label}</slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tab': Tab
  }
}
