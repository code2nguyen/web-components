import { addTranslations } from '@c2n/core/localize.js'
import { dateStripMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof dateStripMessages.en = {
  label: 'Choisir un jour',
  previous: 'Jours précédents',
  next: 'Jours suivants',
  marked: (date, marker) => `${date}, ${marker}`,
  hasEvents: 'a des événements',
  valueMissing: 'Veuillez choisir un jour.',
}

addTranslations({ fr: { 'date-strip': fr } })
