import { LitElement, html, unsafeCSS } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import styles from './masonry-item.scss?inline'

/**
 * A fixed-span content tile placed by its parent `c2-masonry`. Tall content scrolls within the tile.
 *
 * @tag c2-masonry-item
 * @slot default - Application-owned tile content.
 * @slot move-icon - Optional move-handle icon; an inline grip is provided by default.
 * @csspart content - Keyboard-reachable scrolling region containing the application content.
 * @csspart controls - Group of edit-only move and resize controls.
 * @csspart move-handle - Button that starts a move operation.
 * @csspart resize-handle - Keyboard-reachable bottom edge that starts a resize operation.
 * @csspart resize-edge - Pointer resize target on the right edge.
 * @cssproperty {color} [--c2-masonry-item--background=transparent] - Tile surface.
 * @cssproperty {border} [--c2-masonry-item--border=none] - Tile border.
 * @cssproperty {border-radius} [--c2-masonry-item--border-radius=0px] - Tile corner radius.
 * @cssproperty {box-shadow} [--c2-masonry-item--box-shadow=none] - Tile elevation.
 * @cssproperty {padding} [--c2-masonry-item__content--padding=0px] - Content inset.
 * @cssproperty {pixel} [--c2-masonry-item__controls--gap=4px] - Move-handle inset from the top and right borders.
 * @cssproperty {color} [--c2-masonry-item__controls--background=transparent] - Surface behind the move-handle corner.
 * @cssproperty {pixel} [--c2-masonry-item__handle--size=32px] - Move-handle hit target size.
 * @cssproperty {pixel} [--c2-masonry-item__resize-handle--size=8px] - Invisible resize-edge hit-zone depth.
 * @cssproperty {color} [--c2-masonry-item__resize-edge__hover--color=rgb(37 99 235 / 35%)] - Right and bottom border color while the tile is hovered or focused.
 * @cssproperty {pixel} [--c2-masonry-item__handle--icon-size=16px] - Built-in move icon size.
 * @cssproperty {color} [--c2-masonry-item__handle--color=#18181b] - Move-handle foreground.
 * @cssproperty {color} [--c2-masonry-item__handle--background=transparent] - Move-handle surface.
 * @cssproperty {border-radius} [--c2-masonry-item__handle--border-radius=6px] - Edit-control corners.
 * @cssproperty {color} [--c2-masonry-item__handle__hover--background=transparent] - Hovered move-handle surface.
 * @cssproperty {outline} [--c2-masonry-item__handle__focus--outline=2px solid #2563eb] - Keyboard focus indicator.
 * @cssproperty {opacity} [--c2-masonry-item__dragging--opacity=0.92] - Active tile opacity.
 * @cssproperty {box-shadow} [--c2-masonry-item__dragging--box-shadow=0 12px 28px rgb(15 23 42 / 24%)] - Active tile elevation.
 */
@customElement('c2-masonry-item')
export class MasonryItem extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Stable identity used for editing and application snapshots. */
  @property({ type: String, attribute: 'item-id', reflect: true }) itemId?: string

  /** Human-readable name used for the scroll region and edit controls. */
  @property({ type: String }) label?: string

  /** Positive integer row span shared across size ranges. */
  @property({ type: Number, reflect: true }) rows = 10

  /** Positive integer base column span. */
  @property({ type: Number, reflect: true }) cols = 3

  /** Optional positive column span for containers narrower than 600 px. */
  @property({ type: Number, attribute: 'cols-xs', reflect: true }) colsXs?: number

  /** Optional positive column span for 600–959.99 px containers. */
  @property({ type: Number, attribute: 'cols-sm', reflect: true }) colsSm?: number

  /** Optional positive column span for 960–1279.99 px containers. */
  @property({ type: Number, attribute: 'cols-md', reflect: true }) colsMd?: number

  /** Optional positive column span for containers at least 1280 px wide. */
  @property({ type: Number, attribute: 'cols-lg', reflect: true }) colsLg?: number

  /** @internal Edit-mode state supplied only by the parent masonry container. */
  @property({ attribute: false }) editing = false

  override render() {
    const label = this.label || this.getAttribute('aria-label') || this.itemId || 'Tile'
    return html`
      ${
        this.editing
          ? html`<div part="controls" class="controls">
              <button type="button" part="move-handle" data-masonry-action="move" aria-label=${`Move ${label}`} aria-describedby="edit-instructions">
                <slot name="move-icon"
                  ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3h1M10 3h1M5 8h1M10 8h1M5 13h1M10 13h1" /></svg
                ></slot>
              </button>
              <div part="resize-edge" class="resize-edge resize-edge--right" data-masonry-action="resize" data-masonry-edge="right"></div>
              <button
                type="button"
                part="resize-handle"
                class="resize-edge resize-edge--bottom"
                data-masonry-action="resize"
                data-masonry-edge="bottom"
                aria-label=${`Resize ${label}`}
                aria-describedby="edit-instructions"
              ></button>
              <span id="edit-instructions" class="sr-only">Press Enter or Space, use arrow keys, then press Enter to save or Escape to cancel.</span>
            </div>`
          : null
      }
      <div part="content" class="content" tabindex="0" role="region" aria-label=${`${label} content`}><slot></slot></div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-masonry-item': MasonryItem
  }
}
