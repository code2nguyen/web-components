import { addTranslations } from '@c2n/core/localize.js'
import { dateInputMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.
const fr: typeof dateInputMessages.en = {
  calendar: 'Calendrier',
  today: "Aujourd'hui",
  clear: 'Effacer',
}

addTranslations({ fr: { 'date-input': fr } })
