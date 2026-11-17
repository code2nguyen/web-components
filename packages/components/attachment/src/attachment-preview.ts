import { FilePreview } from './file-preview.js'
import type { Attachment } from './attachment.js'

/**
 * The opener behind `c2-attachment`'s `preview`, loaded with the viewer on first use so the attachment itself stays
 * small. Shows `opener`'s file in a `c2-file-preview` dialog placed in `root` (the attachment's shadow root, so
 * `::part(preview)` reaches it), with the enabled previewable attachments of its group as the set, in document order.
 * Removes the dialog and calls `done` when it closes.
 */
export async function openAttachmentPreview(opener: Attachment, root: ParentNode, done: () => void) {
  const group = opener.closest('c2-attachment-group')
  const set = group
    ? [...group.querySelectorAll('c2-attachment')].filter(
        (item) => item === opener || (item.preview && !item.disabled && item.closest('c2-attachment-group') === group),
      )
    : [opener]
  const preview = new FilePreview()
  preview.part.add('preview')
  preview.items = set.map(({ name, href, src, file, type, size, alt }) => ({ name, src: href ?? src, file, type, size, alt }))
  preview.index = set.indexOf(opener)
  preview.addEventListener(
    'close',
    () => {
      preview.remove()
      done()
    },
    { once: true },
  )
  root.append(preview)
  await preview.showModal()
}
