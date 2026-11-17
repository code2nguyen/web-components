/**
 * Mouse drag to scroll for `c2-scroll-area`'s `mouse-drag`, loaded the first time it is turned on. Touch scrolls by
 * dragging natively, so only a mouse is handled.
 */

/** How far, in pixels, the mouse must move with the button down before the press becomes a drag instead of a click. */
const THRESHOLD = 5

type Orientation = 'vertical' | 'horizontal' | 'both'

/**
 * Lets a mouse drag `viewport` along the axes `orientation()` names. The viewport gets `draggable` while attached and
 * `dragging` during a drag. The click that ends a drag does not reach the content. Returns the detach function.
 */
export function dragToScroll(viewport: HTMLElement, orientation: () => Orientation): () => void {
  let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null
  let suppressClick = false

  const end = () => {
    drag = null
    viewport.classList.remove('dragging')
  }

  const listeners: Record<string, (event: Event) => void> = {
    pointerdown: (event) => {
      const { pointerType, button, clientX, clientY, pointerId } = event as PointerEvent
      if (pointerType !== 'mouse' || button !== 0) return
      // A field keeps its own text selection and caret placement.
      if (event.composedPath().some((node) => node instanceof HTMLElement && node.matches('input, textarea, select, [contenteditable]'))) return
      // A press on the scrollbar (outside the client box, on either side) drags its thumb.
      const box = viewport.getBoundingClientRect()
      const x = clientX - box.left - viewport.clientLeft
      const y = clientY - box.top - viewport.clientTop
      if (x < 0 || y < 0 || x >= viewport.clientWidth || y >= viewport.clientHeight) return
      drag = { id: pointerId, x: clientX, y: clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false }
    },
    pointermove: (event) => {
      const { pointerId, buttons, clientX, clientY } = event as PointerEvent
      if (!drag || pointerId !== drag.id) return
      // Released where the viewport could not see it (outside, before the capture): the press is over.
      if (!(buttons & 1)) return end()
      const axes = orientation()
      const inline = axes !== 'vertical'
      const block = axes !== 'horizontal'
      const dx = clientX - drag.x
      const dy = clientY - drag.y
      if (!drag.moved) {
        if (Math.max(inline ? Math.abs(dx) : 0, block ? Math.abs(dy) : 0) < THRESHOLD) return
        // Capture only once it is a drag: on press, it would retarget a plain click on a link to the viewport.
        drag.moved = true
        viewport.setPointerCapture(pointerId)
        // Before the first scroll: snapping is off and selection paused while it drags.
        viewport.classList.add('dragging')
        getSelection()?.removeAllRanges()
      }
      event.preventDefault()
      if (inline) viewport.scrollLeft = drag.left - dx
      if (block) viewport.scrollTop = drag.top - dy
    },
    pointerup: (event) => {
      const moved = drag?.moved && (event as PointerEvent).pointerId === drag.id
      listeners.pointercancel(event)
      if (!moved) return
      suppressClick = true
      // A click that does not follow (released outside the page) must not swallow the next real one.
      setTimeout(() => (suppressClick = false))
    },
    pointercancel: (event) => {
      if (drag && (event as PointerEvent).pointerId === drag.id) end()
    },
    dragstart: (event) => event.preventDefault(),
  }
  listeners.lostpointercapture = listeners.pointercancel
  // Capturing, so it runs before a link or a listener in the content sees the click.
  const click = (event: Event) => {
    if (!suppressClick) return
    suppressClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  for (const [type, listener] of Object.entries(listeners)) viewport.addEventListener(type, listener)
  viewport.addEventListener('click', click, true)
  viewport.classList.add('draggable')
  return () => {
    for (const [type, listener] of Object.entries(listeners)) viewport.removeEventListener(type, listener)
    viewport.removeEventListener('click', click, true)
    viewport.classList.remove('draggable')
    end()
  }
}
