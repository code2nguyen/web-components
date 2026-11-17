import { defineMessages } from '@c2n/core/localize.js'

const en = {
  loading: 'Loading page',
}

// The navigation progress bar's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`.
export const navigationProgressMessages = defineMessages('navigation-progress', en)
