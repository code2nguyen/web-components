import { addTranslations } from '@c2n/core/localize.js'
import { tabsMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof tabsMessages.en = {
  more: 'Plus',
  moreTabs: (count: number) => (count === 1 ? `${count} onglet de plus` : `${count} onglets de plus`),
  moreMenu: 'Autres onglets',
}

addTranslations({ fr: { tabs: fr } })
