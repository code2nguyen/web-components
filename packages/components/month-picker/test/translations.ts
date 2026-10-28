import { addTranslations } from '@c2n/core/localize.js'
import { monthPickerMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof monthPickerMessages.en = {
  label: 'Choisir un mois',
  yearLabel: 'Choisir une année',
  previousYear: 'Année précédente',
  nextYear: 'Année suivante',
  previousYears: 'Années précédentes',
  nextYears: 'Années suivantes',
  chooseYear: (year) => `${year}, choisir une année`,
  backToMonths: (year) => `Revenir aux mois de ${year}`,
  valueMissing: 'Veuillez choisir un mois.',
  yearMissing: 'Veuillez choisir une année.',
}

addTranslations({ fr: { 'month-picker': fr } })
