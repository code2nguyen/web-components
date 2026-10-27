import { addTranslations } from '@c2n/core/localize.js'
import { timeSlotPickerMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof timeSlotPickerMessages.en = {
  label: 'Choisir un horaire',
  day: 'Choisir un jour',
  morning: 'Matin',
  afternoon: 'Après-midi',
  evening: 'Soir',
  times: (date) => `Horaires du ${date}`,
  timesIn: (zone) => `Horaires en ${zone}`,
  unavailable: (time) => `${time}, indisponible`,
  noTimes: (date) => `Aucun horaire le ${date}`,
  nextAvailable: (date) => `Prochaine disponibilité : ${date}`,
  available: (count, date) => (count === 1 ? `1 horaire disponible le ${date}` : `${count} horaires disponibles le ${date}`),
  loading: 'Chargement des horaires',
  valueMissing: 'Veuillez choisir un horaire.',
}

addTranslations({ fr: { 'time-slot-picker': fr } })
