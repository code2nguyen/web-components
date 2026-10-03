/**
 * The contract between `c2-dashboard` and `c2-dash-card`. It lives in its own module so neither element has to
 * import the other's class: the grid imports the card to register the tag, the card only imports these types.
 */

/** Placement of one card, 1-based like CSS grid. Every field overrides the card's own attribute. */
export interface DashCardPlacement {
  /** 1-based column the card starts in. */
  col?: number
  /** 1-based row the card starts in. */
  row?: number
  /** Number of columns the card occupies. */
  colSpan?: number
  /** Number of rows the card occupies. */
  rowSpan?: number
  /** `false` hides the card, which is how a layout drops a card without removing it from the markup. */
  visible?: boolean
}

/**
 * One named whole-panel size, declared on the grid's `sizes` record and chosen by a card's `size`. Each field is
 * the number of tracks the card spans while the size is in force; a field left out keeps the card's own
 * `col-span`/`row-span`.
 */
export interface DashboardPanelSize {
  /** Number of columns a card of this size occupies. */
  colSpan?: number
  /** Number of rows a card of this size occupies. */
  rowSpan?: number
}

/** What one card contributes to the minimum size of the tracks it covers, read during a drag. */
export interface DashCardConstraint {
  col: number
  colSpan: number
  row: number
  rowSpan: number
  minWidth: number
  minHeight: number
}

/** The part of `c2-dashboard` a card talks to. */
export interface DashboardHost extends HTMLElement {
  readonly columnCount: number
  readonly rowCount: number
  /** `true` once the grid has rendered; a card that registers after that arrived at runtime and animates in. */
  readonly hasUpdated: boolean
  registerCard(card: DashboardCard): void
  unregisterCard(card: DashboardCard): void
  /** Resizes one column by `delta` pixels, clamped by the minimums; returns the change that was actually applied. */
  resizeColumn(index: number, delta: number): number
  /** Resizes one row by `delta` pixels, clamped by the minimums; returns the change that was actually applied. */
  resizeRow(index: number, delta: number): number
  /** End of a gesture: persist the track sizes and report them. */
  commitResize(): void
  /** Where the splitter after `index` sits, as a percentage of the tracks' total — the handles' `aria-valuenow`. */
  splitterValue(axis: 'column' | 'row', index: number): number
  placementOf(cardId: string | undefined): DashCardPlacement | undefined
  /** Spans of the named size in force for this card, or `undefined` when it has none the grid knows. */
  panelSizeOf(card: DashboardCard): DashboardPanelSize | undefined
}

/** The part of `c2-dash-card` the grid reads back. */
export interface DashboardCard extends HTMLElement {
  /** Stable persistence identity supplied by the card's `card-id`. */
  readonly cardId?: string
  /** Authored named size, a key of the grid's `sizes`. */
  readonly size?: string
  /** `undefined` while the card is hidden, so a hidden card constrains nothing. */
  readonly constraint: DashCardConstraint | undefined
  /** The grid changed shape: re-render the placement and the handles. */
  hostChanged(): void
}

export const DASHBOARD_TAG = 'c2-dashboard'
