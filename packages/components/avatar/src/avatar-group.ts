import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './avatar-group.scss?inline'

export type AvatarGroupCountMode = 'hidden' | 'total'

export interface AvatarGroupOverflowDetail {
  total: number
  visible: number
  hidden: number
}

export interface AvatarGroupEventMap {
  'overflow-change': CustomEvent<AvatarGroupOverflowDetail>
}

export interface AvatarGroup {
  addEventListener: TypedAddEventListener<AvatarGroup, AvatarGroupEventMap>
  removeEventListener: TypedRemoveEventListener<AvatarGroup, AvatarGroupEventMap>
}

const HIDDEN_ATTRIBUTE = 'data-c2-avatar-group-hidden'

/**
 * Responsive stack of `c2-avatar` elements. It observes its rendered width and each avatar's actual size, then hides
 * the avatars that no longer fit and replaces them with a count. The host fills the available inline space up to
 * `--c2-avatar-group--max-width`, so it also reacts when its parent becomes narrower.
 *
 * @tag c2-avatar-group
 *
 * @slotcomponent c2-avatar
 *
 * @slot - `c2-avatar` elements displayed in source order.
 *
 * @event {CustomEvent<AvatarGroupOverflowDetail>} overflow-change - Fired when resizing changes the visible or hidden counts.
 *
 * @csspart overflow - Count shown after the visible avatars.
 *
 * @cssproperty {pixel} [--c2-avatar-group--max-width=320px] - Maximum responsive width of the group.
 * @cssproperty {pixel} [--c2-avatar-group--overlap=10px] - Amount that adjacent avatars overlap.
 * @cssproperty {box-shadow} [--c2-avatar-group__avatar--box-shadow=0 0 0 2px #ffffff] - Ring applied to slotted avatars so overlaps stay distinct.
 * @cssproperty {pixel} [--c2-avatar-group__overflow--size=32px] - Width and height of the overflow count.
 * @cssproperty {color} [--c2-avatar-group__overflow--background=#52525b] - Overflow count background.
 * @cssproperty {color} [--c2-avatar-group__overflow--color=#ffffff] - Overflow count text colour.
 * @cssproperty {border} [--c2-avatar-group__overflow--border=2px solid #ffffff] - Ring around the overflow count.
 * @cssproperty {border-radius} [--c2-avatar-group__overflow--border-radius=999px] - Overflow count corner radius.
 * @cssproperty {font-size} [--c2-avatar-group__overflow--font-size=12px] - Overflow count text size.
 * @cssproperty {font-weight} [--c2-avatar-group__overflow--font-weight=600] - Overflow count text weight.
 */
@customElement('c2-avatar-group')
export class AvatarGroup extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Optional hard cap in addition to the automatically calculated responsive limit. Zero means no hard cap. */
  @property({ type: Number, attribute: 'max-visible' }) maxVisible = 0

  /** Whether the overflow indicator shows `+hidden` or the total number of avatars. */
  @property({ reflect: true, attribute: 'count-mode' }) countMode: AvatarGroupCountMode = 'hidden'

  /** Accessible name for the group. */
  @property({ attribute: 'aria-label' }) override ariaLabel = 'Avatar group'

  @state() private renderedVisibleCount = 0
  @state() private renderedTotalCount = 0
  @query('slot') private slotElement!: HTMLSlotElement

  private resizeObserver?: ResizeObserver
  private measureFrame = 0

  /** Current number of slotted avatars. */
  get total(): number {
    return this.renderedTotalCount
  }

  /** Current number of visible avatars. */
  get visible(): number {
    return this.renderedVisibleCount
  }

  /** Current number of avatars represented by the overflow count. */
  get hiddenCount(): number {
    return Math.max(0, this.total - this.visible)
  }

  protected override firstUpdated(): void {
    if (typeof ResizeObserver === 'undefined') return
    this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure())
    this.resizeObserver.observe(this)
    this.scheduleMeasure()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('maxVisible')) this.scheduleMeasure()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    cancelAnimationFrame(this.measureFrame)
    this.avatarItems.forEach((item) => item.removeAttribute(HIDDEN_ATTRIBUTE))
  }

  private get avatarItems(): HTMLElement[] {
    if (!this.slotElement) return []
    return this.slotElement
      .assignedElements({ flatten: true })
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element.localName === 'c2-avatar')
  }

  private handleSlotChange(): void {
    this.scheduleMeasure()
  }

  /** Recalculates the responsive limit after application code changes a slotted avatar's dimensions. */
  refresh(): void {
    this.scheduleMeasure()
  }

  private scheduleMeasure(): void {
    cancelAnimationFrame(this.measureFrame)
    this.measureFrame = requestAnimationFrame(() => this.measure())
  }

  private measure(): void {
    const items = this.avatarItems
    items.forEach((item) => item.removeAttribute(HIDDEN_ATTRIBUTE))

    const total = items.length
    const available = this.getBoundingClientRect().width
    if (!available || !total) {
      this.commitCounts(total, total)
      return
    }

    const styles = getComputedStyle(this)
    const configuredOverlap = Number.parseFloat(styles.getPropertyValue('--c2-avatar-group--overlap'))
    const overlap = Number.isFinite(configuredOverlap) ? Math.max(0, configuredOverlap) : 10
    const widths = items.map((item) => item.getBoundingClientRect().width)
    const hardLimit = this.maxVisible > 0 ? Math.min(total, Math.floor(this.maxVisible)) : total
    const avatarsWidth = (count: number) => widths.slice(0, count).reduce((sum, width) => sum + width, 0) - Math.max(0, count - 1) * overlap
    const allAllowedFit = hardLimit === total && avatarsWidth(total) <= available

    let visible = total
    if (!allAllowedFit) {
      const overflow = this.renderRoot.querySelector<HTMLElement>('.overflow')?.getBoundingClientRect().width ?? 0
      visible = 0
      for (let count = 0; count <= hardLimit; count += 1) {
        const required = avatarsWidth(count) + overflow - (count > 0 ? overlap : 0)
        if (required <= available) visible = count
        else break
      }
    }

    items.forEach((item, index) => item.toggleAttribute(HIDDEN_ATTRIBUTE, index >= visible))
    this.commitCounts(total, visible)
  }

  private commitCounts(total: number, visible: number): void {
    if (total === this.renderedTotalCount && visible === this.renderedVisibleCount) return
    this.renderedTotalCount = total
    this.renderedVisibleCount = visible
    const detail: AvatarGroupOverflowDetail = { total, visible, hidden: Math.max(0, total - visible) }
    this.dispatchEvent(new CustomEvent('overflow-change', { detail, bubbles: true, composed: true }))
  }

  override render() {
    const hidden = this.hiddenCount
    const count = this.countMode === 'total' ? this.total : hidden
    const label = this.countMode === 'total' ? `${this.total} avatars total` : `${hidden} more avatar${hidden === 1 ? '' : 's'}`

    return html`
      <div class="group" role="group" aria-label=${this.ariaLabel || nothing}>
        <slot @slotchange=${this.handleSlotChange}></slot>
        <span
          class="overflow"
          part="overflow"
          ?data-empty=${hidden === 0}
          aria-hidden=${hidden === 0 ? 'true' : nothing}
          aria-label=${hidden ? label : nothing}
        >
          ${this.countMode === 'hidden' ? '+' : ''}${count}
        </span>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-avatar-group': AvatarGroup
  }
}
