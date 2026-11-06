/** A topic of a mind map. Unknown fields are kept, so an app can store its own data on a node. */
export interface MindMapNode {
  /** Unique id. A node without one gets a generated id; a repeated id is replaced, with a warning. */
  id: string
  /** The topic's text. Line breaks are kept. */
  label: string
  /** Subtopics, in drawing order (top to bottom). */
  children?: MindMapNode[]
  /** The subtopics are hidden. Saved with the map, since folding is part of the document. */
  collapsed?: boolean
  /** Which side of the central topic a first-level topic sits on. Without it, `layout="both"` balances the sides. */
  side?: MindMapSide
  /** On a first-level topic, the colour of its whole branch (any CSS colour). Without it, branches take the branch colours in turn. */
  color?: string
  /** An emoji or a short text drawn before the label. Decorative: it is not part of the accessible name. */
  icon?: string
  [key: string]: unknown
}

export type MindMapSide = 'left' | 'right'

/** `both` puts branches on either side of the central topic; `left` and `right` draw a one-sided logic chart. */
export type MindMapLayout = 'both' | 'left' | 'right'

/** What an edit did. */
export type MindMapActionType = 'add' | 'edit' | 'delete' | 'move' | 'collapse' | 'expand' | 'color' | 'paste' | 'undo' | 'redo'

/**
 * An edit. `node` is the topic it is about (as it is after the edit; for `delete`, the removed topic), `parent` its
 * parent after the edit (for `delete`, the parent it was removed from) and `index` its position there.
 */
export interface MindMapAction {
  type: MindMapActionType
  node: MindMapNode
  parent: MindMapNode | null
  index: number
  /** `move`: where the topic was. */
  from?: { parent: MindMapNode | null; index: number }
  /** `paste`: every topic added. */
  nodes?: MindMapNode[]
}

/** Detail of `before-change`. Call `preventDefault()` on the event to veto the edit. */
export interface MindMapBeforeChangeEventDetail {
  action: MindMapAction
}

/** Detail of `change`: the new map, to save, and the edit that made it. */
export interface MindMapChangeEventDetail {
  data: MindMapNode
  action: MindMapAction
}

/** Detail of `selection-change` and `node-click`. */
export interface MindMapNodeEventDetail {
  node: MindMapNode
}
