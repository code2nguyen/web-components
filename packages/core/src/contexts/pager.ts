import { createContext } from '@lit/context'

/**
 * Shared contract between a paging host — a `c2-table` — and the pager inside it, so neither package has to
 * depend on the other. Enrollment and state travel on separate channels: the pager announces itself with
 * `PAGER_CONNECT_EVENT` when it connects, and from then on the host feeds it through `pagerContext`.
 */

/** Fired by a pager when it connects, so a paging host can claim it. Bubbles and is composed; the host stops it. */
export const PAGER_CONNECT_EVENT = 'c2-pager-connect'

export interface PagerConnectEventDetail {
  /** The pager's own page size, adopted by a host that has none of its own. */
  pageSize: number
}

/** What a paging host shares with the pager inside it. */
export interface PagerContext {
  /** The page on show, 1-based. */
  page: number
  /** Items per page. */
  pageSize: number
  /** Total number of items to page through. */
  totalItems: number
  /** True while the host is loading, so the pager can dim its controls. */
  busy: boolean
  /** The pager asks for another page; the host clamps it, loads it, and pushes the settled value back. */
  pageChanged(page: number): void
  /** The pager asks for another page size. */
  pageSizeChanged(pageSize: number): void
}

/** `undefined` when no host is present, so a pager on its own keeps working from its own properties. */
export const pagerContext = createContext<PagerContext | undefined>(Symbol('c2-pager'))
