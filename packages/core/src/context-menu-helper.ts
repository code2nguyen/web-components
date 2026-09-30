/**
 * The protocol a component uses to tell an enclosing `c2-context-menu` what was right-clicked.
 *
 * When `c2-context-menu` is about to open, it dispatches {@link CONTEXT_MENU_REQUEST_EVENT} on the innermost node
 * under the pointer (the first entry of the triggering event's `composedPath()`), so it crosses shadow roots and
 * reaches every component in between. A component that knows what that node stands for — `c2-table` for a cell,
 * a chart for a data point — answers with {@link provideContextMenuData}, and the menu hands the value to its
 * `renderContextMenu` function and its events as `context.data`, with the answering element as `context.source`.
 *
 * The request is pulled rather than pushed so every way of opening the menu (right click, long press, the keyboard
 * context-menu key, `show()`) carries the same data, and a component needs no dependency on `@c2n/context-menu`:
 *
 * ```ts
 * html`<div class="cell" @c2-context-menu-request=${(event: Event) => provideContextMenuData(event, this, { row, value })}>`
 * ```
 *
 * The innermost answer wins: a component nested in a table cell that answers first is not overwritten by the table.
 */

/** Name of the request event. It bubbles and is composed; its detail is a {@link ContextMenuRequestDetail}. */
export const CONTEXT_MENU_REQUEST_EVENT = 'c2-context-menu-request'

export interface ContextMenuRequestDetail {
  /** What the node under the pointer stands for; `undefined` until a component answers. */
  data: unknown
  /** The component that answered, or `null`. */
  source: Element | null
}

/** Dispatches the request on `node` and returns the answer (`{ data: undefined, source: null }` when none came). */
export function requestContextMenuData(node: EventTarget): ContextMenuRequestDetail {
  const detail: ContextMenuRequestDetail = { data: undefined, source: null }
  node.dispatchEvent(new CustomEvent<ContextMenuRequestDetail>(CONTEXT_MENU_REQUEST_EVENT, { bubbles: true, composed: true, detail }))
  return detail
}

/** Answers a request with `data` on behalf of `source`, unless a component nearer the node answered first. */
export function provideContextMenuData(event: Event, source: Element, data: unknown): void {
  const detail = (event as CustomEvent<ContextMenuRequestDetail>).detail
  if (!detail || detail.source) return
  detail.source = source
  detail.data = data
}
