import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Shown under the last item while the next page loads (`has-more`). */
  loadingMore: 'Loading more…',
  /** Shown under the last item when loading the next page failed and `load-more-error` holds no message of its own. */
  loadMoreFailed: "Couldn't load more",
  /** The button that asks for the next page again. */
  retry: 'Retry',
}

/** The virtual list's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const virtualListMessages = defineMessages('virtual-list', en)
