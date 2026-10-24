/**
 * Public types of `c2-org-chart`.
 */

/** One box of the chart: a person, a team or a department. */
export interface OrgChartNode {
  /** Identity of the node. Selection and collapsing are both tracked by this value, so it must be unique. */
  id: string
  /** Main line of the card, usually a person's name. Falls back to {@link OrgChartNode.id}. */
  label?: string
  /** Second line of the card, usually a job title or a head count. */
  description?: string
  /** Picture shown in the card's avatar. Without one the avatar shows the label's initials. */
  image?: string
  /** The nodes that report to this one. */
  children?: OrgChartNode[]
  /** Keeps the node from being selected. It can still be focused, expanded and collapsed. */
  disabled?: boolean
  /** Arbitrary payload carried back to the consumer in events and in `renderItem`. */
  data?: unknown
}

/** What `renderItem` is told about the card it is drawing. */
export interface OrgChartItemContext {
  /** The node being drawn. */
  node: OrgChartNode
  /** The node it reports to, `undefined` for a root. */
  parent: OrgChartNode | undefined
  /** Depth of the node, `0` for a root. */
  level: number
  /** Whether its children are shown. Always `true` for a node without children. */
  expanded: boolean
  /** Whether the node is the selected one. */
  selected: boolean
}

/** Replaces the content of every card. Returns anything Lit can render: a Lit template or a DOM node, not JSX. */
export type OrgChartItemRenderer = (context: OrgChartItemContext) => unknown

/** Which way the chart grows: `vertical` puts reports below their manager, `horizontal` beside them. */
export type OrgChartOrientation = 'vertical' | 'horizontal'

/** Detail of `c2-org-chart`'s `selection-change` event. */
export interface OrgChartSelectionChangeEventDetail {
  /** Id of the selected node. */
  value: string
  /** The selected node. */
  node: OrgChartNode
}

/** Detail of `c2-org-chart`'s `expansion-change` event. */
export interface OrgChartExpansionChangeEventDetail {
  /** Ids of every collapsed node after the change. */
  collapsedItems: string[]
  /** The node that was expanded or collapsed. */
  node: OrgChartNode
  /** Whether its children are now shown. */
  expanded: boolean
}

/** Detail of `c2-org-chart`'s `item-click` event. */
export interface OrgChartItemClickEventDetail {
  /** The node whose card was clicked or activated with Enter or Space. */
  node: OrgChartNode
}
