import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './avatar.scss?inline'

export type AvatarStatus = 'online' | 'away' | 'busy' | 'offline'

const LEGACY_COUNT_ATTRIBUTE = 'initialcount'

/**
 * Shows a person or entity as an image, initials or any slotted content, with an optional status dot or badge.
 *
 * Resolution order: the `src` image (falling back to initials if it fails to load), then slotted content, then the
 * initials computed from `name`. Set `auto-color` to derive a stable background hue from the name.
 *
 * @tag c2-avatar
 *
 * @slot - Custom content shown instead of the initials (an icon, an emoji, an `<img>`).
 * @slot badge - Small element pinned to the bottom-right corner (a count, an icon). Replaces the `status` dot.
 *
 * @event {Event} error - Fired when the `src` image fails to load; the initials are shown instead.
 *
 * @cssproperty {pixel} [--c2-avatar--size=32px]
 * @cssproperty {pixel} --c2-avatar--width - Falls back to `--c2-avatar--size`.
 * @cssproperty {pixel} --c2-avatar--height - Falls back to `--c2-avatar--size`.
 * @cssproperty {color} [--c2-avatar--color=#ffffff]
 * @cssproperty {background} [--c2-avatar--background=rgb(0, 122, 77)] - Ignored when `auto-color` is set.
 * @cssproperty {box-shadow} --c2-avatar--box-shadow - e.g. `0 0 0 2px #fff` for a ring in stacked groups.
 *
 * @cssproperty {border-radius} [--c2-avatar--border-top-left-radius=999px]
 * @cssproperty {border-radius} [--c2-avatar--border-top-right-radius=999px]
 * @cssproperty {border-radius} [--c2-avatar--border-bottom-left-radius=999px]
 * @cssproperty {border-radius} [--c2-avatar--border-bottom-right-radius=999px]
 *
 * @cssproperty {border} --c2-avatar--border-top
 * @cssproperty {border} --c2-avatar--border-bottom
 * @cssproperty {border} --c2-avatar--border-right
 * @cssproperty {border} --c2-avatar--border-left
 *
 * @cssproperty {font-size} [--c2-avatar--font-size=calc(var(--c2-avatar--size) * 0.4)]
 * @cssproperty {font-weight} [--c2-avatar--font-weight=600]
 * @cssproperty {font-style} --c2-avatar--font-style
 * @cssproperty {font-family} --c2-avatar--font-family
 * @cssproperty {letter-spacing} [--c2-avatar--letter-spacing=0.02em]
 *
 * @cssproperty {saturation} [--c2-avatar__auto-color--saturation=55%] - Saturation of the hue derived from the name.
 * @cssproperty {lightness} [--c2-avatar__auto-color--lightness=42%] - Lightness of the hue derived from the name.
 *
 * @cssproperty {object-fit} [--c2-avatar__image--object-fit=cover]
 *
 * @cssproperty {pixel} [--c2-avatar__badge--size=10px] - Diameter of the status dot; slotted badges size themselves.
 * @cssproperty {border} [--c2-avatar__badge--border=2px solid #ffffff] - Ring separating the badge from the avatar.
 * @cssproperty {pixel} [--c2-avatar__badge--offset=0px] - Positive values push the badge outwards.
 * @cssproperty {color} [--c2-avatar__badge__online--color=rgb(34, 197, 94)]
 * @cssproperty {color} [--c2-avatar__badge__away--color=rgb(245, 158, 11)]
 * @cssproperty {color} [--c2-avatar__badge__busy--color=rgb(239, 68, 68)]
 * @cssproperty {color} [--c2-avatar__badge__offline--color=rgb(161, 161, 170)]
 */
@customElement('c2-avatar')
export class Avatar extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Full name: source of the initials, the accessible label and the `auto-color` hue. */
  @property() name = ''

  /** Number of initials to show. With 2 and a name of three or more words, the first and last word are used. */
  @property({ type: Number, attribute: 'initial-count' }) initialCount = 1

  /** Explicit initials; overrides the ones computed from `name`. */
  @property() initials: string | undefined = undefined

  /** Image URL. Falls back to the initials when the image fails to load. */
  @property() src: string | undefined = undefined

  /** Image alt text; defaults to `name`. */
  @property() alt: string | undefined = undefined

  /** Derive a stable background hue from `name` (same name, same color). */
  @property({ type: Boolean, reflect: true, attribute: 'auto-color' }) autoColor = false

  /** Presence dot in the bottom-right corner. */
  @property({ reflect: true }) status: AvatarStatus | undefined = undefined

  @state() private imageFailed = false

  /** Accepts the pre-1.0 camelCase `initialCount="2"` attribute as well. */
  static override get observedAttributes() {
    return [...super.observedAttributes, LEGACY_COUNT_ATTRIBUTE]
  }

  override attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (name === LEGACY_COUNT_ATTRIBUTE) {
      if (value !== null) this.initialCount = Number(value) || 1
      return
    }
    super.attributeChangedCallback(name, old, value)
  }

  /** Initials shown when there is no image or slotted content. */
  get initial(): string {
    if (this.initials) return this.initials
    const words = this.name.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ''
    const picked = this.initialCount === 2 && words.length > 2 ? [words[0], words[words.length - 1]] : words.slice(0, Math.max(1, this.initialCount))
    return picked
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase()
  }

  /** Hue (0–359) derived from the name, used by `auto-color`. */
  get hue(): number {
    // FNV-1a: cheap and spreads similar names across the wheel far better than a plain `hash * 31` sum.
    let hash = 0x811c9dc5
    for (const char of this.name) hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193)
    return (hash >>> 0) % 360
  }

  override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('src')) this.imageFailed = false
  }

  private handleImageError() {
    this.imageFailed = true
    this.dispatchEvent(new Event('error'))
  }

  override render() {
    const showImage = !!this.src && !this.imageFailed
    const label = this.alt ?? this.name
    return html`
      <div
        class=${classMap({ 'c2-avatar': true, 'has-image': showImage })}
        style=${this.autoColor ? `--c2-avatar--hue: ${this.hue}` : nothing}
        role="img"
        aria-label=${label || nothing}
      >
        ${
          showImage
            ? html`<img
                class="c2-avatar-image"
                src=${this.src!}
                alt=${ifDefined(this.alt ?? (this.name || undefined))}
                loading="lazy"
                @error=${this.handleImageError}
              />`
            : html`<slot>${this.initial}</slot>`
        }
      </div>
      <slot name="badge" class="c2-avatar-badge"> ${this.status ? html`<span class="c2-avatar-status" aria-label=${this.status}></span>` : nothing} </slot>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-avatar': Avatar
  }
}
