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

/** How a checkbox tick travels between a node and its relatives. */
export type TreeSelectionPropagation = 'none' | 'descendants' | 'parents' | 'both'

/** How many rows may be selected at once. */
export type TreeSelectionMode = 'none' | 'single' | 'multiple'
