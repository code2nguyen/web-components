/**
 * Images in the text editors (`c2-notepad`, `c2-page-editor`): what is not ProseMirror's business — reading image
 * files off a paste or a drop, the Markdown line an image is stored as, putting an image on the clipboard, and
 * resizing one by a handle.
 *
 * An editor stores an image as its `src`, which the application chooses: `imageUpload` turns a pasted or dropped
 * file into it (a data URL when there is no uploader), and `imageResolver` turns it back into a URL the browser can
 * draw (the `src` itself when there is no resolver). An application can so keep images out of the text: an id in the
 * Markdown, the bytes in its own store.
 */

/** Saves a pasted, dropped or cropped image and returns the `src` the editor stores for it. */
export type ImageUploader = (file: Blob) => Promise<string>

/** Turns a stored `src` into a URL to draw; an empty string or a rejection draws the "not available" placeholder. */
export type ImageResolver = (src: string) => string | Promise<string>

/** An image block: what it shows, its text alternative, and the width it was resized to (natural when `null`). */
export interface EditorImageAttrs {
  src: string
  alt: string
  width: number | null
}

/** Narrowest an image can be resized to, in CSS pixels. */
export const MIN_IMAGE_WIDTH = 48

/** The image files of a paste or a drop, in order. */
export function imageFiles(data: DataTransfer | null | undefined): File[] {
  if (!data) return []
  const files = Array.from(data.files ?? []).filter((file) => file.type.startsWith('image/'))
  if (files.length) return files
  // Some sources (a screenshot tool, a copied image) put the image in the items but not in `files`.
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file)
}

/**
 * Whether pasted HTML is only images: a browser's "Copy image" puts an `<img>` beside the image file, and the file is
 * the one to keep; a document copied with its pictures has text, and is pasted as such.
 */
export function isOnlyImages(html: string): boolean {
  return readPastedHtml(html).onlyImages
}

/**
 * What a paste's HTML holds, read once: whether it is only images (`isOnlyImages`), and whether one of them was copied
 * in this application (`hasOwnImage`), to bring back as the same stored image.
 */
export function readPastedHtml(html: string): { onlyImages: boolean; ownImage: boolean } {
  if (!html.trim()) return { onlyImages: true, ownImage: false }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const images = Array.from(doc.body.querySelectorAll('img'))
  return {
    onlyImages: images.length > 0 && !doc.body.textContent?.trim(),
    ownImage: html.includes('data-c2-image-src') && images.some((image) => ownImageSrc(image) !== null),
  }
}

/** The stored form when there is no uploader: the image itself, as a data URL. */
export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new DOMException('The image could not be read', 'NotReadableError'))
    reader.readAsDataURL(file)
  })
}

/** A `data:` URL's bytes, to upload an image pasted as one. */
export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}

/**
 * The stored `src` an editor copied an image with (`data-c2-image-src`), when it was copied in this application (same
 * origin), whose store has it. From elsewhere it is the image itself that is pasted, not an id this store lacks.
 */
export function ownImageSrc(image: Element): string | null {
  const src = image.getAttribute('data-c2-image-src')
  // Every opaque origin (a file: page, a sandboxed frame) reads as "null": two of them are not the same application.
  const origin = image.getAttribute('data-c2-image-origin')
  return src && origin && origin !== 'null' && origin === location.origin ? src : null
}

/** Whether pasted HTML holds an image copied in this application, to bring back as the same stored image. */
export function hasOwnImage(html: string): boolean {
  return readPastedHtml(html).ownImage
}

/**
 * The image an `<img>` of pasted HTML is, or `null` for one not worth a block: an icon or emoji inline in the text
 * (drawn under 48px), or one only the copying application can open (`file:`, `cid:`, `blob:`).
 */
export function imageFromHtml(image: HTMLImageElement): EditorImageAttrs | null {
  const own = ownImageSrc(image)
  const src = own ?? image.getAttribute('src') ?? ''
  if (!own && !/^(data:image\/|https?:)/i.test(src)) return null
  // Its size from its attributes, else its inline style (as mail and chat write an emoji's). Small both ways, or
  // narrow, it is an icon; a wide, short banner is still an image.
  const size = (name: 'width' | 'height') => Number(image.getAttribute(name)) || parseFloat(image.style[name]) || null
  const width = size('width')
  const height = size('height')
  if ((width !== null && width < MIN_IMAGE_WIDTH) || (width === null && height !== null && height < MIN_IMAGE_WIDTH)) return null
  return { src, alt: image.getAttribute('alt') ?? '', width: Number(image.getAttribute('width')) || null }
}

/** Whether a `src` is an image held in the text itself. */
export const isDataUrl = (src: string) => /^data:image\//i.test(src)

// ---- images being saved -------------------------------------------------------------------------------------------

let pendingCount = 0
const previews = new Map<string, string>()
const saved = new Map<string, string>()
/**
 * How many saved data URLs are kept for an undone paste to find on redo: the latest ones, as each can be megabytes. An
 * uploader's `src` (an id, a URL) is small and always kept.
 */
const SAVED_DATA_URLS_KEPT = 20

/**
 * Images pasted or dropped while their upload runs. The editor inserts the block at once, marked with an id and drawn
 * from a local preview, and writes no Markdown for it until the upload gives its `src` (a block undone and redone
 * meanwhile finds it here).
 */
export const pendingImages = {
  /** Starts tracking an image, drawn meanwhile from the file (or the data URL it was pasted as); returns its id. */
  begin(image: Blob | string): string {
    const id = `c2-image-${++pendingCount}`
    previews.set(id, typeof image === 'string' ? image : URL.createObjectURL(image))
    return id
  },
  /** The local URL a pending image is drawn from meanwhile. */
  preview(id: string): string {
    return previews.get(id) ?? ''
  },
  /** The `src` an upload gave, once it has. */
  src(id: string): string | undefined {
    return saved.get(id)
  },
  finish(id: string, src: string) {
    saved.set(id, src)
    if (isDataUrl(src)) {
      const dataUrls = [...saved].filter(([, value]) => isDataUrl(value))
      for (const [oldest] of dataUrls.slice(0, Math.max(0, dataUrls.length - SAVED_DATA_URLS_KEPT))) saved.delete(oldest)
    }
    const preview = previews.get(id)
    previews.delete(id)
    // Left a moment for the saved image to take over the drawing.
    if (preview?.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(preview), 30_000)
  },
  fail(id: string) {
    const preview = previews.get(id)
    previews.delete(id)
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
  },
}

/** Width after one Alt+Arrow step on a selected image: a tenth of the text column, within its bounds. */
export function stepImageWidth(current: number, max: number, direction: 1 | -1): number {
  const step = Math.max(8, Math.round(max / 10))
  return Math.round(Math.min(max, Math.max(MIN_IMAGE_WIDTH, current + direction * step)))
}

// ---- Markdown -------------------------------------------------------------------------------------------------------

/**
 * An image on a line of its own: `![alt](src)`, with the width it was resized to after a bar (`![alt|320](src)`, as
 * Obsidian writes it). A `src` with a space or a parenthesis is written between angle brackets.
 */
const IMAGE_LINE = /^ {0,3}!\[((?:\\.|[^\]\\])*)\]\(\s*(<[^>\n]*>|[^\s()]+)\s*\)\s*$/

export function imageToMarkdown({ src, alt, width }: EditorImageAttrs): string {
  const text = (alt ?? '').replace(/[\\[\]|]/g, (char) => `\\${char}`).replace(/\r?\n/g, ' ')
  const size = width ? `|${Math.round(width)}` : ''
  // In the angle form `<`, `>` and `%` itself are percent-encoded, so a `src` holding `%3C` reads back as it was.
  const target = /[\s()<>]/.test(src) ? `<${src.replace(/[%<>]/g, encodeURIComponent)}>` : src
  return `![${text}${size}](${target})`
}

/** The image a Markdown line is, or `null` when it is anything else. */
export function imageFromMarkdown(line: string): EditorImageAttrs | null {
  const match = IMAGE_LINE.exec(line)
  if (!match) return null
  let [, label, target] = match
  // The angle form, which `imageToMarkdown` writes with `<` and `>` percent-encoded.
  if (target.startsWith('<')) target = target.slice(1, -1).replace(/%3C/gi, '<').replace(/%3E/gi, '>').replace(/%25/g, '%')
  if (!target) return null
  let width: number | null = null
  const size = /^((?:\\.|[^|\\])*)\|(\d{1,5})$/.exec(label)
  if (size) {
    label = size[1]
    width = Math.max(MIN_IMAGE_WIDTH, Number(size[2]))
  }
  return { src: target, alt: label.replace(/\\(.)/g, '$1'), width }
}

// ---- clipboard ------------------------------------------------------------------------------------------------------

/** An image re-encoded as PNG, the one image type every clipboard takes. */
export async function toPngBlob(url: string): Promise<Blob> {
  // Fetched again with CORS, past the cache: the image was drawn without CORS, and a cached answer without its
  // Access-Control headers would taint the canvas. A blob: or data: URL is read as it is.
  const response = await fetch(url, /^https?:/i.test(url) ? { mode: 'cors', cache: 'no-store', credentials: 'omit' } : undefined)
  if (!response.ok) throw new DOMException('The image could not be read', 'NotReadableError')
  const bitmap = await createImageBitmap(await response.blob())
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new DOMException('The image could not be encoded', 'EncodingError'))), 'image/png'),
  )
}

/**
 * Puts an image on the clipboard as a PNG another application pastes, together with HTML that keeps its stored
 * `src` (`data-c2-image-src`), so pasting it back into an editor brings the same image rather than a copy of it.
 * Must be called while handling the copy (the user's gesture); rejects when the clipboard refuses.
 */
export async function copyImage(url: string, attrs: EditorImageAttrs, markdown: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new DOMException('The clipboard takes no images here', 'NotSupportedError')
  const png = toPngBlob(url)
  const html = png.then(async (blob) => {
    const data = await readAsDataUrl(blob)
    const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    const width = attrs.width ? ` width="${Math.round(attrs.width)}"` : ''
    return new Blob(
      [`<img src="${data}" alt="${escape(attrs.alt)}" data-c2-image-src="${escape(attrs.src)}" data-c2-image-origin="${escape(location.origin)}"${width}>`],
      { type: 'text/html' },
    )
  })
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png, 'text/html': html, 'text/plain': new Blob([markdown], { type: 'text/plain' }) })])
}

// ---- resizing -------------------------------------------------------------------------------------------------------

export interface ImageResizeOptions {
  /** The image's width when the drag starts, in CSS pixels. */
  startWidth: () => number
  /** The widest it may grow: the editor's text column. */
  maxWidth: () => number
  /** Every step of the drag, to draw the image at that width. */
  onResize: (width: number) => void
  /** The pointer was released: store the width. Escape, or the browser taking the pointer, calls `onCancel`. */
  onCommit: (width: number) => void
  onCancel: () => void
}

/** Lets a handle on an image's right edge resize it by dragging. Returns the function that detaches it. */
export function attachImageResize(handle: HTMLElement, options: ImageResizeOptions): () => void {
  const clamp = (width: number) => Math.round(Math.min(options.maxWidth(), Math.max(MIN_IMAGE_WIDTH, width)))
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const start = options.startWidth()
    // In a right-to-left page the handle sits on the left edge, and moving left widens the image.
    const direction = getComputedStyle(handle).direction === 'rtl' ? -1 : 1
    let width = start
    let done = false
    handle.setPointerCapture(event.pointerId)
    const move = (moved: PointerEvent) => {
      width = clamp(start + (moved.clientX - startX) * direction)
      options.onResize(width)
    }
    const finish = (commit: boolean) => {
      if (done) return
      done = true
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('lostpointercapture', lost)
      document.removeEventListener('keydown', key, true)
      if (commit && width !== start) options.onCommit(width)
      else options.onCancel()
    }
    const up = () => finish(true)
    const lost = () => finish(false)
    const key = (pressed: KeyboardEvent) => {
      if (pressed.key !== 'Escape') return
      pressed.preventDefault()
      pressed.stopPropagation()
      finish(false)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('lostpointercapture', lost)
    document.addEventListener('keydown', key, true)
  }
  handle.addEventListener('pointerdown', onPointerDown)
  return () => handle.removeEventListener('pointerdown', onPointerDown)
}
