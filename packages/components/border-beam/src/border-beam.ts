import { LitElement, html, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './border-beam.scss?inline'

export type BorderBeamSide = 'all' | 'top' | 'right' | 'bottom' | 'left'

const BORDER_SIDES: BorderBeamSide[] = ['all', 'top', 'right', 'bottom', 'left']

/**
 * Decorative overlay that sends one or more soft highlights around the border of its containing block. Place it as
 * a direct child of a positioned container. The component inherits the container radius and uses a border mask, so
 * the highlight sits on the real border instead of drawing a second, offset outline.
 *
 * @tag c2-border-beam
 *
 * @csspart beam - Each animated gradient beam.
 *
 * @cssproperty {pixel} [--c2-border-beam--outset=0px] - Distance between the beam layer and the container edge.
 * @cssproperty {pixel} [--c2-border-beam__beam--size=100px] - Length of the visible highlight.
 * @cssproperty {pixel} [--c2-border-beam__beam--width=1px] - Width of the border channel that reveals the beam.
 * @cssproperty {border-radius} [--c2-border-beam__beam--radius=12px] - Corner radius of the motion path.
 * @cssproperty {color} [--c2-border-beam__beam--color-from=#0265dc] - Leading gradient colour.
 * @cssproperty {color} [--c2-border-beam__beam--color-to=#60a5fa] - Trailing gradient colour.
 * @cssproperty {opacity} [--c2-border-beam__beam--opacity=0.95] - Opacity of each beam.
 * @cssproperty {filter} [--c2-border-beam__beam--filter=drop-shadow(0 0 3px rgba(2, 101, 220, 0.35))] - Glow or other filter applied to each beam.
 * @cssproperty {time} [--c2-border-beam__beam--duration=6s] - Time taken to travel once around the perimeter.
 * @cssproperty {time} [--c2-border-beam__beam--delay=0s] - Delay before animation; a negative value starts partway around.
 * @cssproperty {integer} [--c2-border-beam--z-index=1] - Stacking level of the decorative overlay.
 */
@customElement('c2-border-beam')
export class BorderBeam extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Number of beams distributed evenly around the perimeter. */
  @property({ type: Number }) count = 1

  /** Border followed by the beam. `all` loops around the perimeter; one edge moves forward then backward. */
  @property({ reflect: true }) side: BorderBeamSide = 'all'

  /** Sends the beams around the perimeter in the opposite direction. */
  @property({ type: Boolean, reflect: true }) reverse = false

  /** Freezes the beams at their current positions. */
  @property({ type: Boolean, reflect: true }) paused = false

  private get visibleSide(): BorderBeamSide {
    return BORDER_SIDES.includes(this.side) ? this.side : 'all'
  }

  override render() {
    const count = Number.isFinite(this.count) ? Math.max(1, Math.floor(this.count)) : 1

    return html`
      <div class="border-beam border-beam--${this.visibleSide}" aria-hidden="true">
        ${Array.from({ length: count }, (_, index) => {
          return html`
            <span
              class="beam${count > 1 ? ' beam--staggered' : ''}"
              part="beam"
              style=${styleMap({
                '--_c2-border-beam-phase': index / count,
              })}
            ></span>
          `
        })}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-border-beam': BorderBeam
  }
}
