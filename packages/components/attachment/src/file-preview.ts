import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { lockPageScroll } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { filePreviewMessages } from './file-preview-messages.js'
import styles from './file-preview.scss?inline'

/** How a file is shown: by the browser's own image, video, audio or PDF viewer, as text, or not at all (`file`). */
export type FilePreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'file'

/** One file of the set. Give `src` (a URL), `file` (local content, such as a `File` from an input) or `text`. */
export interface FilePreviewItem {
  /** File name, shown in the header and used for the download. */
  name: string
  /** URL of the file. Only `http:`, `https:`, `blob:` and `data:` URLs are used. */
  src?: string
  /** Local content, read in place of `src`; its object URL is revoked when the item goes. */
  file?: Blob
  /** MIME type (`application/pdf`) or a type word (`PDF`, `Markdown`). Guessed from the name when omitted. */
  type?: string
  /** Human-readable size, shown next to the type. */
  size?: string
  /** Alternative text of an image. Defaults to the name. */
  alt?: string
  /** The content of a text file, shown as is. */
  text?: string
}

/** What `renderViewer` receives for the shown file. */
export interface FilePreviewViewerContext {
  item: FilePreviewItem
  index: number
  kind: FilePreviewKind
  /** The URL the built-in viewer would load (an object URL for `file`), if any. */
  src: string | undefined
}

/** Draws the viewer for a file, such as a PDF.js page view. Return `undefined` to keep the built-in viewer. */
export type FilePreviewViewerRenderer = (context: FilePreviewViewerContext) => unknown

/** Events fired by {@link FilePreview}, keyed for `addEventListener`. */
export interface FilePreviewEventMap {
  'preview-change': CustomEvent<{ index: number; item: FilePreviewItem }>
  close: Event
}

export interface FilePreview {
  addEventListener: TypedAddEventListener<FilePreview, FilePreviewEventMap>
  removeEventListener: TypedRemoveEventListener<FilePreview, FilePreviewEventMap>
}

// A Map, not an object: a name like `x.constructor` must not find `Object.prototype`.
const KINDS = new Map<string, FilePreviewKind>()
const kindsOf = (kind: FilePreviewKind, words: string) => words.split(' ').forEach((word) => KINDS.set(word, kind))
kindsOf('image', 'image png jpg jpeg gif webp avif svg bmp ico')
kindsOf('video', 'video mp4 m4v mov webm ogv')
kindsOf('audio', 'audio mp3 wav oga ogg m4a flac aac opus weba')
kindsOf('pdf', 'pdf')
kindsOf('text', 'text txt md markdown csv tsv json log xml yml yaml vtt srt ini toml ts tsx js jsx mjs css scss html htm py sql sh')

/** Longest text shown, in characters (bytes for a `file`). */
const TEXT_LIMIT = 256 * 1024
const ZOOM_STEP = 1.25
const ZOOM_MAX = 8

const extension = (path: string | undefined) => /\.([a-z0-9]+)$/i.exec(path?.split(/[?#]/)[0] ?? '')?.[1].toLowerCase()

function mimeKind(mime: string | undefined): FilePreviewKind | undefined {
  const type = mime?.toLowerCase().split(';')[0].trim()
  if (!type?.includes('/')) return undefined
  const [major, minor] = type.split('/')
  if (major === 'image' || major === 'video' || major === 'audio') return major
  if (minor === 'pdf') return 'pdf'
  if (major === 'text' || /(^|\+)(json|xml|yaml)$/.test(minor)) return 'text'
  return undefined
}

/** How `c2-file-preview` shows an item: text when it has `text`, else from its MIME type, its type word, then the extension of its name or URL. */
export function filePreviewKind(item: FilePreviewItem): FilePreviewKind {
  if (item.text !== undefined) return 'text'
  return (
    mimeKind(item.type) ??
    mimeKind(item.file?.type) ??
    KINDS.get(item.type?.toLowerCase().trim() ?? '') ??
    KINDS.get(extension(item.name) ?? '') ??
    KINDS.get(extension(item.src) ?? '') ??
    'file'
  )
}

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'blob:', 'data:'])

/** The URL when its scheme is one a viewer may load (never `javascript:`), resolved against the page. */
function safeUrl(src: string | undefined): URL | undefined {
  if (!src) return undefined
  try {
    // The server has no page to resolve against; any base gives the same scheme.
    const url = new URL(src, isServer ? 'http://localhost/' : document.baseURI)
    return SAFE_PROTOCOLS.has(url.protocol) ? url : undefined
  } catch {
    return undefined
  }
}

/** A URL the preview may read itself: the page's own origin, or a `data:` URL. Never another site. */
const readable = (url: URL) => url.protocol === 'data:' || url.origin === location.origin

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

const icon = (path: string) => html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d=${path} /></svg>`

/**
 * Previews a file by type in one frame: an image with zoom, a video, an audio track, a PDF in the browser's own
 * viewer, a text file, or a download for anything else, with a header and previous/next across a set of files.
 * `c2-attachment` opens it in a dialog from its `preview` attribute; it can also sit in a page, or open as a dialog
 * of its own with `modal` and `showModal()`.
 *
 * Nothing in a file is ever run: text is shown as text, and a PDF from another site is framed in a sandbox with
 * scripts off (some browsers then show no PDF; pass the content as `file` to preview it anywhere). The preview reads a
 * URL itself only on the page's own origin.
 *
 * @tag c2-file-preview
 *
 * @slot actions - Commands of the app, shown in the header before the download link.
 * @csspart frame - The preview frame, header and viewer.
 * @csspart header - Header with the file name, metadata, counter and toolbar.
 * @csspart toolbar - Header controls: zoom, the `actions` slot, download and close.
 * @csspart actions - Wrapper of the `actions` slot.
 * @csspart viewer - Region that shows the file.
 * @csspart dialog - The dialog, when opened with `showModal()`.
 *
 * @event {CustomEvent<{ index: number; item: FilePreviewItem }>} preview-change - Fired when the reader moves to another file.
 * @event {Event} close - Fired when the dialog closes.
 *
 * @cssproperty {pixel} [--c2-file-preview--height=480px] - Height of the inline preview.
 * @cssproperty {color} [--c2-file-preview--background=#ffffff]
 * @cssproperty {color} [--c2-file-preview--color=#18181b]
 * @cssproperty {border} [--c2-file-preview--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-file-preview--border-radius=14px]
 * @cssproperty {padding} [--c2-file-preview__header--padding=8px 12px]
 * @cssproperty {border} [--c2-file-preview__header--border=1px solid #e4e4e7] - Line under the header.
 * @cssproperty {font-size} [--c2-file-preview__title--font-size=14px]
 * @cssproperty {font-weight} [--c2-file-preview__title--font-weight=600]
 * @cssproperty {color} [--c2-file-preview__metadata--color=#71717a]
 * @cssproperty {font-size} [--c2-file-preview__metadata--font-size=12px]
 * @cssproperty {color} [--c2-file-preview__viewer--background=#f4f4f5]
 * @cssproperty {padding} [--c2-file-preview__viewer--padding=16px]
 * @cssproperty {font-family} [--c2-file-preview__text--font-family=ui-monospace, SFMono-Regular, Menlo, monospace]
 * @cssproperty {font-size} [--c2-file-preview__text--font-size=12px]
 * @cssproperty {color} [--c2-file-preview__text--background=#ffffff]
 * @cssproperty {color} [--c2-file-preview__message--color=#71717a] - Loading, empty, error and no-preview text.
 * @cssproperty {pixel} [--c2-file-preview__action--size=32px]
 * @cssproperty {color} [--c2-file-preview__action--color=#71717a]
 * @cssproperty {color} [--c2-file-preview__action__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-file-preview__action__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-file-preview__nav--size=36px] - Previous and next buttons.
 * @cssproperty {color} [--c2-file-preview__nav--background=#ffffff]
 * @cssproperty {color} [--c2-file-preview__nav--color=#18181b]
 * @cssproperty {box-shadow} [--c2-file-preview__nav--box-shadow=0 1px 3px rgba(0, 0, 0, 0.2)]
 * @cssproperty {pixel} [--c2-file-preview__dialog--width=min(1080px, calc(100vw - 32px))]
 * @cssproperty {pixel} [--c2-file-preview__dialog--height=min(800px, calc(100dvh - 32px))]
 * @cssproperty {color} [--c2-file-preview__backdrop--background=rgba(24, 24, 27, 0.6)]
 */
@customElement('c2-file-preview')
export class FilePreview extends LitElement {
  static override styles = unsafeCSS(styles)
  private readonly msg = new LocalizeController(this, filePreviewMessages)

  /** The files to preview, as JSON in markup. Wins over `src`. */
  @property({ converter: jsonPropertyConverter }) items: FilePreviewItem[] = []

  /** Position of the shown file in `items`. */
  @property({ type: Number }) index = 0

  /** URL of a single file, when `items` is empty. */
  @property() src: string | undefined = undefined

  /** Name of the single file given by `src`. */
  @property() name = ''

  /** MIME type or type word of the single file given by `src`. */
  @property() type: string | undefined = undefined

  /** Size of the single file given by `src`. */
  @property() size: string | undefined = undefined

  /** Renders in a dialog, shown by `showModal()`, instead of in the page. */
  @property({ type: Boolean }) modal = false

  /** Draws the viewer of a file in place of the built-in one, for example PDF.js for PDFs. */
  @property({ attribute: false }) renderViewer?: FilePreviewViewerRenderer

  @state() private zoom = 1
  @state() private status: LoadStatus = 'idle'
  @state() private text = ''
  @state() private truncated = false
  /** URL of a PDF this preview read and retyped itself, which the browser shows without a sandbox. */
  @state() private ownPdf: string | undefined = undefined

  private readonly urls = new Map<Blob, string>()
  private natural = { width: 0, height: 0 }
  private loadToken = 0
  private releaseScroll?: () => void
  private stale = false
  private drag?: { x: number; y: number; left: number; top: number }

  /** The files shown: `items`, else the single file of `src`. */
  private files: FilePreviewItem[] = []
  /** The file the viewer state (zoom, text, PDF) belongs to. */
  private shown?: FilePreviewItem

  private get position() {
    return Math.min(Math.max(0, Math.trunc(Number(this.index) || 0)), Math.max(0, this.files.length - 1))
  }

  private get current(): FilePreviewItem | undefined {
    return this.files[this.position]
  }

  /** Shows the next file. */
  next() {
    this.go(1)
  }

  /** Shows the previous file. */
  previous() {
    this.go(-1)
  }

  /** Opens the preview as a modal dialog. */
  async showModal() {
    this.modal = true
    await this.updateComplete
    const dialog = this.renderRoot.querySelector('dialog')
    if (!dialog || dialog.open) return
    dialog.showModal()
    this.releaseScroll ??= lockPageScroll()
  }

  /** Closes the dialog. */
  close() {
    this.renderRoot.querySelector('dialog')?.close()
  }

  zoomIn() {
    this.setZoom(this.zoom * ZOOM_STEP)
  }

  zoomOut() {
    this.setZoom(this.zoom / ZOOM_STEP)
  }

  /** Fits the image to the viewer again. */
  resetZoom() {
    this.setZoom(1)
  }

  override connectedCallback() {
    super.connectedCallback()
    // Moved in the DOM: the object URLs were revoked when it left.
    if (this.hasUpdated) {
      this.stale = true
      this.requestUpdate()
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.loadToken++
    this.releaseScroll?.()
    this.releaseScroll = undefined
    for (const url of this.urls.values()) URL.revokeObjectURL(url)
    this.urls.clear()
    this.setOwnPdf(undefined)
  }

  override willUpdate(changed: PropertyValues<this>) {
    // Drawn inline again while open: the dialog goes without a `close`, so hand the page its scroll back here.
    if (changed.has('modal') && !this.modal && this.releaseScroll) {
      this.releaseScroll()
      this.releaseScroll = undefined
    }
    if (changed.has('items') || changed.has('src') || changed.has('name') || changed.has('type') || changed.has('size')) {
      this.files =
        Array.isArray(this.items) && this.items.length
          ? this.items
          : this.src || this.name
            ? [{ name: this.name, src: this.src, type: this.type, size: this.size }]
            : []
      // Revoke the object URLs of files that left the set.
      const kept = new Set(this.files.map((file) => file.file))
      for (const [blob, url] of this.urls) {
        if (!kept.has(blob)) {
          URL.revokeObjectURL(url)
          this.urls.delete(blob)
        }
      }
    }
    const item = this.current
    if (item === this.shown && !this.stale) return
    this.stale = false
    this.shown = item
    this.zoom = 1
    this.natural = { width: 0, height: 0 }
    this.text = ''
    this.truncated = false
    this.setOwnPdf(undefined)
    const token = ++this.loadToken
    if (!item) {
      this.status = 'idle'
      return
    }
    const kind = filePreviewKind(item)
    if (kind === 'text' || (kind === 'pdf' && !item.file)) {
      this.status = 'loading'
      if (!isServer) void this.load(item, kind, token)
    } else {
      this.status = 'ready'
    }
  }

  private async load(item: FilePreviewItem, kind: FilePreviewKind, token: number) {
    try {
      if (kind === 'pdf') {
        const url = safeUrl(item.src)
        // Only a PDF of this origin is read and retyped; another site's is framed in a sandbox as it is.
        if (url && readable(url) && url.protocol !== 'data:') {
          const blob = await (await this.fetchOwn(url)).blob()
          if (token !== this.loadToken) return
          this.setOwnPdf(URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })))
        }
        if (token === this.loadToken) this.status = 'ready'
        return
      }
      let text: string
      let more = false
      if (item.text !== undefined) {
        text = String(item.text)
      } else if (item.file) {
        more = item.file.size > TEXT_LIMIT
        text = await item.file.slice(0, TEXT_LIMIT).text()
      } else {
        const url = safeUrl(item.src)
        if (!url || !readable(url)) throw new Error('unreadable')
        text = await (await this.fetchOwn(url)).text()
      }
      if (token !== this.loadToken) return
      this.truncated = more || text.length > TEXT_LIMIT
      this.text = text.slice(0, TEXT_LIMIT)
      this.status = 'ready'
    } catch {
      if (token === this.loadToken) this.status = 'error'
    }
  }

  /** Reads a URL of this origin; `same-origin` mode also refuses a redirect to another site. */
  private async fetchOwn(url: URL) {
    const response = await fetch(url, { mode: 'same-origin', credentials: 'same-origin' })
    if (!response.ok) throw new Error(String(response.status))
    return response
  }

  private setOwnPdf(url: string | undefined) {
    if (this.ownPdf) URL.revokeObjectURL(this.ownPdf)
    this.ownPdf = url
  }

  /** The URL a viewer loads: an object URL for `file` (a PDF retyped so the browser can only show it as a PDF), else a safe `src`. */
  private sourceOf(item: FilePreviewItem, kind: FilePreviewKind): string | undefined {
    if (item.file) {
      let url = this.urls.get(item.file)
      if (!url) {
        // A PDF is retyped so the browser can only show it as one; a file no viewer draws (text, anything else) is
        // only ever downloaded, as bytes, so its link cannot open as a page of this origin.
        const type = kind === 'pdf' ? 'application/pdf' : kind === 'text' || kind === 'file' ? 'application/octet-stream' : undefined
        url = URL.createObjectURL(type ? new Blob([item.file], { type }) : item.file)
        this.urls.set(item.file, url)
      }
      return url
    }
    // As written, so a server render and the browser's agree; the browser resolves it exactly as `safeUrl` did.
    return safeUrl(item.src) ? item.src : undefined
  }

  private go(step: number) {
    const target = this.position + step
    if (target < 0 || target >= this.files.length) return
    this.index = target
    this.dispatchEvent(new CustomEvent('preview-change', { detail: { index: target, item: this.files[target] } }))
  }

  private get stage() {
    return this.renderRoot.querySelector<HTMLElement>('.stage')
  }

  private async setZoom(zoom: number) {
    const stage = this.stage
    const next = Math.min(ZOOM_MAX, Math.max(1, zoom))
    if (!stage || next === this.zoom) return
    const ratio = next / this.zoom
    const centerX = stage.scrollLeft + stage.clientWidth / 2
    const centerY = stage.scrollTop + stage.clientHeight / 2
    this.zoom = next
    await this.updateComplete
    // Keep the point at the centre of the viewer where it was.
    stage.scrollLeft = centerX * ratio - stage.clientWidth / 2
    stage.scrollTop = centerY * ratio - stage.clientHeight / 2
  }

  private readonly handleImageLoad = (event: Event) => {
    const image = event.target as HTMLImageElement
    this.natural = { width: image.naturalWidth, height: image.naturalHeight }
  }

  private readonly handleMediaError = () => {
    this.status = 'error'
  }

  private readonly handleKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.composedPath()[0] as HTMLElement
    // A field (in the actions slot, in a custom viewer) keeps every key.
    if (target.isContentEditable || target.closest?.('input, textarea, select')) return
    // The viewer's content (media controls, the text, a zoomed image, a custom viewer) uses the arrow keys itself.
    const owned = target.closest?.('.viewer') && !target.closest('.nav') && !(this.zoom === 1 && target.classList.contains('stage'))
    const zoomable = !!this.current && filePreviewKind(this.current) === 'image' && !this.renderViewer
    const rtl = this.matches(':dir(rtl)')
    if (!owned && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      this.go((event.key === 'ArrowRight') !== rtl ? 1 : -1)
    } else if (zoomable && (event.key === '+' || event.key === '=')) {
      this.zoomIn()
    } else if (zoomable && event.key === '-') {
      this.zoomOut()
    } else if (zoomable && event.key === '0') {
      this.resetZoom()
    } else {
      return
    }
    event.preventDefault()
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    const stage = this.stage
    if (!stage || this.zoom === 1 || event.pointerType !== 'mouse' || event.button !== 0) return
    stage.setPointerCapture(event.pointerId)
    this.drag = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop }
    event.preventDefault()
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    const stage = this.stage
    if (!stage || !this.drag) return
    stage.scrollLeft = this.drag.left - (event.clientX - this.drag.x)
    stage.scrollTop = this.drag.top - (event.clientY - this.drag.y)
  }

  private readonly handlePointerUp = () => {
    this.drag = undefined
  }

  private readonly handleDialogClose = () => {
    this.releaseScroll?.()
    this.releaseScroll = undefined
    // The dialog only hides: a playing video must not go on behind it.
    for (const media of this.renderRoot.querySelectorAll<HTMLMediaElement>('video, audio')) media.pause()
    this.dispatchEvent(new Event('close'))
  }

  private message(key: 'loading' | 'unsupported' | 'error' | 'empty', download?: unknown) {
    return html`<div class="message" role=${key === 'error' ? 'alert' : nothing}>${this.msg.t(key)}${download ?? nothing}</div>`
  }

  private renderImage(item: FilePreviewItem, src: string) {
    let size = {}
    const stage = this.stage
    if (this.zoom > 1 && stage && this.natural.width) {
      const fit = Math.min(1, stage.clientWidth / this.natural.width, stage.clientHeight / this.natural.height)
      size = { width: `${Math.round(this.natural.width * fit * this.zoom)}px`, height: `${Math.round(this.natural.height * fit * this.zoom)}px` }
    }
    return html`<div
      class=${classMap({ stage: true, zoomed: this.zoom > 1 })}
      role="group"
      aria-label=${item.name}
      tabindex="0"
      @pointerdown=${this.handlePointerDown}
      @pointermove=${this.handlePointerMove}
      @pointerup=${this.handlePointerUp}
      @pointercancel=${this.handlePointerUp}
    >
      <img src=${src} alt=${item.alt ?? item.name} style=${styleMap(size)} draggable="false" @load=${this.handleImageLoad} @error=${this.handleMediaError} />
    </div>`
  }

  private renderViewerContent(item: FilePreviewItem, kind: FilePreviewKind) {
    const src = kind === 'pdf' && this.ownPdf ? this.ownPdf : this.sourceOf(item, kind)
    const custom = this.renderViewer?.({ item, index: this.position, kind, src })
    if (custom !== undefined) return custom
    if (this.status === 'error') return this.message('error', this.renderDownload(item, kind, true))
    if (this.status === 'loading') return this.message('loading')
    switch (kind) {
      case 'image':
        return src ? this.renderImage(item, src) : this.message('error')
      case 'video':
        return src ? html`<video src=${src} controls preload="metadata" @error=${this.handleMediaError}></video>` : this.message('error')
      case 'audio':
        return src ? html`<audio src=${src} controls preload="metadata" @error=${this.handleMediaError}></audio>` : this.message('error')
      case 'pdf': {
        if (!src) return this.message('error')
        // The browser shows a PDF it was handed as one (a `file`, or a same-origin PDF retyped) only unsandboxed, and
        // such a blob cannot be anything else. Any other URL might serve HTML, so it gets an opaque origin, no scripts.
        const own = !!item.file || src === this.ownPdf
        return own
          ? html`<iframe src=${src} title=${item.name}></iframe>`
          : html`<iframe src=${src} title=${item.name} sandbox referrerpolicy="no-referrer"></iframe>`
      }
      case 'text':
        return html`<pre tabindex="0" role="region" aria-label=${item.name}>${this.text}</pre>
          ${this.truncated ? html`<div class="note">${this.msg.t('truncated')}</div>` : nothing}`
      default:
        return this.message('unsupported', this.renderDownload(item, kind, true))
    }
  }

  private renderDownload(item: FilePreviewItem, kind: FilePreviewKind, labelled = false) {
    const href = this.sourceOf(item, kind)
    if (!href) return nothing
    const label = this.msg.t('download', item.name)
    return html`<a
      class=${labelled ? 'download labelled' : 'download'}
      href=${href}
      download=${item.name}
      target="_blank"
      rel="noopener noreferrer"
      aria-label=${labelled ? nothing : label}
      >${icon('M12 4v11m-5-5 5 5 5-5M5 20h14')}${labelled ? html`<span>${label}</span>` : nothing}</a
    >`
  }

  private renderFrame() {
    const item = this.current
    const total = this.files.length
    if (!item) {
      return html`<div part="frame" class="frame">
        ${
          this.modal
            ? html`<header part="header" class="header">
                <div class="heading"></div>
                ${this.renderClose()}
              </header>`
            : nothing
        }
        <div part="viewer" class="viewer">${this.message('empty')}</div>
      </div>`
    }
    const kind = filePreviewKind(item)
    const position = this.position
    const percent = new Intl.NumberFormat(this.msg.locale, { style: 'percent', maximumFractionDigits: 0 }).format(this.zoom)
    return html`<section part="frame" class="frame" aria-label=${this.msg.t('label', item.name)} @keydown=${this.handleKeydown}>
      <header part="header" class="header">
        <div class="heading" aria-live="polite">
          <span class="title">${item.name}</span>
          <span class="metadata"
            >${this.msg.t(kind)}${item.size ? ` · ${item.size}` : nothing}${total > 1 ? html` · <span class="counter">${this.msg.t('counter', position + 1, total)}</span>` : nothing}</span
          >
        </div>
        <div part="toolbar" class="toolbar">
          ${
            kind === 'image' && !this.renderViewer
              ? html`<button type="button" aria-label=${this.msg.t('zoomOut')} ?disabled=${this.zoom <= 1} @click=${this.zoomOut}>${icon('M5 12h14')}</button>
                  <span class="zoom">${percent}</span>
                  <button type="button" aria-label=${this.msg.t('zoomIn')} ?disabled=${this.zoom >= ZOOM_MAX} @click=${this.zoomIn}>
                    ${icon('M12 5v14M5 12h14')}
                  </button>
                  <button type="button" aria-label=${this.msg.t('fit')} ?disabled=${this.zoom <= 1} @click=${this.resetZoom}>
                    ${icon('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')}
                  </button>`
              : nothing
          }
          <div part="actions" class="actions"><slot name="actions"></slot></div>
          ${this.renderDownload(item, kind)} ${this.modal ? this.renderClose() : nothing}
        </div>
      </header>
      <div part="viewer" class=${`viewer ${kind}`}>
        ${this.renderViewerContent(item, kind)}
        ${
          total > 1
            ? html`<button
                  type="button"
                  class="nav previous"
                  aria-label=${this.msg.t('previous')}
                  aria-disabled=${position === 0 ? 'true' : 'false'}
                  @click=${this.previous}
                >
                  ${icon('m15 18-6-6 6-6')}
                </button>
                <button
                  type="button"
                  class="nav next"
                  aria-label=${this.msg.t('next')}
                  aria-disabled=${position === total - 1 ? 'true' : 'false'}
                  @click=${this.next}
                >
                  ${icon('m9 18 6-6-6-6')}
                </button>`
            : nothing
        }
      </div>
    </section>`
  }

  private renderClose() {
    return html`<button type="button" class="close" aria-label=${this.msg.t('close')} autofocus @click=${this.close}>${icon('M18 6 6 18M6 6l12 12')}</button>`
  }

  override render() {
    if (!this.modal) return this.renderFrame()
    const name = this.current?.name
    return html`<dialog part="dialog" class="dialog" aria-label=${name ? this.msg.t('label', name) : nothing} closedby="any" @close=${this.handleDialogClose}>
      ${this.renderFrame()}
    </dialog>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-file-preview': FilePreview
  }
}
