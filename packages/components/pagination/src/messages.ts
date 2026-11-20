import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the navigation landmark. */
  label: 'Pagination',
  /** Labels of the previous, next, first and last controls. */
  previous: 'Previous',
  next: 'Next',
  first: 'First',
  last: 'Last',
  /** Text before the rows-per-page select; a trailing colon is dropped from the select's accessible name. */
  pageSize: 'Rows per page:',
  /** Range status of the `compact` variant. */
  range: (start: number, end: number, total: number) => `${start}–${end} of ${total}`,
  /** Status of the `simple` variant. */
  page: (page: number, pageCount: number) => `Page ${page} of ${pageCount}`,
  /** Accessible name of a page number. */
  goToPage: (page: number) => `Go to page ${page}`,
  /** Accessible name of an ellipsis: `{0}` is the page it jumps to, `{1}` how many pages it hides. */
  jump: (page: number, count: number) => `Jump to page ${page}, skipping ${count} pages`,
}

/** The pagination's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const paginationMessages = defineMessages('pagination', en)
