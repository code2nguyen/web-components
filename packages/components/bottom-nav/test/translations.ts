import { addTranslations } from '@c2n/core/localize.js'
import { bottomNavMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof bottomNavMessages.en = {
  navigationLabel: 'Principale',
  newCount: (count: string) => `${count} nouveaux`,
  newActivity: 'nouvelle activité',
}

addTranslations({ fr: { 'bottom-nav': fr } })
