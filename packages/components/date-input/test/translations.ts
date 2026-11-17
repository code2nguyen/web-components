import { addTranslations } from '@c2n/core/localize.js'
import { dateInputMessages } from '../src/messages.js'
import { dateFieldsMessages } from '../src/date-fields-messages.js'

// The French an app would add: the library ships its text in English only.
const fr: typeof dateInputMessages.en = {
  calendar: 'Calendrier',
  today: "Aujourd'hui",
  clear: 'Effacer',
}

const fields: typeof dateFieldsMessages.en = {
  day: 'Jour',
  month: 'Mois',
  year: 'Année',
  required: 'Saisissez une date',
  incomplete: 'Saisissez une date complète',
  missingDay: 'La date doit comporter un jour',
  missingMonth: 'La date doit comporter un mois',
  missingYear: 'La date doit comporter une année',
  badDay: 'Le jour doit être un nombre de 1 à 31',
  badMonth: 'Le mois doit être un nombre de 1 à 12',
  badYear: "L'année doit comporter 4 chiffres",
  notReal: 'La date doit exister',
  min: (date) => `La date doit être le ${date} ou après`,
  max: (date) => `La date doit être le ${date} ou avant`,
}

addTranslations({ fr: { 'date-input': fr, 'date-fields': fields } })
