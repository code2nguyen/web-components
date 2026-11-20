import { addTranslations } from '@c2n/core/localize.js'
import { dateStripMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof dateStripMessages.en = {
  label: 'Choisir un jour',
  previous: 'Jours précédents',
  next: 'Jours suivants',
  marked: (date, marker) => `${date}, ${marker}`,
  hasEvents: 'a des événements',
  disabledReason: (day, reason) => `${day}, ${reason}`,
  valueMissing: 'Veuillez choisir un jour.',
  closedValue: "Le jour choisi n'est plus disponible. Veuillez en choisir un autre.",
}

addTranslations({ fr: { 'date-strip': fr } })
