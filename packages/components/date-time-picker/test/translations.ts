import { addTranslations } from '@c2n/core/localize.js'
import { dateTimePickerMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof dateTimePickerMessages.en = {
  open: 'Ouvrir le sélecteur de date et d’heure',
  calendar: 'Choisir une date',
  previousMonth: 'Mois précédent',
  nextMonth: 'Mois suivant',
  time: 'Heure',
  timeZone: 'Fuseau horaire',
  now: 'Maintenant',
  done: 'Terminé',
}

addTranslations({ fr: { 'date-time-picker': fr } })
