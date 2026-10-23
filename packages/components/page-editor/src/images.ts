import type { Node as ProseNode, NodeType } from 'prosemirror-model'
import { NodeSelection, Plugin, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state'
import type { EditorView, NodeView } from 'prosemirror-view'
import { ImageBlock, type ImageBlockText } from '@c2n/core/image-block.js'
import {
  copyImage,
  dataUrlToBlob,
  imageToMarkdown,
  isDataUrl,
  pendingImages,
  readAsDataUrl,
  stepImageWidth,
  type EditorImageAttrs,
  type ImageResolver,
  type ImageUploader,
} from '@c2n/core/image-helper.js'

/*
 * Image blocks in a ProseMirror page: their node view, saving pasted and dropped images, copying one out, and
 * resizing one from the keyboard. Kept the same in c2-notepad's images.ts: everything schema-specific comes in as
 * the image and line node types.
 */

/** What the editor gives its images. */
export interface ImageHost {
  readonly image: NodeType
  /** The empty line put after images that end the page or come before a block the caret cannot enter. */
  readonly line: NodeType
  uploader(): ImageUploader | null
  resolver(): ImageResolver | null
  text(): ImageBlockText
  /** The widest an image may be: the text column. */
  maxWidth(): number
  /** The ruled line height an image's block rounds up to, on paper. */
  lineHeight?(): number
  /** Whether images may be added: editable, and allowed. */
  accepts(): boolean
  /** A pasted or dropped image could not be saved. */
  failed(error: unknown): void
}

const attrsOf = (node: ProseNode): EditorImageAttrs => ({
  src: node.attrs.src as string,
  alt: node.attrs.alt as string,
  width: (node.attrs.width as number | null) ?? null,
})
const previewOf = (node: ProseNode) => (node.attrs.pending ? pendingImages.preview(node.attrs.pending as string) : '')

const imageViews = new WeakMap<Node, ImageView>()

export class ImageView implements NodeView {
  readonly dom: HTMLElement
  private readonly block: ImageBlock

  constructor(
    private node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    host: ImageHost,
  ) {
    this.block = new ImageBlock(
      attrsOf(node),
      {
        resolve: () => host.resolver(),
        text: () => host.text(),
        maxWidth: () => host.maxWidth(),
        lineHeight: host.lineHeight ? () => host.lineHeight!() : undefined,
        onResize: (width) => this.setWidth(width),
      },
      previewOf(node),
    )
    this.dom = this.block.dom
    imageViews.set(this.dom, this)
    this.refresh()
  }

  /** The URL the image is drawn from, empty while it is being saved or cannot be drawn. */
  get url() {
    return this.block.drawnUrl
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.block.update(attrsOf(node), previewOf(node))
    return true
  }

  selectNode() {
    this.block.setSelected(true)
  }

  deselectNode() {
    this.block.setSelected(false)
  }

  localize() {
    this.block.localize()
  }

  /** The application's resolver changed: draw the image through the new one. */
  reload() {
    this.block.reload()
  }

  /** Re-reads whether the page is editable: the handle only shows on an editable page. */
  refresh() {
    this.block.setEditable(this.view.editable)
  }

  // The handle's pointer events are its own: ProseMirror would start dragging the block.
  stopEvent(event: Event) {
    return !!(event.target as Element | null)?.closest?.('.image-handle')
  }

  ignoreMutation() {
    return true
  }

  destroy() {
    this.block.destroy()
  }

  private setWidth(width: number) {
    const pos = this.getPos()
    if (pos === undefined) return
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, width: width || null }))
  }
}

/** The image view drawn at a node's DOM. */
export const imageViewOf = (dom: Node | null | undefined) => (dom ? imageViews.get(dom) : undefined)

/** Gives every image still marked `id` its saved `src`; not undoable on its own (the paste is). */
function markSaved(state: EditorState, host: ImageHost, id: string, src: string | null): Transaction | null {
  let tr: Transaction | null = null
  state.doc.forEach((node, pos) => {
    if (node.type !== host.image || node.attrs.pending !== id) return
    tr ??= state.tr
    if (src) tr.setNodeMarkup(pos, undefined, { ...node.attrs, src, pending: null })
    else {
      // With the empty line it was given at the end of the page, so the failed paste leaves the page as it was.
      const after = state.doc.childAfter(pos + node.nodeSize).node
      const line = pos > 0 && after === state.doc.lastChild && after?.type === host.line && !after.content.size
      tr.delete(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize + (line ? after.nodeSize : 0)))
    }
  })
  return tr && (tr as Transaction).setMeta('addToHistory', false)
}

/** An image an undo took out before its upload ended and a redo put back: it takes its saved `src`. */
export function savedImages(image: NodeType) {
  return new Plugin({
    appendTransaction(transactions, _old, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null
      let tr: Transaction | null = null
      state.doc.forEach((node, pos) => {
        const src = node.type === image && node.attrs.pending ? pendingImages.src(node.attrs.pending as string) : undefined
        if (src) (tr ??= state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, src, pending: null })
      })
      return tr && (tr as Transaction).setMeta('addToHistory', false)
    },
  })
}

/** Uploads each image in turn, in order, and gives the blocks their `src`, or removes a block whose upload failed. */
function save(view: EditorView, host: ImageHost, jobs: { id: string; file: () => Promise<Blob> }[]) {
  void (async () => {
    for (const { id, file } of jobs) {
      let src: string | null = null
      try {
        src = await (host.uploader() ?? readAsDataUrl)(await file())
        if (!src) throw new Error('The image upload gave no src')
        pendingImages.finish(id, src)
      } catch (error) {
        pendingImages.fail(id)
        host.failed(error)
      }
      if (view.isDestroyed) continue
      const tr = markSaved(view.state, host, id, src)
      if (tr) view.dispatch(tr)
    }
  })()
}

/**
 * Inserts image files as blocks, each drawn from a local preview while its upload runs: at `at` (a drop), else at the
 * selection, in place of the empty line the caret is on or after its block. The caret ends on a line after them.
 */
export function insertImages(view: EditorView, host: ImageHost, files: Blob[], at?: number): boolean {
  if (!files.length || !host.accepts()) return false
  const jobs = files.map((file) => ({ id: pendingImages.begin(file), file: () => Promise.resolve(file) }))
  const nodes = jobs.map(({ id }) => host.image.create({ pending: id }))
  const size = nodes.reduce((total, node) => total + node.nodeSize, 0)
  const { state } = view
  const $at = at === undefined ? state.selection.$from : state.doc.resolve(at)
  const tr = state.tr
  const block = $at.depth ? $at.node(1) : null
  let pos: number
  if (at === undefined && block?.isTextblock && block.content.size === 0) {
    pos = $at.before(1)
    tr.insert(pos, nodes)
  } else {
    pos = !$at.depth ? $at.pos : $at.parentOffset === 0 && $at.depth === 1 ? $at.before(1) : $at.after(1)
    tr.insert(pos, nodes)
    const next = tr.doc.resolve(pos + size).nodeAfter
    if (!next?.isTextblock || next.type.spec.code) tr.insert(pos + size, host.line.create())
  }
  tr.setSelection(TextSelection.create(tr.doc, pos + size + 1))
  view.dispatch(tr.scrollIntoView())
  save(view, host, jobs)
  return true
}

/**
 * Pasted images held in the HTML as data URLs (copied from another application) are saved like pasted files, when
 * there is an uploader: the page keeps the uploader's `src`, not the image in its text.
 */
export function adoptPastedImages(view: EditorView, host: ImageHost, nodes: readonly ProseNode[]): ProseNode[] {
  if (!host.uploader()) return [...nodes]
  const jobs: { id: string; file: () => Promise<Blob> }[] = []
  const adopted = nodes.map((node) => {
    const src = node.attrs.src as string
    if (node.type !== host.image || !isDataUrl(src)) return node
    const id = pendingImages.begin(src)
    jobs.push({ id, file: () => dataUrlToBlob(src) })
    return host.image.create({ ...node.attrs, src: '', pending: id })
  })
  // Once the paste has gone in, and only for the images that did: a paste the editor handles otherwise (the image file
  // beside the same image in the HTML) drops this slice, and its images are not uploaded.
  if (jobs.length)
    queueMicrotask(() => {
      const inserted = new Set<string>()
      view.state.doc.forEach((node) => {
        if (node.type === host.image && node.attrs.pending) inserted.add(node.attrs.pending as string)
      })
      for (const job of jobs) if (!inserted.has(job.id)) pendingImages.fail(job.id)
      save(
        view,
        host,
        jobs.filter((job) => inserted.has(job.id)),
      )
    })
  return adopted
}

/** The image selected as a block, with where it is. */
function selectedImage(state: EditorState, image: NodeType) {
  const { selection } = state
  return selection instanceof NodeSelection && selection.node.type === image ? { node: selection.node, pos: selection.from } : null
}

/**
 * Copy (or cut) with an image selected puts the image itself on the clipboard, as a PNG, with HTML that brings the
 * same image back when it is pasted into an editor. Returns false to leave the copy to ProseMirror (no image
 * selected, one not drawn yet, or no clipboard API).
 */
export function copySelectedImage(view: EditorView, image: NodeType, event: ClipboardEvent, cut: boolean): boolean {
  const selected = selectedImage(view.state, image)
  const url = selected && imageViewOf(view.nodeDOM(selected.pos))?.url
  if (!selected || !url || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false
  event.preventDefault()
  const attrs = attrsOf(selected.node)
  const markdown = imageToMarkdown(attrs)
  const copied = copyImage(url, attrs, markdown)
    .then(() => true)
    .catch(() =>
      navigator.clipboard.writeText(markdown).then(
        () => true,
        () => false,
      ),
    )
  // Cut takes the image out once it is on the clipboard, not before: a refused copy leaves it where it was.
  if (cut && view.editable)
    void copied.then((ok) => {
      if (!ok || view.isDestroyed) return
      let at = -1
      view.state.doc.forEach((node, pos) => {
        if (node === selected.node) at = pos
      })
      if (at >= 0) view.dispatch(view.state.tr.delete(at, at + selected.node.nodeSize).scrollIntoView())
    })
  return true
}

/** Alt+ArrowLeft and Alt+ArrowRight narrow and widen a selected image by a tenth of the text column. */
export function resizeSelectedImage(host: ImageHost, direction: 1 | -1): Command {
  return (state, dispatch, view) => {
    const selected = selectedImage(state, host.image)
    if (!selected || !view?.editable) return false
    const drawn = (view.nodeDOM(selected.pos) as HTMLElement | null)?.querySelector('img')?.getBoundingClientRect().width ?? 0
    const max = host.maxWidth()
    const current = (selected.node.attrs.width as number | null) ?? (drawn || max)
    const width = stepImageWidth(current, max, direction)
    if (width !== current && dispatch) dispatch(state.tr.setNodeMarkup(selected.pos, undefined, { ...selected.node.attrs, width }))
    return true
  }
}
