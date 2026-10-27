import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import '@c2n/hover-card'
import { citationMessages } from './messages'
import styles from './citation.scss?inline'

/** Where the preview opens beside the marker; it flips when there is no room. */
export type CitationPlacement = 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'

/**
 * A link address the marker may follow: http(s), or relative to the page. Anything else (`javascript:`, `data:`) is
 * dropped, so a source taken from a model's output cannot run script when clicked.
 */
export function safeSourceUrl(value: string): string {
  const url = value.trim()
  if (!url) return ''
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase()
  if (scheme === undefined) return url
  return scheme === 'http' || scheme === 'https' ? url : ''
}

/** An icon address the preview may load: what {@link safeSourceUrl} allows, plus inline `data:image/` icons. */
export function safeIconUrl(value: string): string {
  const url = value.trim()
  return /^data:image\//i.test(url) ? url : safeSourceUrl(url)
}

/** The site an address belongs to, without `www.`: `https://www.nytimes.com/…` gives `nytimes.com`. */
export function sourceHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * A numbered marker in generated text that names its source, like the inline citations of Perplexity and ChatGPT
 * search. The marker is a link to `href`; hovering or focusing it opens a preview card with the site, the page's title,
 * a snippet and the address, which the pointer can move into and which Escape closes.
 *
 * The marker shows `index` (or the default slot's content, such as a site name), and a screen reader hears it as
 * "Source 1: <title>" in the page's language. Only http(s) and relative addresses become links: a `javascript:` or
 * other address in model output is dropped, and the marker then only opens its preview. The `preview` slot replaces the
 * card's content.
 *
 * The preview is a `c2-hover-card`, so it opens after `open-delay` and never on touch, where a tap follows the link.
 * Put everything the card says somewhere a touch or keyboard-only reader can also reach it, such as a list of sources.
 *
 * @tag c2-citation
 *
 * @slot - Replaces the marker's text (`index`), such as a site name.
 * @slot preview - Replaces the card's content.
 *
 * @csspart marker - Component-owned marker region: a link to the source, or a button when there is no address to follow. It holds the default slot, whose fallback is the `index` number; assigned content, such as a site name, takes its place inside the marker's pill.
 * @csspart card - The preview card, a `c2-hover-card`.
 * @csspart source - The card's first line: the site's icon and name.
 * @csspart favicon - The site's icon.
 * @csspart site - The site's name.
 * @csspart title - The page's title.
 * @csspart snippet - The quoted passage.
 * @csspart url - The address, at the foot of the card.
 *
 * @cssproperty {pixel} [--c2-citation__marker--min-width=16px]
 * @cssproperty {pixel} [--c2-citation__marker--height=16px]
 * @cssproperty {padding} [--c2-citation__marker--padding=0 4px]
 * @cssproperty {border-radius} [--c2-citation__marker--border-radius=4px]
 * @cssproperty {color} [--c2-citation__marker--background-color=#f4f4f5]
 * @cssproperty {color} [--c2-citation__marker--color=#52525b]
 * @cssproperty {font-size} [--c2-citation__marker--font-size=11px]
 * @cssproperty {font-weight} [--c2-citation__marker--font-weight=500]
 * @cssproperty {length} [--c2-citation__marker--vertical-align=0.15em] - How far the marker rises above the baseline of the text it sits in.
 * @cssproperty {color} [--c2-citation__marker__hover--background-color=#e4e4e7]
 * @cssproperty {color} [--c2-citation__marker__hover--color=#18181b]
 * @cssproperty {outline} [--c2-citation__marker__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 *
 * @cssproperty {pixel} [--c2-citation__card--width=300px]
 * @cssproperty {padding} [--c2-citation__card--padding=12px] - Space inside the card.
 * @cssproperty {pixel} [--c2-citation__card--gap=6px] - Space between the card's lines.
 * @cssproperty {pixel} [--c2-citation__favicon--size=16px]
 * @cssproperty {border-radius} [--c2-citation__favicon--border-radius=4px]
 * @cssproperty {color} [--c2-citation__site--color=#71717a]
 * @cssproperty {font-size} [--c2-citation__site--font-size=12px]
 * @cssproperty {color} [--c2-citation__title--color=#18181b]
 * @cssproperty {font-size} [--c2-citation__title--font-size=14px]
 * @cssproperty {font-weight} [--c2-citation__title--font-weight=600]
 * @cssproperty {color} [--c2-citation__snippet--color=#52525b]
 * @cssproperty {font-size} [--c2-citation__snippet--font-size=13px]
 * @cssproperty {number} [--c2-citation__snippet--line-clamp=3] - Most lines of the snippet before it is cut with an ellipsis.
 * @cssproperty {color} [--c2-citation__url--color=#71717a]
 * @cssproperty {font-size} [--c2-citation__url--font-size=12px]
 */
@customElement('c2-citation')
export class Citation extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The source's number, shown in the marker. */
  @property({ type: Number }) index?: number

  /** The source's address. Only http(s) and relative addresses become a link. */
  @property() href = ''

  /** The cited page's title, shown in the card and announced with the marker. */
  @property({ attribute: 'source-title' }) sourceTitle = ''

  /** The passage the text draws on, shown in the card. */
  @property() snippet = ''

  /** The site's name, shown above the title. Defaults to the address's host. */
  @property() site = ''

  /** The site's icon. Only http(s), relative and `data:image/` addresses are loaded. */
  @property() favicon = ''

  /** Where the link opens. A citation leaves the page the reader is on, so a new tab by default. */
  @property() target = '_blank'

  /** Where the card opens beside the marker; it flips when there is no room. */
  @property() placement: CitationPlacement = 'top'

  /** Milliseconds the pointer rests on the marker before the card opens. */
  @property({ type: Number, attribute: 'open-delay' }) openDelay = 300

  private readonly msg = new LocalizeController(this, citationMessages)
  private readonly slotPresence = new SlotPresenceController(this, ['preview'])

  /** What a screen reader hears for the marker: "Source 1: <title>". */
  private markerName(): string {
    const number = typeof this.index === 'number' && Number.isFinite(this.index) ? String(this.index) : ''
    const source = number ? this.msg.t('numbered', number) : this.msg.t('source')
    return this.sourceTitle ? this.msg.t('named', source, this.sourceTitle) : source
  }

  override render() {
    const href = safeSourceUrl(this.href)
    const name = this.markerName()
    const text = typeof this.index === 'number' && Number.isFinite(this.index) ? String(this.index) : ''
    const marker = href
      ? html`<a
          slot="trigger"
          class="marker"
          part="marker"
          href=${href}
          target=${this.target || nothing}
          rel=${this.target === '_blank' ? 'noopener noreferrer' : nothing}
          aria-label=${name}
          ><slot>${text}</slot></a
        >`
      : html`<button slot="trigger" type="button" class="marker" part="marker" aria-label=${name}><slot>${text}</slot></button>`
    return html`<c2-hover-card class="card" part="card" placement=${this.placement} open-delay=${String(this.openDelay)}>
      ${marker}
      <div class="preview">
        <slot name="preview" @slotchange=${this.slotPresence.handleSlotChange}>${this.renderPreview(href)}</slot>
      </div>
    </c2-hover-card>`
  }

  private renderPreview(href: string) {
    const host = href ? sourceHost(href) : ''
    const site = this.site || host
    const icon = safeIconUrl(this.favicon)
    return html`
      ${
        site || icon
          ? html`<div class="source" part="source">
              ${
                icon
                  ? html`<img class="favicon" part="favicon" src=${icon} alt="" width="16" height="16" loading="lazy" referrerpolicy="no-referrer" />`
                  : nothing
              }
              ${site ? html`<span class="site" part="site">${site}</span>` : nothing}
            </div>`
          : nothing
      }
      ${this.sourceTitle ? html`<div class="title" part="title">${this.sourceTitle}</div>` : nothing}
      ${this.snippet ? html`<p class="snippet" part="snippet">${this.snippet}</p>` : nothing}
      ${href ? html`<div class="url" part="url">${href}</div>` : nothing}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-citation': Citation
  }
}
