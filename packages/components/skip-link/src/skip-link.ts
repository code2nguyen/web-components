import { LitElement, html, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { skipLinkMessages } from './messages'
import styles from './skip-link.scss?inline'

/**
 * A "Skip to main content" link for keyboard and screen-reader users. Place it first in the page: it stays out of
 * sight until it receives focus, then appears in the top-start corner, and activating it moves focus to the target so
 * the next Tab continues inside the main content instead of walking the header and navigation again. A target that
 * cannot take focus (a `<main>` or `<section>`) gets `tabindex="-1"` while it holds focus. The page URL is left alone,
 * so the link is safe in an app with hash routing.
 *
 * @tag c2-skip-link
 *
 * @slot - Link text. Defaults to the translatable "Skip to main content".
 *
 * @csspart link - The native `<a>` element.
 *
 * @cssproperty {position} [--c2-skip-link--position=fixed] - `absolute` places it against a positioned ancestor instead of the viewport.
 * @cssproperty {pixel} [--c2-skip-link--top=8px]
 * @cssproperty {pixel} [--c2-skip-link--inset-inline-start=8px]
 * @cssproperty {number} [--c2-skip-link--z-index=1000]
 * @cssproperty {padding} [--c2-skip-link--padding=8px 16px]
 * @cssproperty {color} [--c2-skip-link--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-skip-link--color=#ffffff]
 * @cssproperty {border} [--c2-skip-link--border=none]
 * @cssproperty {border-radius} [--c2-skip-link--border-radius=6px]
 * @cssproperty {box-shadow} [--c2-skip-link--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {font-family} [--c2-skip-link--font-family=inherit]
 * @cssproperty {font-size} [--c2-skip-link--font-size=14px]
 * @cssproperty {font-weight} [--c2-skip-link--font-weight=600]
 * @cssproperty {text-decoration} [--c2-skip-link--text-decoration=none]
 * @cssproperty {outline} [--c2-skip-link__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-skip-link__focus--outline-offset=2px]
 * @cssproperty {time} [--c2-skip-link--transition-duration=150ms] - How long the link takes to slide in.
 */
@customElement('c2-skip-link')
export class SkipLink extends LitElement {
  static override styles = unsafeCSS(styles)

  /**
   * Fragment of the element to move focus to, such as `#main`. Without one the link targets the page's first
   * `<main>` element.
   */
  @property({ type: String }) href = ''

  private readonly msg = new LocalizeController(this, skipLinkMessages)

  override render() {
    return html`<a class="c2-skip-link" part="link" href=${this.href || '#'} @click=${this.handleClick}><slot>${this.msg.t('label')}</slot></a>`
  }

  private resolveTarget(): HTMLElement | null {
    const root = this.getRootNode() as Document | ShadowRoot
    if (!this.href) return root.querySelector('main') ?? document.querySelector('main')
    if (!this.href.startsWith('#')) return null
    const id = safeDecode(this.href.slice(1))
    return root.getElementById(id) ?? document.getElementById(id)
  }

  private handleClick(event: MouseEvent) {
    // A modified click (new tab, new window, download) is the browser's to handle.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = this.resolveTarget()
    // Without href the link only ever means "the main content": never fall through to navigating to "#".
    if (!this.href) event.preventDefault()
    // A link to another page, or a fragment that is not on this one, keeps the browser's own navigation.
    if (!target) return
    event.preventDefault()
    focusTarget(target)
  }
}

function focusTarget(target: HTMLElement) {
  target.focus()
  if (isFocused(target) || target.hasAttribute('tabindex')) return
  // Not focusable by itself: make it so only while it holds focus, so it never becomes a Tab stop.
  target.setAttribute('tabindex', '-1')
  target.focus()
  if (!isFocused(target)) {
    // Disabled, inert or hidden: leave it exactly as it was.
    target.removeAttribute('tabindex')
    return
  }
  const release = () => {
    // The window losing focus blurs the target too, but it is still the active element and gets focus back on return.
    if (isFocused(target)) return
    target.removeAttribute('tabindex')
    target.removeEventListener('blur', release)
  }
  target.addEventListener('blur', release)
}

function safeDecode(fragment: string) {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

function isFocused(target: HTMLElement) {
  const root = target.getRootNode() as Document | ShadowRoot
  return root.activeElement === target
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-skip-link': SkipLink
  }
}
