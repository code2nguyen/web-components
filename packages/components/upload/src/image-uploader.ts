import { html, nothing, svg, unsafeCSS } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { Upload, type UploadEventMap, type UploadItem, type UploadRejectionReason } from './upload'
import { imageUploaderMessages } from './image-uploader-messages'
import styles from './image-uploader.scss?inline'

/** What the camera opens on a phone when the add tile is used: the front (`user`) or back (`environment`) camera. */
export type ImageUploaderCapture = 'user' | 'environment'

/** Context handed to {@link ImageUploader.renderBadge} for each tile. */
export interface ImageUploaderBadgeContext {
  item: UploadItem
  /** Position of the tile, from 0. The tile at 0 is the cover when `cover` is set. */
  index: number
  /** Whether this tile is the cover. */
  cover: boolean
}

/** Draws the badge in a tile's corner; return `nothing` (or `undefined`) for none. */
export type ImageUploaderBadgeRenderer = (context: ImageUploaderBadgeContext) => unknown

/** Detail of the `reorder` event. */
export interface ImageUploaderReorderDetail {
  item: UploadItem
  /** Position before the move, from 0. */
  from: number
  /** Position after the move, from 0. */
  to: number
  items: UploadItem[]
}

/** Events fired by {@link ImageUploader}: those of `c2-upload`, plus `reorder`. */
export interface ImageUploaderEventMap extends UploadEventMap {
  reorder: CustomEvent<ImageUploaderReorderDetail>
}

export interface ImageUploader {
  addEventListener: TypedAddEventListener<ImageUploader, ImageUploaderEventMap>
  removeEventListener: TypedRemoveEventListener<ImageUploader, ImageUploaderEventMap>
}

interface PointerDrag {
  id: string
  pointerId: number
  from: number
  x: number
  y: number
  rects: DOMRect[]
  moved: boolean
}

/**
 * A `c2-upload` drawn as a grid of image thumbnails ending in an add tile: per-tile upload progress, retry and
 * removal, a `max-files` count, drag or keyboard reordering with `reorderable`, and a `cover` badge on the first
 * image. Without `multiple` it holds one image in a single large tile that offers to replace it. Uploads go through
 * the same `uploadHandler` as `c2-upload`, and everything else of `c2-upload` (validation, events, form value) applies.
 *
 * @tag c2-image-uploader
 * @owntemplate
 *
 * @slot add-icon - Replaces the plus icon of the add tile.
 * @slot add-label - Replaces the add tile's label ("Add image").
 * @slot hint - Supporting text under the grid, such as accepted formats. Hidden when empty.
 * @csspart grid - The list of tiles, add tile included.
 * @csspart tile - Each image tile.
 * @csspart image - The thumbnail image of a tile.
 * @csspart badge - The badge in a tile's corner (the cover badge, or what `renderBadge` returns).
 * @csspart overlay - The progress or error layer over a tile while it uploads or after it failed.
 * @csspart add - The add tile.
 * @csspart add-label - The label region of the add tile, wrapping the `add-label` slot.
 * @csspart hint - The region wrapping the `hint` slot.
 * @csspart errors - Validation-error status region.
 *
 * @event {CustomEvent<ImageUploaderReorderDetail>} reorder - Fired after an image moved, by pointer or keyboard, or through `moveItem()`.
 *
 * @cssproperty {pixel} [--c2-image-uploader--width=480px]
 * @cssproperty {pixel} [--c2-image-uploader__grid--gap=8px]
 * @cssproperty {pixel} [--c2-image-uploader__tile--min-width=96px] - Smallest tile width; the grid fits as many columns as this allows.
 * @cssproperty {ratio} [--c2-image-uploader__tile--aspect-ratio=1]
 * @cssproperty {border-radius} [--c2-image-uploader__tile--border-radius=8px]
 * @cssproperty {color} [--c2-image-uploader__tile--background=#f4f4f5]
 * @cssproperty {object-fit} [--c2-image-uploader__tile--object-fit=cover]
 * @cssproperty {pixel} [--c2-image-uploader__single--width=240px] - Width of the one tile without `multiple`.
 * @cssproperty {ratio} [--c2-image-uploader__single--aspect-ratio=4 / 3]
 * @cssproperty {color} [--c2-image-uploader__add--background=#ffffff]
 * @cssproperty {border} [--c2-image-uploader__add--border=1px dashed #bcbcc6]
 * @cssproperty {color} [--c2-image-uploader__add--color=#71717a]
 * @cssproperty {font-size} [--c2-image-uploader__add--font-size=12px]
 * @cssproperty {color} [--c2-image-uploader__add__hover--background=#fafafa]
 * @cssproperty {border} [--c2-image-uploader__add__hover--border=1px dashed #a1a1aa]
 * @cssproperty {color} [--c2-image-uploader__add__drag--background=#e8f2ff]
 * @cssproperty {border} [--c2-image-uploader__add__drag--border=1px dashed rgb(2, 101, 220)]
 * @cssproperty {pixel} [--c2-image-uploader__add-icon--size=24px]
 * @cssproperty {color} [--c2-image-uploader__add-icon--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-image-uploader__add-label--color=#18181b]
 * @cssproperty {font-weight} [--c2-image-uploader__add-label--font-weight=500]
 * @cssproperty {color} [--c2-image-uploader__overlay--background=rgba(24, 24, 27, 0.55)]
 * @cssproperty {color} [--c2-image-uploader__overlay__error--background=rgba(127, 29, 29, 0.78)]
 * @cssproperty {color} [--c2-image-uploader__overlay--color=#fafafa]
 * @cssproperty {pixel} [--c2-image-uploader__action--size=24px]
 * @cssproperty {color} [--c2-image-uploader__action--background=rgba(24, 24, 27, 0.72)]
 * @cssproperty {color} [--c2-image-uploader__action__hover--background=rgba(24, 24, 27, 0.9)]
 * @cssproperty {color} [--c2-image-uploader__action--color=#fafafa]
 * @cssproperty {color} [--c2-image-uploader__badge--background=rgba(24, 24, 27, 0.72)]
 * @cssproperty {color} [--c2-image-uploader__badge--color=#fafafa]
 * @cssproperty {font-size} [--c2-image-uploader__badge--font-size=12px]
 * @cssproperty {outline} [--c2-image-uploader__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {outline} [--c2-image-uploader__grabbed--outline=2px solid rgb(2, 101, 220)]
 * @cssproperty {box-shadow} [--c2-image-uploader__grabbed--box-shadow=0 8px 24px rgba(24, 24, 27, 0.2)]
 * @cssproperty {color} [--c2-image-uploader__drop--color=rgb(2, 101, 220)] - Insertion mark where a dragged image will land.
 * @cssproperty {color} [--c2-image-uploader__hint--color=#71717a]
 * @cssproperty {font-size} [--c2-image-uploader__hint--font-size=12px]
 * @cssproperty {color} [--c2-image-uploader__add__error--border-color=#dc2626] - Add tile border colour while an enclosing `c2-form-field` shows an error.
 * @cssproperty {opacity} [--c2-image-uploader__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-upload__error--color=#dc2626] - Colour of the rejected-file messages.
 * @cssproperty {font-size} [--c2-upload__error--font-size=12px]
 * @cssproperty {pixel} [--c2-upload__error--gap=4px]
 * @cssproperty {pixel} [--c2-upload__list--margin-top=12px] - Space above the rejected-file messages.
 */
@customElement('c2-image-uploader')
export class ImageUploader extends Upload {
  static override styles = [Upload.styles, unsafeCSS(styles)]

  private readonly strings = new LocalizeController(this, imageUploaderMessages)
  private readonly slots = new SlotPresenceController(this, ['hint'])
  @state() private grabbedId: string | undefined
  @state() private dropIndex: number | undefined
  @state() private announcement = ''
  private grabOrigin = 0
  private moving = false
  private pointerDrag: PointerDrag | undefined
  private suppressClick = false
  // The image `replace()` swaps out when the browser returns a file, in a grid of several.
  @state() private replacing: string | undefined

  /** File types to accept, in the native `accept` syntax. Images by default. */
  @property({ type: String }) override accept = 'image/*'

  /** Opens the camera instead of the file browser on phones that support it (the native `capture` attribute). */
  @property() capture: ImageUploaderCapture | undefined

  /** Lets people reorder the images by dragging a tile or with the keyboard. The order is the order of `value`. */
  @property({ type: Boolean, reflect: true }) reorderable = false

  /** Marks the first image as the cover with a badge. */
  @property({ type: Boolean, reflect: true }) cover = false

  /** Draws the badge in each tile's corner, replacing the cover badge. */
  @property({ attribute: false }) renderBadge: ImageUploaderBadgeRenderer | undefined

  // Without `multiple` the one tile stays a target: a new file replaces the image.
  protected override get pickerDisabled(): boolean {
    return this.effectiveDisabled || (this.multiple && !this.canAddMore && this.replacing === undefined)
  }

  protected override rejectionMessage(reason: UploadRejectionReason, file: File): string {
    if (reason === 'multiple') return this.strings.t('rejectMultiple')
    if (reason === 'limit') return this.strings.t('rejectLimit', this.maxFiles)
    if (reason === 'type') return this.strings.t('rejectType', file.name)
    return this.strings.t('rejectSize', file.name, this.formatBytes(this.maxSize))
  }

  override browse(): void {
    this.replacing = undefined
    super.browse()
  }

  /** Adds images; without `multiple`, a valid image replaces the one there. */
  override addFiles(files: Iterable<File>): UploadItem[] {
    const replacing = this.uploadItems.find((item) => item.id === this.replacing)
    this.replacing = undefined
    const current = this.multiple ? replacing : this.uploadItems[0]
    if (!current || this.effectiveDisabled) return super.addFiles(files)
    const held = this.uploadItems
    this.uploadItems = []
    const accepted = super.addFiles([...files].slice(0, 1))
    if (!accepted.length) {
      this.uploadItems = held
      return accepted
    }
    // The new image takes the old one's place.
    const index = held.indexOf(current)
    this.uploadItems = [...held.slice(0, index), ...this.uploadItems, ...held.slice(index)]
    this.removeFile(current.id)
    return accepted
  }

  /** Opens the file browser (or the camera) to replace one image; the image stays if nothing is chosen. */
  async replace(id: string): Promise<void> {
    if (this.effectiveDisabled || !this.uploadItems.some((item) => item.id === id)) return
    this.replacing = id
    await this.updateComplete
    this.input.click()
  }

  /** Moves an image to a position, from 0, and fires `reorder`, `input` and `change`. */
  moveItem(id: string, to: number): void {
    const from = this.uploadItems.findIndex((item) => item.id === id)
    const target = Math.max(0, Math.min(this.uploadItems.length - 1, to))
    if (from < 0 || from === target) return
    const items = [...this.uploadItems]
    const [item] = items.splice(from, 1)
    items.splice(target, 0, item)
    this.uploadItems = items
    const detail: ImageUploaderReorderDetail = { item, from, to: target, items }
    this.dispatchEvent(new CustomEvent('reorder', { detail, bubbles: true, composed: true }))
    this.notifyValueChange()
  }

  private get canReorder(): boolean {
    return this.reorderable && this.multiple && !this.effectiveDisabled && this.uploadItems.length > 1
  }

  private handleFor(id: string): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(`[data-id="${id}"] .handle`)
  }

  private async moveAndKeepFocus(id: string, to: number): Promise<void> {
    this.moving = true
    this.moveItem(id, to)
    await this.updateComplete
    const handle = this.handleFor(id)
    handle?.closest('li')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    handle?.focus({ preventScroll: true })
    this.moving = false
  }

  private announce(text: string): void {
    // Reset, then set on the next frame, so a repeated message is read again.
    this.announcement = ''
    requestAnimationFrame(() => (this.announcement = text))
  }

  private nameOf(item: UploadItem): string {
    return item.file.name
  }

  private handleHandleClick(item: UploadItem): void {
    if (this.suppressClick) {
      this.suppressClick = false
      return
    }
    if (this.grabbedId === item.id) this.drop()
    else this.grab(item)
  }

  private grab(item: UploadItem): void {
    if (!this.canReorder) return
    this.grabbedId = item.id
    this.grabOrigin = this.uploadItems.indexOf(item)
    this.announce(this.strings.t('pickedUp', this.nameOf(item), this.grabOrigin + 1, this.uploadItems.length))
  }

  private drop(): void {
    const item = this.uploadItems.find((candidate) => candidate.id === this.grabbedId)
    this.grabbedId = undefined
    if (!item) return
    const index = this.uploadItems.indexOf(item)
    if (index !== this.grabOrigin) this.announce(this.strings.t('moved', this.nameOf(item), index + 1, this.uploadItems.length))
  }

  private handleHandleKeydown(event: KeyboardEvent, item: UploadItem): void {
    // modern-web-ignore: ime-enter the handler is on the reorder handle, a button; no text is typed there
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      this.handleHandleClick(item)
      return
    }
    if (this.grabbedId !== item.id) return
    const index = this.uploadItems.indexOf(item)
    const last = this.uploadItems.length - 1
    const rtl = getComputedStyle(this).direction === 'rtl'
    let to: number | undefined
    if (event.key === 'Escape') {
      event.preventDefault()
      this.grabbedId = undefined
      void this.moveAndKeepFocus(item.id, this.grabOrigin)
      this.announce(this.strings.t('returned', this.nameOf(item), this.grabOrigin + 1))
      return
    }
    if (event.key === 'ArrowUp' || event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) to = index - 1
    else if (event.key === 'ArrowDown' || event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) to = index + 1
    else if (event.key === 'Home') to = 0
    else if (event.key === 'End') to = last
    if (to === undefined) return
    event.preventDefault()
    to = Math.max(0, Math.min(last, to))
    if (to === index) return
    void this.moveAndKeepFocus(item.id, to)
    this.announce(this.strings.t('moved', this.nameOf(item), to + 1, this.uploadItems.length))
  }

  private handleHandleBlur(item: UploadItem): void {
    if (!this.moving && this.grabbedId === item.id) this.drop()
  }

  private handlePointerDown(event: PointerEvent, item: UploadItem): void {
    if (event.button !== 0 || this.pointerDrag || !this.canReorder) return
    const handle = event.currentTarget as HTMLElement
    const tiles = [...this.renderRoot.querySelectorAll<HTMLElement>('.tile')]
    handle.setPointerCapture(event.pointerId)
    this.pointerDrag = {
      id: item.id,
      pointerId: event.pointerId,
      from: this.uploadItems.indexOf(item),
      x: event.clientX,
      y: event.clientY,
      rects: tiles.map((tile) => tile.getBoundingClientRect()),
      moved: false,
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    const drag = this.pointerDrag
    if (!drag || event.pointerId !== drag.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    const tile = (event.currentTarget as HTMLElement).closest<HTMLElement>('.tile')
    if (tile) tile.style.translate = `${dx}px ${dy}px`
    // The landing spot is the tile whose centre is nearest the pointer, from the rects taken when the drag began.
    let nearest = drag.from
    let best = Number.POSITIVE_INFINITY
    drag.rects.forEach((rect, index) => {
      const distance = Math.hypot(rect.left + rect.width / 2 - event.clientX, rect.top + rect.height / 2 - event.clientY)
      if (distance < best) {
        best = distance
        nearest = index
      }
    })
    this.dropIndex = nearest
  }

  private handlePointerEnd(event: PointerEvent, commit: boolean): void {
    const drag = this.pointerDrag
    if (!drag || event.pointerId !== drag.pointerId) return
    this.pointerDrag = undefined
    const tile = (event.currentTarget as HTMLElement).closest<HTMLElement>('.tile')
    if (tile) tile.style.translate = ''
    const to = this.dropIndex
    this.dropIndex = undefined
    if (!drag.moved) return
    // A mouse drag ends in a click on the handle, which must not pick the image up; a touch drag ends in none.
    this.suppressClick = true
    setTimeout(() => (this.suppressClick = false))
    if (commit && to !== undefined && to !== drag.from) {
      const item = this.uploadItems[drag.from]
      void this.moveAndKeepFocus(drag.id, to)
      if (item) this.announce(this.strings.t('moved', this.nameOf(item), to + 1, this.uploadItems.length))
    }
  }

  // The add tile and the replace buttons are the controls; the file input only opens the browser for them.
  protected override renderInput() {
    return html`
      <input
        type="file"
        tabindex="-1"
        aria-hidden="true"
        .accept=${this.accept}
        capture=${this.capture || nothing}
        ?multiple=${this.multiple}
        ?disabled=${this.pickerDisabled}
        @input=${this.stopNativeInput}
        @change=${this.handleInputChange}
      />
    `
  }

  private get addLabel(): string {
    return this.strings.t(this.multiple ? 'addMany' : 'add')
  }

  private renderCloseIcon() {
    return svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>`
  }

  private renderTile(item: UploadItem, index: number) {
    const name = this.nameOf(item)
    const cover = this.cover && index === 0
    const badge = this.renderBadge ? this.renderBadge({ item, index, cover }) : cover ? this.strings.t('cover') : nothing
    const progress = Math.round(item.progress)
    const grabbed = this.grabbedId === item.id
    const media = item.previewUrl
      ? html`<img part="image" class="image" src=${item.previewUrl} alt=${name} draggable="false" />`
      : html`<span part="image" class="image image--empty" role="img" aria-label=${name}></span>`
    return html`
      <li
        part="tile"
        class=${classMap({
          tile: true,
          'tile--grabbed': grabbed,
          'tile--dragging': this.pointerDrag?.id === item.id,
          'tile--drop': this.dropIndex === index && this.pointerDrag?.from !== index,
        })}
        data-id=${item.id}
        data-status=${item.status}
      >
        ${
          this.canReorder
            ? html`<button
                type="button"
                class="handle"
                aria-label=${this.strings.t('reorder', name, index + 1, this.uploadItems.length)}
                aria-pressed=${grabbed ? 'true' : 'false'}
                @click=${() => this.handleHandleClick(item)}
                @keydown=${(event: KeyboardEvent) => this.handleHandleKeydown(event, item)}
                @blur=${() => this.handleHandleBlur(item)}
                @pointerdown=${(event: PointerEvent) => this.handlePointerDown(event, item)}
                @pointermove=${this.handlePointerMove}
                @pointerup=${(event: PointerEvent) => this.handlePointerEnd(event, true)}
                @pointercancel=${(event: PointerEvent) => this.handlePointerEnd(event, false)}
                @lostpointercapture=${(event: PointerEvent) => this.handlePointerEnd(event, false)}
              >
                ${media}
              </button>`
            : media
        }
        ${badge === nothing || badge === undefined || badge === null ? nothing : html`<span part="badge" class="badge">${badge}</span>`}
        ${
          item.status === 'uploading'
            ? html`<div part="overlay" class="overlay">
                <progress class="visually-hidden" max="100" .value=${progress} aria-label=${this.strings.t('uploading', name)}></progress>
                <svg class="ring" viewBox="0 0 24 24" aria-hidden="true">
                  <circle class="ring-track" cx="12" cy="12" r="9" pathLength="100" />
                  <circle class="ring-value" cx="12" cy="12" r="9" pathLength="100" stroke-dasharray=${`${progress} 100`} />
                </svg>
                <span aria-hidden="true">${progress}%</span>
              </div>`
            : nothing
        }
        ${
          item.status === 'error'
            ? html`<div part="overlay" class="overlay overlay--error">
                <span role="status">${this.strings.t('failed')}</span>
                <button
                  type="button"
                  class="retry"
                  aria-label=${this.strings.t('retryLabel', name)}
                  ?disabled=${this.effectiveDisabled}
                  @click=${() => void this.retry(item.id)}
                >
                  ${this.strings.t('retry')}
                </button>
              </div>`
            : nothing
        }
        ${
          !this.multiple && item.status !== 'uploading'
            ? html`<button
                type="button"
                class="action replace"
                aria-label=${this.strings.t('replaceLabel', name)}
                ?disabled=${this.effectiveDisabled}
                @click=${() => this.replace(item.id)}
              >
                ${this.strings.t('replace')}
              </button>`
            : nothing
        }
        <button
          type="button"
          class="action remove"
          aria-label=${this.strings.t(item.status === 'uploading' ? 'cancel' : 'remove', name)}
          ?disabled=${this.effectiveDisabled}
          @click=${() => this.removeFile(item.id)}
        >
          ${this.renderCloseIcon()}
        </button>
      </li>
    `
  }

  private renderAddTile() {
    if (this.uploadItems.length && (!this.multiple || !this.canAddMore)) return nothing
    return html`
      <li class="add-cell">
        <button
          part="add"
          type="button"
          class=${classMap({ add: true, picker: true, 'add--dragging': this.dragging })}
          ?disabled=${this.effectiveDisabled}
          aria-invalid=${this.field.invalid ? 'true' : nothing}
          aria-describedby=${this.field.describedBy() || nothing}
          @click=${this.browse}
        >
          <slot name="add-icon"
            ><svg class="add-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg
          ></slot>
          <span part="add-label" class="add-label"><slot name="add-label">${this.addLabel}</slot></span>
          ${this.multiple && this.maxFiles > 0 ? html`<span class="count">${this.strings.t('count', this.uploadItems.length, this.maxFiles)}</span>` : nothing}
        </button>
      </li>
    `
  }

  override render() {
    const label = this.ariaLabel || this.field.label || this.strings.t('label')
    const grabbed = this.grabbedId !== undefined
    return html`
      ${this.renderInput()}
      <ul
        part="grid"
        class=${classMap({ grid: true, 'grid--single': !this.multiple, 'grid--files-over': this.dragging })}
        aria-label=${label}
        @dragenter=${this.handleDragEnter}
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @drop=${this.handleDrop}
      >
        ${repeat(
          this.uploadItems,
          (item) => item.id,
          (item, index) => this.renderTile(item, index),
        )}
        ${this.renderAddTile()}
      </ul>
      ${
        this.canReorder
          ? html`<div class=${classMap({ keys: true, 'keys--active': grabbed })} aria-hidden="true">
              ${this.strings.t(grabbed ? 'movingHint' : 'grabHint')}
            </div>`
          : nothing
      }
      <div part="hint" class="hint" ?hidden=${!this.slots.has('hint')}><slot name="hint" @slotchange=${this.slots.handleSlotChange}></slot></div>
      ${this.renderErrors()}
      <span class="visually-hidden" role="status">${this.announcement}</span>
      ${this.field.renderDescription()}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-image-uploader': ImageUploader
  }
}
