import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the scroll region when it has no `label`. */
  label: 'Scrollable content',
  /** Accessible name of the `controls` button on the top edge. */
  top: 'Scroll up',
  /** Accessible name of the `controls` button on the bottom edge. */
  bottom: 'Scroll down',
  /** Accessible name of the `controls` button on the inline start edge (the left in a left-to-right page). */
  start: 'Scroll back',
  /** Accessible name of the `controls` button on the inline end edge (the right in a left-to-right page). */
  end: 'Scroll forward',
}

/** The scroll area's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const scrollAreaMessages = defineMessages('scroll-area', en)
