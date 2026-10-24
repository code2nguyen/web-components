import { defineMessages } from '@c2n/core/localize.js'

const en = {
  skipToContent: 'Skip to main content',
  navigation: 'Main',
  openNavigation: 'Open navigation',
  closeNavigation: 'Close navigation',
  openDetails: 'Show details',
  closeDetails: 'Close details',
}

/** The app shell's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const appShellMessages = defineMessages('app-shell', en)
