import { attachImageResize, MIN_IMAGE_WIDTH, type EditorImageAttrs, type ImageResolver } from './image-helper.js'

/**
 * The image block of the text editors (`c2-notepad`, `c2-page-editor`), as DOM: the image drawn from its resolved
 * `src`, a handle on its trailing edge that resizes it (the editors show it once the image is clicked, selected),
 * a preview while a pasted image is still being saved, and a placeholder when its `src` cannot be drawn on this
 * device. Each editor wraps it in its ProseMirror node view, styles its classes, and stores what it reports in the
 * node.
 *
 * Classes: `image-block` (`is-selected`, `is-missing`, `is-pending`, `is-resizing`), `image-frame`, `image-handle`,
 * `image-missing`.
 */

export interface ImageBlockText {
  /** The resize handle's tooltip. */
  resize: string
  /** The placeholder of an image that cannot be drawn. */
  missing: string
  /** Read while a pasted image is being saved. */
  saving: string
}

export interface ImageBlockOptions {
  resolve: () => ImageResolver | null | undefined
  text: () => ImageBlockText
  /** The widest the image may be: the editor's text column. */
  maxWidth: () => number
  /** Rounds the block's height up to a multiple of this (a notepad's ruled line), so the lines after it stay on the rules. */
  lineHeight?: () => number
  /** The image was resized: store its new width; 0 is back to its natural size (a double-click on the handle). */
  onResize: (width: number) => void
}

/** Resolved URLs by resolver and `src`, so a block redrawn (an undo, a node replaced) does not ask again. */
const resolved = new WeakMap<ImageResolver, Map<string, Promise<string>>>()

/** A resolved URL that failed to draw (revoked, expired) is asked for again next time. */
function forgetUrl(resolver: ImageResolver | null | undefined, src: string) {
  if (resolver) resolved.get(resolver)?.delete(src)
}

function resolveUrl(resolver: ImageResolver | null | undefined, src: string): Promise<string> {
  if (!resolver) return Promise.resolve(src)
  let cache = resolved.get(resolver)
  if (!cache) resolved.set(resolver, (cache = new Map()))
  let url = cache.get(src)
  if (!url) {
    url = Promise.resolve()
      .then(() => resolver(src))
      .catch(() => '')
    cache.set(src, url)
    // A failure is not remembered: the image may arrive later (synced, restored).
    void url.then((value) => value || cache.delete(src))
  }
  return url
}

export class ImageBlock {
  readonly dom: HTMLElement
  private readonly frame: HTMLElement
  private readonly image: HTMLImageElement
  private readonly handle: HTMLElement
  private readonly missing: HTMLElement
  private readonly detachResize: () => void
  private readonly sizeObserver?: ResizeObserver
  private attrs: EditorImageAttrs
  private preview = ''
  /** The URL the image is drawn from, once resolved; empty while resolving or when it cannot be drawn. */
  private url = ''
  /** Which `src` the last resolution was for, so a late answer for an older one is dropped. */
  private resolving = ''
  /** The `src` the URL being drawn was resolved for, to forget that URL if it fails to load (revoked, expired). */
  private drawnFor = ''

  constructor(
    attrs: EditorImageAttrs,
    private readonly options: ImageBlockOptions,
    preview = '',
  ) {
    this.attrs = attrs
    this.preview = preview
    this.dom = document.createElement('div')
    this.dom.className = 'image-block'
    this.dom.contentEditable = 'false'
    this.frame = document.createElement('div')
    this.frame.className = 'image-frame'
    this.image = document.createElement('img')
    this.image.draggable = false
    this.image.decoding = 'async'
    this.image.addEventListener('load', () => this.dom.classList.remove('is-missing'))
    this.image.addEventListener('error', () => {
      if (this.drawnFor) forgetUrl(this.options.resolve(), this.drawnFor)
      this.showMissing()
    })
    this.missing = document.createElement('div')
    this.missing.className = 'image-missing'
    this.handle = document.createElement('div')
    this.handle.className = 'image-handle'
    this.frame.append(this.image, this.missing, this.handle)
    this.dom.append(this.frame)

    this.detachResize = attachImageResize(this.handle, {
      startWidth: () => this.image.getBoundingClientRect().width,
      maxWidth: () => Math.max(MIN_IMAGE_WIDTH, this.options.maxWidth()),
      onResize: (width) => {
        if (!this.dom.classList.contains('is-resizing')) {
          this.dom.classList.add('is-resizing')
          // The text after the image stays put while it is dragged narrower: it moves once, on release.
          this.frame.style.minHeight = `${this.frame.getBoundingClientRect().height}px`
        }
        this.image.style.width = `${width}px`
      },
      onCommit: (width) => {
        this.endResize()
        this.options.onResize(width)
      },
      onCancel: () => {
        this.endResize()
        this.applyWidth()
      },
    })
    // Back to the natural size.
    this.handle.addEventListener('dblclick', (event) => {
      event.preventDefault()
      if (this.attrs.width) this.options.onResize(0)
    })

    if (options.lineHeight && typeof ResizeObserver !== 'undefined') {
      this.sizeObserver = new ResizeObserver(() => this.snapHeight())
      this.sizeObserver.observe(this.frame)
    }
    this.localize()
    this.load()
  }

  /** The node changed: draw its new `src`, width or text alternative, or the preview of an image still being saved. */
  update(attrs: EditorImageAttrs, preview = '') {
    const srcChanged = attrs.src !== this.attrs.src || preview !== this.preview
    this.attrs = attrs
    this.preview = preview
    if (srcChanged) this.load()
    else {
      this.image.alt = attrs.alt
      this.applyWidth()
    }
  }

  /** Draws the image again, through the resolver as it is now: set after the image was first drawn, it was not used. */
  reload() {
    this.load()
  }

  setSelected(selected: boolean) {
    this.dom.classList.toggle('is-selected', selected)
  }

  setEditable(editable: boolean) {
    this.handle.hidden = !editable
  }

  /** The URL the image is drawn from, or an empty string while it is being saved, resolved, or cannot be drawn. */
  get drawnUrl() {
    return this.url
  }

  localize() {
    const text = this.options.text()
    this.handle.title = text.resize
    this.missing.textContent = this.preview ? text.saving : text.missing
    if (this.preview) this.image.setAttribute('aria-label', text.saving)
    else this.image.removeAttribute('aria-label')
  }

  destroy() {
    this.detachResize()
    this.sizeObserver?.disconnect()
  }

  private load() {
    this.image.alt = this.attrs.alt
    this.applyWidth()
    this.dom.classList.toggle('is-pending', !!this.preview)
    this.localize()
    if (this.preview) {
      this.draw(this.preview)
      return
    }
    const src = this.attrs.src
    this.resolving = src
    this.url = ''
    if (!src) {
      this.showMissing()
      return
    }
    void resolveUrl(this.options.resolve(), src).then((url) => {
      if (this.resolving !== src) return
      if (url) this.draw(url, src)
      else this.showMissing()
    })
  }

  private draw(url: string, src = '') {
    this.drawnFor = src
    this.url = this.preview ? '' : url
    // Drawn without CORS, which most image hosts do not answer; copying it fetches it again with CORS, and falls back
    // to its Markdown when the host refuses.
    if (this.image.src !== url) this.image.src = url
  }

  private showMissing() {
    this.url = ''
    this.dom.classList.add('is-missing')
    this.image.removeAttribute('src')
  }

  private endResize() {
    this.dom.classList.remove('is-resizing')
    this.frame.style.minHeight = ''
  }

  private applyWidth() {
    const width = this.attrs.width
    this.image.style.width = width ? `${width}px` : ''
  }

  private snapHeight() {
    const line = this.options.lineHeight?.() ?? 0
    if (!(line > 0)) return
    const height = this.frame.getBoundingClientRect().height
    this.dom.style.minHeight = `${Math.ceil(height / line) * line}px`
  }
}
