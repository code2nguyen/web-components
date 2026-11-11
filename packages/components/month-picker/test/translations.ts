import { addTranslations } from '@c2n/core/localize.js'
import { monthPickerMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof monthPickerMessages.en = {
  label: 'Choisir un mois',
  quarterLabel: 'Choisir un trimestre',
  halfYearLabel: 'Choisir un semestre',
  yearLabel: 'Choisir une année',
  previousYear: 'Année précédente',
  nextYear: 'Année suivante',
  previousYears: 'Années précédentes',
  nextYears: 'Années suivantes',
  chooseYear: (year) => `${year}, choisir une année`,
  backToMonths: (year) => `Revenir aux mois de ${year}`,
  backToPeriods: (year) => `Revenir à ${year}`,
  quarter: (number) => `T${number}`,
  halfYear: (number) => `S${number}`,
  period: (period, year) => `${period} ${year}`,
  periodMonths: (period, months) => `${period}, ${months}`,
  fiscalYear: (year) => `exercice ${year}`,
  previousPeriod: 'Période précédente',
  nextPeriod: 'Période suivante',
  valueMissing: 'Veuillez choisir un mois.',
  quarterMissing: 'Veuillez choisir un trimestre.',
  halfYearMissing: 'Veuillez choisir un semestre.',
  yearMissing: 'Veuillez choisir une année.',
}

addTranslations({ fr: { 'month-picker': fr } })
