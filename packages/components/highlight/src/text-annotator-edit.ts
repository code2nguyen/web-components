import type { TextAnnotator } from './text-annotator.js'

/** Text offset of a boundary point in the drawn text, tags left out; throws when the point is in another tree. */
function offset(root: Node, node: Node, at: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const probe = document.createRange()
  let offset = 0
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (text.parentElement!.closest('.tag')) continue
    probe.selectNodeContents(text)
    const position = probe.comparePoint(node, at)
    if (position < 0) break
    if (position === 0) return offset + at
    offset += (text as Text).length
  }
  return offset
}

/** Adds a span for the selection, or removes the span with `label` around it. Loaded by `annotate()` on first use. */
export function annotate(host: TextAnnotator, text: string, label: string): boolean {
  const selection = getSelection()
  const root = host.renderRoot as ShadowRoot & { getSelection?: () => Selection | null }
  const wrapper = root.querySelector('[part~="text"]')
  if (!selection?.rangeCount || !wrapper) return false
  let range: AbstractRange
  try {
    // Baseline 2025. Before it, Firefox's getRangeAt already sees into the shadow root and Chromium has getSelection.
    range = selection.getComposedRanges({ shadowRoots: [root] })[0]
  } catch {
    range = (root.getSelection?.() ?? selection).getRangeAt(0)
  }
  let start: number
  let end: number
  try {
    start = offset(wrapper, range.startContainer, range.startOffset)
    end = offset(wrapper, range.endContainer, range.endOffset)
  } catch {
    return false
  }
  while (start < end && /\s/.test(text[start])) start++
  while (end > start && /\s/.test(text[end - 1])) end--
  if (start >= end) return false
  const ranges = host.ranges ?? []
  const around = ranges.findIndex((r) => r.label === label && r.start <= start && r.end >= end)
  host.ranges = around < 0 ? [...ranges, { start, end, label }] : ranges.filter((_, i) => i !== around)
  selection.removeAllRanges()
  host.dispatchEvent(new CustomEvent('ranges-change', { detail: host.ranges }))
  return true
}
