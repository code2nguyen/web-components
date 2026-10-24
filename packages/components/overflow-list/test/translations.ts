import { addTranslations } from '@c2n/core/localize.js'
import { overflowListMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof overflowListMessages.en = {
  moreItems: (count: number) => (count === 1 ? `${count} élément de plus` : `${count} éléments de plus`),
  moreItemsCurrent: (count: number) => `${count} éléments de plus, dont l’élément actuel`,
  more: 'Plus d’éléments',
}

addTranslations({ fr: { 'overflow-list': fr } })
