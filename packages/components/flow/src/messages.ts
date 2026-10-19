import { defineMessages } from '@c2n/core/localize.js'

const en = {
  rename: 'Rename',
  editLabel: 'Edit label',
  delete: 'Delete',
  addNode: 'Add node',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fitView: 'Fit view',
  layout: 'Layout',
  leftToRight: 'Left to right',
  topToBottom: 'Top to bottom',
  autoLayout: 'Auto layout',
  lockLayout: 'Lock layout',
  alreadyConnected: (node: string) => `${node} is already connected to every other node.`,
  connectPrompt: (source: string, target: string) => `Connect ${source} to ${target}. Arrow keys or Tab choose another node, Enter connects, Escape cancels.`,
  connectTarget: (node: string, position: number, total: number) => `${node}, ${position} of ${total}`,
  connected: (source: string, target: string) => `Connected ${source} to ${target}.`,
  connectionCancelled: 'Connection cancelled.',
  /** `label` is empty for an unlabelled edge; `total` is 0 when the edge is not one of several being stepped through. */
  edgeSelected: (source: string, target: string, label: string, position: number, total: number) =>
    `Edge from ${source} to ${target}${label ? `, labelled ${label}` : ''}${total ? `, ${position} of ${total},` : ''} selected. Delete removes it, F2 edits its label.`,
  noEdges: (node: string) => `${node} has no edges.`,
  renameNode: (node: string) => `Rename ${node}`,
  edgeLabelField: (source: string, target: string) => `Label of the edge from ${source} to ${target}`,
  /** The nodes before or after a node; `labelled` when an edge carries a label, so its items hold a comma. */
  after: (items: string[], labelled: boolean) => `After ${items.join(labelled ? '; ' : ', ')}.`,
  before: (items: string[], labelled: boolean) => `Before ${items.join(labelled ? '; ' : ', ')}.`,
  /** An edge between rows, read on one of its nodes: the far end (`customers.id`), then this node's own row. */
  throughRow: (end: string, row: string) => `${end} through ${row}`,
  /** The rows of a node, each its label and its `meta`. */
  rows: (items: string[]) => `Rows: ${items.join(', ')}.`,
  /** The row a node's folded rows collapse into, and its label once they show. */
  moreRows: (count: number) => `+ ${count} more`,
  fewerRows: 'Show fewer',
  showAllRows: 'Show all rows',
  showFewerRows: 'Show fewer rows',
  rowsHidden: (count: number) => `${count} more rows, Shift+Enter shows them.`,
  rowsShown: (node: string) => `All rows of ${node} shown.`,
  rowsFolded: (node: string) => `Rows of ${node} folded.`,
  duration: 'Duration',
  dragToConnect: 'Drag to connect',
  flowActions: 'Flow actions',
  flowMenu: 'Flow',
  emptyFlow: 'Empty flow',
  emptyHint: 'Press N or Enter to add a node.',
  statusPending: 'Pending',
  statusCurrent: 'Waiting',
  statusRunning: 'Running',
  statusSuccess: 'Succeeded',
  statusError: 'Failed',
  statusWarning: 'Succeeded with warnings',
  statusSkipped: 'Skipped',
}

/** The flow's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const flowMessages = defineMessages('flow', en)
