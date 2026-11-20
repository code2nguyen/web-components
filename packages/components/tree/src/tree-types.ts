/**
 * Public types shared by `c2-tree` and `c2-tree-item`.
 *
 * The tree can be authored two ways — nested `<c2-tree-item>` elements, or a `TreeNode[]` handed to the
 * `items` property — and {@link TreeNode} is the single shape both speak. A declarative item synthesizes one
 * from its own attributes through its `node` getter, so event details, renderers and the lazy loader never
 * have to care which mode produced a row.
 */

/**
 * One node of a tree.
 *
 * Shaped after `CascaderOption` so the two hierarchical components read alike. `children` is only meaningful
 * in the data-driven mode: a declarative item's `node` deliberately leaves it `undefined` rather than walking
 * its subtree on every event dispatch.
 */
export interface TreeNode {
  /** Identity of the node. Selection and expansion are both tracked by this value, so it must be unique. */
  value: string
  /** Text shown on the row. Falls back to {@link TreeNode.value} when omitted. */
  label?: string
  /** Child nodes. Leave undefined and set {@link TreeNode.hasChildren} for a branch that loads on demand. */
  children?: TreeNode[]
  /** Blocks selection and expansion, and excludes the node from checkbox propagation. */
  disabled?: boolean
  /**
   * Marks a branch whose children are not loaded yet, so the row shows a toggle before anything is known
   * about its contents. Expanding it runs the tree's `loadChildren`.
   */
  hasChildren?: boolean
  /** Arbitrary payload carried back to the consumer on `selection-change` and in the renderers. */
  data?: unknown
}

/** What a renderer or loader is told about the row it is being called for. */
export interface TreeItemContext {
  /** The node being rendered. */
  node: TreeNode
  /** Depth of the node, `0` for a root. */
  level: number
  /** Whether the node is currently expanded. */
  expanded: boolean
  /** Whether the node is currently selected. */
  selected: boolean
}

/** Replaces part of a row's content. Returns anything Lit can render. */
export type TreeItemRenderer = (context: TreeItemContext) => unknown

/** Resolves the children of a branch the first time it is expanded. */
export type TreeChildrenLoader = (context: TreeItemContext) => Promise<TreeNode[]>

/** Detail of `c2-tree`'s `selection-change` event. */
export interface TreeSelectionChangeEventDetail {
  /** Values of every selected node, in tree order. */
  value: string[]
  /** The selected nodes themselves. */
  nodes: TreeNode[]
}

/** Detail of `c2-tree`'s `expansion-change` event. */
export interface TreeExpansionChangeEventDetail {
  /** Values of every expanded node after the change. */
  expandedItems: string[]
  /** The node that was toggled. */
  node: TreeNode
  /** Whether that node is now expanded. */
  expanded: boolean
}

/** Detail of `c2-tree`'s `item-click` event. */
export interface TreeItemClickEventDetail {
  /** The node whose row was clicked. */
  node: TreeNode
}

/** Detail of `c2-tree`'s `item-expand` event, the hook a declarative consumer loads children from. */
export interface TreeItemExpandEventDetail {
  /** The node being expanded. */
  node: TreeNode
  /** True while the node's children still have to be produced. */
  loading: boolean
}

/** Detail of `c2-tree`'s `item-load-error` event. */
export interface TreeItemLoadErrorEventDetail {
  /** The node whose children failed to load. */
  node: TreeNode
  /** Whatever `loadChildren` rejected with. */
  error: unknown
}

/** Detail of `c2-tree`'s `item-move` event, fired before a `reorderable` tree moves a row. */
export interface TreeItemMoveEventDetail {
  /** The node being moved. */
  node: TreeNode
  /** Its new parent, or `null` for the root. */
  parent: TreeNode | null
  /** Its index among the new parent's children, counted without the moved node. */
  index: number
  /** Its parent before the move, or `null` for the root. */
  previousParent: TreeNode | null
  /** Its index among its previous siblings. */
  previousIndex: number
}

/** Detail of the `item-drop` event: nodes dropped on the tree from outside it, before the tree changes. */
export interface TreeItemDropEventDetail {
  /** The payload kind of the drop: the tree's `drop-kind`. */
  kind: string
  /** The nodes the tree adds, in the order of the payload. */
  items: TreeNode[]
  /** The dropped entries the tree turns away: not a node with a `value`, or a value the tree already holds. */
  refused: unknown[]
  /** The parent the nodes go under, or `null` for the root. */
  parent: TreeNode | null
  /** Their index among that parent's children. */
  index: number
  /**
   * In a tree authored in markup, the element to add a `c2-tree-item` per node to (`parentElement.insertBefore(row,
   * before)`): the parent row, or the tree at the root. A data-driven tree adds the nodes to `items` itself.
   */
  parentElement: Element
  /** The element to insert the new rows before, or `null` to append them. */
  before: Element | null
}

/** Detail of the `item-move-out` event: nodes another place took, before they leave the tree. */
export interface TreeItemMoveOutEventDetail {
  /** The payload kind they left as: the tree's `drag-kind`. */
  kind: string
  /** The nodes that leave, each with its subtree. */
  items: TreeNode[]
  /**
   * Their rows. A data-driven tree takes the nodes out of `items` itself; in a tree authored in markup the
   * application removes these elements (`row.remove()`).
   */
  rows: Element[]
  /**
   * The c2n element that took them (another tree, a list, a board). A drop anywhere else (a text field, a page's own drop area,
   * another window) takes a copy, and they stay.
   */
  target: Element
}

/** How a checkbox tick travels between a node and its relatives. */
export type TreeSelectionPropagation = 'none' | 'descendants' | 'parents' | 'both'

/** How many rows may be selected at once. */
export type TreeSelectionMode = 'none' | 'single' | 'multiple'
