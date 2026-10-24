/** Where a popover is anchored: a `DOMRect`, or the edges of a text range. */
export interface PopoverAnchor {
  left: number
  top: number
  bottom: number
}

/** Places a popover next to `anchor`, flipping to the other side when there is no room. */
export function place(popover: HTMLElement, anchor: PopoverAnchor, side: 'above' | 'below') {
  const width = popover.offsetWidth
  const height = popover.offsetHeight
  const gap = 6
  let y = side === 'below' ? anchor.bottom + gap : anchor.top - height - gap
  if (side === 'below' && y + height > innerHeight - 8 && anchor.top - height - gap >= 8) y = anchor.top - height - gap
  if (side === 'above' && y < 8) y = anchor.bottom + gap
  const x = Math.min(Math.max(8, anchor.left), innerWidth - width - 8)
  popover.style.left = `${Math.round(x)}px`
  popover.style.top = `${Math.round(Math.max(8, y))}px`
}

/** The caret and selection as DOM positions, with the anchor and the focus told apart. */
export interface ComposedSelection {
  anchorNode: Node
  anchorOffset: number
  focusNode: Node
  focusOffset: number
}

/**
 * The caret and selection inside an editor's shadow root. The standard way is `getComposedRanges` with this shadow root
 * (Chromium, WebKit, Firefox), whose `direction` tells the anchor from the focus. WebKit's `shadowRoot.getSelection()`
 * can lag behind a selection set from script, so it is only the fallback for browsers without composed ranges.
 */
export function composedSelection(root: Element | ShadowRoot | DocumentFragment): ComposedSelection | null {
  const shadow = root as ShadowRoot & { getSelection?: () => Selection | null }
  const selection = document.getSelection() as (Selection & { direction?: string }) | null
  if (selection && typeof selection.getComposedRanges === 'function' && root instanceof ShadowRoot) {
    if (!selection.rangeCount) return null
    const range = selection.getComposedRanges({ shadowRoots: [root] })[0]
    if (!range) return null
    return selection.direction === 'backward'
      ? { anchorNode: range.endContainer, anchorOffset: range.endOffset, focusNode: range.startContainer, focusOffset: range.startOffset }
      : { anchorNode: range.startContainer, anchorOffset: range.startOffset, focusNode: range.endContainer, focusOffset: range.endOffset }
  }
  const fallback = shadow.getSelection?.() ?? selection
  return fallback?.anchorNode && fallback.focusNode ? (fallback as Selection & { anchorNode: Node; focusNode: Node }) : null
}
