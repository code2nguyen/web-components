import { composedSelectionRange } from '@c2n/core/dom-helper.js'
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

/**
 * Labels the selection: removes the span with `label` around it, or adds a span merged with the spans of that label it
 * overlaps. Loaded by `annotate()` on first use.
 */
export function annotate(host: TextAnnotator, text: string, label: string): boolean {
  const selection = getSelection()
  const root = host.renderRoot as ShadowRoot & { getSelection?: () => Selection | null }
  const wrapper = root.querySelector('[part~="text"]')
  if (!selection?.rangeCount || !wrapper) return false
  // getComposedRanges is Baseline 2025, first with a list of roots (Safari 17). Before it, Firefox's getRangeAt already
  // sees into the shadow root and Chromium has shadowRoot.getSelection(). A range that cannot see in makes offset() throw.
  const ranges = [() => composedSelectionRange(selection, [root]), () => (root.getSelection?.() ?? selection).getRangeAt(0)]
  let start = -1
  let end = -1
  for (const range of ranges) {
    try {
      const found = range()
      if (!found) continue
      const { startContainer, startOffset, endContainer, endOffset } = found
      start = offset(wrapper, startContainer, startOffset)
      end = offset(wrapper, endContainer, endOffset)
      break
    } catch {
      // This engine needs the next way.
    }
  }
  while (start < end && /\s/.test(text[start])) start++
  while (end > start && /\s/.test(text[end - 1])) end--
  if (start >= end) return false
  const spans = host.ranges ?? []
  const around = spans.findIndex((r) => r.label === label && r.start <= start && r.end >= end)
  if (around >= 0) host.ranges = spans.filter((_, i) => i !== around)
  else {
    const touched = spans.filter((r) => r.label === label && r.start < end && r.end > start)
    for (const r of touched) [start, end] = [Math.min(start, r.start), Math.max(end, r.end)]
    host.ranges = [...spans.filter((r) => !touched.includes(r)), { start, end, label }]
  }
  selection.removeAllRanges()
  host.dispatchEvent(new CustomEvent('ranges-change', { detail: host.ranges }))
  return true
}
