import { addTranslations } from '@c2n/core/localize.js'
import { timeRangePickerMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: { [K in keyof typeof timeRangePickerMessages.en]: string } = {
  trigger: 'Période',
  dialog: 'Choisir une période',
  shiftBack: 'Plus tôt',
  shiftForward: 'Plus tard',
  zoomOut: 'Élargir',
  refresh: 'Actualiser',
  refreshInterval: 'Actualisation automatique',
  refreshOff: 'Désactivée',
  absoluteRange: 'Période absolue',
  from: 'Du',
  to: 'Au',
  apply: 'Appliquer',
  calendar: 'Choisir les jours',
  hint: 'Saisissez now-7d, now/d ou une date, ou choisissez deux jours.',
  invalidTime: 'Date, heure ou expression now illisible',
  endBeforeStart: 'La fin doit suivre le début',
  quickRanges: 'Périodes rapides',
  search: 'Rechercher une période',
  noMatch: 'Aucune période',
  recent: 'Utilisées récemment',
  last: '{0} précédentes',
  today: 'Aujourd’hui',
  yesterday: 'Hier',
  thisWeek: 'Cette semaine',
  previousWeek: 'La semaine dernière',
  thisMonth: 'Ce mois-ci',
  timeZone: 'Fuseau horaire',
  browserZone: 'Navigateur · {0}',
}

addTranslations({ fr: { 'time-range-picker': fr } })
