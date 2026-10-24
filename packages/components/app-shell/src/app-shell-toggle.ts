import { LitElement, html, isServer, svg, unsafeCSS } from 'lit'
import { state } from 'lit/decorators.js'
import { ContextConsumer } from '@lit/context'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { appShellContext, type AppShellContext } from '@c2n/core/contexts/app-shell.js'
import { appShellMessages } from './messages.js'
import styles from './app-shell-toggle.scss?inline'

export type AppShellToggleTarget = 'navigation' | 'aside'

const MENU = svg`<path d="M4 6h16M4 12h16M4 18h16" />`
const SIDEBAR = svg`<rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />`
const ASIDE = svg`<rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" />`
const CLOSE = svg`<path d="M18 6 6 18M6 6l12 12" />`

/**
 * The button that opens and closes the navigation (or the aside) of the enclosing `c2-app-shell`. It finds its shell
 * through a context, so it works anywhere inside it, including inside a slotted `c2-header`, with no id and no script.
 * Its `aria-expanded` and its name follow the shell ("Open navigation" / "Close navigation"), and its default icon is a
 * menu glyph while the navigation is a drawer and a sidebar glyph beside main. Outside a shell it renders nothing.
 *
 * @tag c2-app-shell-toggle
 *
 * @slot icon - Replaces the default icon.
 *
 * @csspart button - The native button.
 *
 * @cssproperty {pixel} [--c2-app-shell-toggle--size=40px]
 * @cssproperty {pixel} [--c2-app-shell-toggle__icon--size=20px]
 * @cssproperty {border-radius} [--c2-app-shell-toggle--border-radius=8px]
 * @cssproperty {color} [--c2-app-shell-toggle--color=#18181b]
 * @cssproperty {color} [--c2-app-shell-toggle--background-color=transparent]
 * @cssproperty {color} [--c2-app-shell-toggle__hover--background-color=rgba(24, 24, 27, 0.08)]
 * @cssproperty {outline} [--c2-app-shell-toggle__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-app-shell-toggle')
export class AppShellToggle extends LitElement {
  static override styles = unsafeCSS(styles)

  /** What the button opens: the shell's `navigation` or its `aside`. */
  @property({ reflect: true }) for: AppShellToggleTarget = 'navigation'

  /** Accessible name. Empty: "Open navigation" / "Close navigation" (or "Show details" / "Close details") in the page language. */
  @property() label = ''

  private readonly consumer = new ContextConsumer(this, { context: appShellContext, subscribe: true })
  private readonly internals = isServer ? undefined : this.attachInternals()
  private readonly msg = new LocalizeController(this, appShellMessages)

  /**
   * False for the first render, on the server and in the browser alike: a server renderer has no shell to ask, and
   * hydration keeps the attributes the server wrote, so the first client render must match it.
   */
  @state() private hydrated = false

  private get shell(): AppShellContext | undefined {
    return this.hydrated ? this.consumer.value : undefined
  }

  override connectedCallback(): void {
    super.connectedCallback()
    // In static markup the toggle can upgrade before `c2-app-shell` is defined, when no shell answers its request;
    // ask again once the shell exists.
    if (!isServer && !this.consumer.value) {
      customElements.whenDefined('c2-app-shell').then(() => {
        if (!this.isConnected || this.consumer.value) return
        this.consumer.hostDisconnected()
        this.consumer.hostConnected()
      })
    }
  }

  protected override firstUpdated(): void {
    this.hydrated = true
  }

  protected override updated(): void {
    // Outside a shell there is nothing to toggle: the host hides itself through a custom state, not an attribute.
    if (this.shell) this.internals?.states.add('in-shell')
    else this.internals?.states.delete('in-shell')
  }

  private get opened(): boolean {
    if (!this.shell) return false
    return this.for === 'aside' ? this.shell.asideOpened : this.shell.navigationOpened
  }

  private handleClick() {
    if (this.for === 'aside') this.shell?.toggleAside()
    else this.shell?.toggleNavigation()
  }

  private get defaultName(): string {
    if (this.for === 'aside') return this.msg.t(this.opened ? 'closeDetails' : 'openDetails')
    return this.msg.t(this.opened ? 'closeNavigation' : 'openNavigation')
  }

  private get icon() {
    if (this.for === 'aside') return this.opened ? CLOSE : ASIDE
    return this.shell?.mode === 'over' ? MENU : SIDEBAR
  }

  override render() {
    return html`<button
      class="c2-app-shell-toggle"
      part="button"
      type="button"
      aria-expanded=${this.opened ? 'true' : 'false'}
      aria-label=${this.label || this.defaultName}
      @click=${this.handleClick}
    >
      <slot name="icon"
        ><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          ${this.icon}
        </svg></slot
      >
    </button>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-app-shell-toggle': AppShellToggle
  }
}
