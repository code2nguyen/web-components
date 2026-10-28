import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/sheet'
import '@c2n/copy-button'
import '@c2n/qr-code'
import { shareSheetMessages } from './messages'
import styles from './share-sheet.scss?inline'

export { shareSheetMessages } from './messages'

/** The share targets the sheet knows. */
export type ShareTarget = 'copy' | 'email' | 'sms' | 'x' | 'linkedin' | 'facebook' | 'whatsapp' | 'telegram' | 'reddit' | 'native'

/** Events fired by {@link ShareSheet}, keyed for `addEventListener`. */
export interface ShareSheetEventMap {
  share: CustomEvent<{ target: ShareTarget; url: string }>
  open: Event
  close: Event
}

export interface ShareSheet {
  addEventListener: TypedAddEventListener<ShareSheet, ShareSheetEventMap>
  removeEventListener: TypedRemoveEventListener<ShareSheet, ShareSheetEventMap>
}

interface TargetSpec {
  /** The network's name, a proper noun; the built-in ones that are not networks name themselves through messages. */
  name?: string
  /** What the round tile shows: the network's initial, or a glyph. */
  mark: string
  /** The share address, from the encoded url, text and heading. */
  href: (url: string, text: string, heading: string) => string
  /** Opens in the same tab (mail and text messages hand over to an app). */
  sameTab?: boolean
}

const enc = encodeURIComponent
const join = (...parts: string[]) => parts.filter(Boolean).join(' ')

const TARGETS: Record<Exclude<ShareTarget, 'copy' | 'native'>, TargetSpec> = {
  email: { mark: 'mail', sameTab: true, href: (url, text, heading) => `mailto:?subject=${enc(heading)}&body=${enc(join(text, url))}` },
  sms: { mark: 'chat', sameTab: true, href: (url, text) => `sms:?&body=${enc(join(text, url))}` },
  x: { name: 'X', mark: 'X', href: (url, text) => `https://x.com/intent/post?url=${enc(url)}${text ? `&text=${enc(text)}` : ''}` },
  linkedin: { name: 'LinkedIn', mark: 'in', href: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
  facebook: { name: 'Facebook', mark: 'f', href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
  whatsapp: { name: 'WhatsApp', mark: 'W', href: (url, text) => `https://wa.me/?text=${enc(join(text, url))}` },
  telegram: { name: 'Telegram', mark: 'T', href: (url, text) => `https://t.me/share/url?url=${enc(url)}${text ? `&text=${enc(text)}` : ''}` },
  reddit: {
    name: 'Reddit',
    mark: 'r',
    href: (url, _text, heading) => `https://www.reddit.com/submit?url=${enc(url)}${heading ? `&title=${enc(heading)}` : ''}`,
  },
}

const DEFAULT_TARGETS = ['email', 'x', 'linkedin', 'facebook', 'whatsapp']

/** The url, made absolute, when it is an http(s) address; `''` for anything else, which no target is offered. */
function safeUrl(value: string): string {
  if (!value) return ''
  try {
    const url = new URL(value, document.baseURI)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

const glyphs = {
  mail: html`<svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </svg>`,
  chat: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" /></svg>`,
  more: html`<svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="6" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="18" cy="12" r="1.5" />
  </svg>`,
}

/**
 * Share a link anywhere, like the share dialogs of Notion, Figma and YouTube: the link with a copy button, a row of
 * targets (email, X, LinkedIn, Facebook, WhatsApp, …), the device's own share sheet where there is one, and an
 * optional QR code. It opens as a `c2-sheet`, from the bottom by default (`side`).
 *
 * `url` is what is shared, `heading` names it ("Share “Trip to Lisbon”") and `text` goes with it where the target
 * takes text. `targets` picks the targets, `;`-separated, from `email`, `sms`, `x`, `linkedin`, `facebook`,
 * `whatsapp`, `telegram` and `reddit`; copying the link is always there. `qr` adds a QR code of the link. Only an
 * http(s) link is offered to the targets: anything else leaves the copy field alone.
 *
 * `share()` is what a Share button calls: it opens the device's share sheet (`navigator.share`) where there is one,
 * and this sheet otherwise. Every target fires a cancelable `share` with `{ target, url }` before it opens (in a new
 * tab, without a referrer); cancel it to handle that target yourself.
 *
 * The targets show the network's initial on a neutral tile: no trademarked logo is drawn. An app with licensed artwork
 * puts it in the target's slot (`<img slot="icon-linkedin" …>`).
 *
 * @tag c2-share-sheet
 *
 * @slot icon-linkedin - Artwork for a target, in place of its tile. Likewise `icon-email`, `icon-sms`, `icon-x`, `icon-facebook`, `icon-whatsapp`, `icon-telegram`, `icon-reddit` and `icon-native`.
 *
 * @event {CustomEvent<{ target: string; url: string }>} share - Cancelable. Fired before a target opens, and after the link is copied (target `copy`).
 * @event {Event} open - Fired after the sheet has opened.
 * @event {Event} close - Fired after the sheet has closed.
 *
 * @csspart link - The read-only link field.
 * @csspart targets - The row of targets.
 * @csspart target - One target.
 * @csspart tile - A target's round tile.
 * @csspart qr - The QR code.
 *
 * @cssproperty {pixel} [--c2-share-sheet--gap=20px] - Space between the link, the targets and the QR code.
 * @cssproperty {color} [--c2-share-sheet__link--background=#f4f4f5]
 * @cssproperty {color} [--c2-share-sheet__link--color=#3f3f46]
 * @cssproperty {border-radius} [--c2-share-sheet__link--border-radius=8px]
 * @cssproperty {pixel} [--c2-share-sheet__tile--size=48px]
 * @cssproperty {color} [--c2-share-sheet__tile--background=#f4f4f5]
 * @cssproperty {color} [--c2-share-sheet__tile--color=#18181b]
 * @cssproperty {color} [--c2-share-sheet__tile__hover--background=#e4e4e7]
 * @cssproperty {font-size} [--c2-share-sheet__label--font-size=12px]
 * @cssproperty {color} [--c2-share-sheet__label--color=#52525b]
 * @cssproperty {pixel} [--c2-share-sheet__qr--size=160px]
 * @cssproperty {outline} [--c2-share-sheet__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-share-sheet')
export class ShareSheet extends LitElement {
  static override styles = unsafeCSS(styles)

  /** What is shared. Only an http(s) link is offered to the targets. */
  @property() url = ''

  /** The name of what is shared, for the heading and the targets that take a title. */
  @property() heading = ''

  /** Text that goes with the link, where the target takes text (a post, a message, an email body). */
  @property() text = ''

  /** The targets, `;`-separated: `email`, `sms`, `x`, `linkedin`, `facebook`, `whatsapp`, `telegram`, `reddit`. */
  @property({ converter: arrayPropertyConverter }) targets: string[] = DEFAULT_TARGETS

  /** Shows a QR code of the link. */
  @property({ type: Boolean }) qr = false

  /** Whether the sheet is open. */
  @property({ type: Boolean, reflect: true }) open = false

  /** The edge the sheet comes from, as `c2-sheet`'s `side`. */
  @property() side: 'top' | 'right' | 'bottom' | 'left' = 'bottom'

  private readonly msg = new LocalizeController(this, shareSheetMessages)
  private nativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  /** Opens the sheet. */
  show(): void {
    this.open = true
  }

  /** Closes the sheet. */
  close(): void {
    this.open = false
  }

  /** Opens the device's share sheet where there is one, and this sheet otherwise. What a Share button calls. */
  async share(): Promise<void> {
    const url = safeUrl(this.url)
    if (this.nativeShare && url) {
      if (!this.fire('native', url)) return
      try {
        await navigator.share({ title: this.heading || undefined, text: this.text || undefined, url })
        return
      } catch (error) {
        // The user dismissed the device's sheet: nothing more to do.
        if ((error as DOMException)?.name === 'AbortError') return
      }
    }
    this.show()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('open') && changed.get('open') !== undefined) {
      this.dispatchEvent(new Event(this.open ? 'open' : 'close', { bubbles: true, composed: true }))
    }
  }

  private fire(target: ShareTarget, url: string): boolean {
    return this.dispatchEvent(new CustomEvent('share', { detail: { target, url }, bubbles: true, composed: true, cancelable: true }))
  }

  private handleTarget(event: MouseEvent, target: ShareTarget, url: string): void {
    if (!this.fire(target, url)) event.preventDefault()
  }

  private async handleNative(url: string): Promise<void> {
    if (!this.fire('native', url)) return
    try {
      await navigator.share({ title: this.heading || undefined, text: this.text || undefined, url })
    } catch {
      // Dismissed or refused: the sheet stays open with the other targets.
    }
  }

  /** The sheet closed itself (Escape, the backdrop, its × button): its own `close` stays inside, this one goes out. */
  private handleSheetClose(event: Event): void {
    event.stopPropagation()
    this.open = false
  }

  private renderTile(target: string, content: unknown) {
    return html`<span class="tile" part="tile"><slot name="icon-${target}">${content}</slot></span>`
  }

  private renderTargets(url: string) {
    const names = Array.isArray(this.targets) ? this.targets : DEFAULT_TARGETS
    const known = names.filter((name, at) => name in TARGETS && names.indexOf(name) === at) as (keyof typeof TARGETS)[]
    return html`<ul class="targets" part="targets" aria-label=${this.msg.t('targets')}>
      ${known.map((name) => {
        const spec = TARGETS[name]
        const visible = spec.name ?? this.msg.t(name === 'email' ? 'email' : 'sms')
        const label = spec.name ? this.msg.t('shareOn', spec.name) : this.msg.t(name === 'email' ? 'shareByEmail' : 'shareBySms')
        const mark = spec.mark in glyphs ? glyphs[spec.mark as keyof typeof glyphs] : html`<span class="initial">${spec.mark}</span>`
        return html`<li>
          <a
            class="target"
            part="target"
            href=${spec.href(url, this.text, this.heading)}
            target=${spec.sameTab ? nothing : '_blank'}
            rel="noopener noreferrer"
            aria-label=${label}
            @click=${(event: MouseEvent) => this.handleTarget(event, name, url)}
          >
            ${this.renderTile(name, mark)}
            <span class="label" aria-hidden="true">${visible}</span>
          </a>
        </li>`
      })}
      ${
        this.nativeShare
          ? html`<li>
              <button class="target" part="target" type="button" aria-label=${this.msg.t('moreOptions')} @click=${() => this.handleNative(url)}>
                ${this.renderTile('native', glyphs.more)}
                <span class="label" aria-hidden="true">${this.msg.t('more')}</span>
              </button>
            </li>`
          : nothing
      }
    </ul>`
  }

  override render() {
    const url = safeUrl(this.url)
    const shown = url || this.url
    return html`<c2-sheet .open=${this.open} side=${this.side} swipe-close @close=${this.handleSheetClose} @open=${(event: Event) => event.stopPropagation()}>
      <span slot="title">${this.msg.t('heading', this.heading)}</span>
      <div class="body">
        <div class="link-row">
          <input
            class="link"
            part="link"
            type="text"
            readonly
            aria-label=${this.msg.t('link')}
            .value=${shown}
            @focus=${(event: FocusEvent) => (event.target as HTMLInputElement).select()}
          />
          <c2-copy-button
            .value=${shown}
            reveal="always"
            label=${this.msg.t('copy')}
            copied-label=${this.msg.t('copied')}
            @copied=${(event: Event) => {
              event.stopPropagation()
              this.fire('copy', shown)
            }}
          ></c2-copy-button>
        </div>
        ${url ? this.renderTargets(url) : nothing}
        ${this.qr && url ? html`<c2-qr-code class="qr" part="qr" .value=${url} aria-label=${this.msg.t('qr', url)}></c2-qr-code>` : nothing}
      </div>
    </c2-sheet>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-share-sheet': ShareSheet
  }
}
