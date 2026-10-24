import { DOMSerializer, Fragment, Slice, type Node as ProseNode } from 'prosemirror-model'
import { listNumbers, schema } from './schema'

/** Serializes a page to HTML with real nested `<ul>`/`<ol>` lists. */
export function pageToHTML(doc: ProseNode): string {
  const serializer = DOMSerializer.fromSchema(schema)
  const root = document.createElement('div')
  const numbers = listNumbers(doc)
  let stack: Array<{ list: HTMLElement; kind: string; last: HTMLElement | null }> = []
  doc.forEach((node, _pos, index) => {
    if (node.type !== schema.nodes.item) {
      stack = []
      if (node.type === schema.nodes.paragraph && node.content.size === 0 && index === doc.childCount - 1) return
      root.append(serializer.serializeNode(node))
      return
    }
    const indent = node.attrs.indent as number
    const kind = node.attrs.kind as string
    const tag = kind === 'ordered' ? 'ol' : 'ul'
    while (stack.length > indent + 1) stack.pop()
    let level: (typeof stack)[number] | undefined = stack[indent]
    if (level && level.kind !== kind) {
      stack.length = indent
      level = undefined
    }
    if (!level) {
      const list = document.createElement(tag)
      if (kind === 'todo') list.className = 'todo-list'
      if (kind === 'ordered' && numbers[index] > 1) list.setAttribute('start', String(numbers[index]))
      const parent = indent > 0 ? stack[indent - 1]?.last : null
      ;(parent ?? root).append(list)
      level = { list, kind, last: null }
      stack[indent] = level
    }
    const li = document.createElement('li')
    if (kind === 'todo') {
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.disabled = true
      if (node.attrs.checked) box.setAttribute('checked', '')
      li.append(box, ' ')
      li.dataset.checked = String(node.attrs.checked)
    }
    li.append(serializer.serializeFragment(node.content))
    level.list.append(li)
    level.last = li
  })
  return root.innerHTML
}

/** A list marker a pasted line starts with: `-`, `*`, `•` or `–` for a bullet, `1.` or `1)` for a numbered item. */
const PASTED_MARKER = /^\s*(?:([-*•–])|\d+[.)])\s+/

/** A pasted paragraph that starts with a list marker, as a list item without the marker; anything else as it is. */
function pastedListItem(node: ProseNode): ProseNode {
  const first = node.firstChild
  const match = node.type === schema.nodes.paragraph && first?.isText ? PASTED_MARKER.exec(first.text!) : null
  if (!match || first!.text!.length === match[0].length) return node
  const rest = first!.cut(match[0].length)
  return schema.nodes.item.create({ kind: match[1] ? 'bullet' : 'ordered' }, node.content.replaceChild(0, rest), node.marks)
}

/**
 * A web page's text often comes as one paragraph whose lines are `<br>`s: pasted as is, it is one block, so a heading
 * or a list made of one line takes them all. Each line of a pasted text block becomes a block of its own (the blank
 * ones a `<br><br>` leaves are dropped), and a line starting with a list marker a list item. A code block keeps its
 * lines.
 */
export function splitPastedLines(slice: Slice): Slice {
  const blocks: ProseNode[] = []
  slice.content.forEach((node) => {
    if (!node.isTextblock || node.type.spec.code) {
      blocks.push(node)
      return
    }
    const lines: ProseNode[][] = [[]]
    node.forEach((child) => (child.type === schema.nodes.hard_break ? lines.push([]) : lines[lines.length - 1].push(child)))
    const kept = lines.length > 1 ? lines.filter((line) => line.some((child) => !child.isText || child.text!.trim())) : lines
    for (const line of kept.length ? kept : [[]]) blocks.push(pastedListItem(node.type.create(node.attrs, line, node.marks)))
  })
  return new Slice(Fragment.fromArray(blocks), slice.openStart, slice.openEnd)
}
