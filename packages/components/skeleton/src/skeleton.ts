import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import styles from './skeleton.scss?inline'

export type SkeletonVariant = 'rect' | 'text' | 'circle'
export type SkeletonAnimation = 'pulse' | 'wave' | 'none'

/**
 * Placeholder block standing in for content that has not arrived. Three shapes: a `rect` (the default) for images,
 * cards and buttons, `text` for one or more lines of copy, and `circle` (sized by its own variable) for avatars.
 * `lines` repeats a text skeleton with a shorter last line, the way a paragraph ends. The `animation` is a `pulse`
 * by default, `wave` for a sheen sweeping across it, or `none` for a still block; reduced motion stops all three.
 *
 * A skeleton is decoration, so it is hidden from assistive technology and the region it fills should carry
 * `aria-busy="true"` instead. Give one skeleton in a group a `label` to announce the wait itself.
 *
 * @tag c2-skeleton
 *
 * @cssproperty {pixel} [--c2-skeleton--width=100%] - Width of the block. Ignored by `circle`, which sizes itself.
 * @cssproperty {pixel} [--c2-skeleton--height=16px] - Height of the block, or of one line of a `text` skeleton.
 * @cssproperty {border-radius} [--c2-skeleton--border-radius=4px] - Rounding; `circle` overrides it with a full round.
 * @cssproperty {color} [--c2-skeleton--background-color=#e4e4e7] - Colour of the block.
 * @cssproperty {color} [--c2-skeleton__sheen--color=rgba(255, 255, 255, 0.55)] - Highlight swept across a `wave` skeleton.
 * @cssproperty {time} [--c2-skeleton--animation-duration=1.6s] - Length of one pulse or wave cycle.
 * @cssproperty {opacity} [--c2-skeleton__pulse--opacity=0.45] - Faintest point of the `pulse` animation.
 * @cssproperty {pixel} [--c2-skeleton--gap=8px] - Space between the lines of a `text` skeleton.
 * @cssproperty {pixel} [--c2-skeleton__last-line--width=60%] - Width of the final line when `lines` is more than one.
 * @cssproperty {pixel} [--c2-skeleton__circle--size=40px] - Diameter of a `circle` skeleton; it sets both axes so it cannot go oval.
 */
@customElement('c2-skeleton')
export class Skeleton extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Shape of the placeholder. */
  @property({ reflect: true }) variant: SkeletonVariant = 'rect'

  /** How the block animates while it waits. */
  @property({ reflect: true }) animation: SkeletonAnimation = 'pulse'

  /** Number of lines drawn by the `text` variant; the last one is shortened. Ignored by the other variants. */
  @property({ type: Number }) lines = 1

  /** Announce the wait on this skeleton. Leave empty on the rest of a group so the message is not repeated. */
  @property() label = ''

  /** Line count, floored at one, and only meaningful for the `text` variant. */
  private get lineCount(): number {
    if (this.variant !== 'text') return 1
    return Math.max(1, Math.floor(this.lines) || 1)
  }

  override render() {
    const count = this.lineCount
    // Decorative by default: an empty box has nothing to announce, and one per card would be noise.
    const announced = this.label !== ''
    return html`
      <div
        class="c2-skeleton"
        role=${announced ? 'status' : nothing}
        aria-label=${announced ? this.label : nothing}
        aria-hidden=${announced ? nothing : 'true'}
      >
        ${
          count === 1
            ? html`<div class="c2-skeleton-block" part="block"></div>`
            : repeat(
                Array.from({ length: count }, (_value, index) => index),
                (index) => index,
                (index) => html`<div class="c2-skeleton-block" part="block" ?data-last=${index === count - 1}></div>`,
              )
        }
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-skeleton': Skeleton
  }
}
