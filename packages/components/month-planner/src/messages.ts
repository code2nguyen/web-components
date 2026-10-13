import { defineMessages } from '@c2n/core/localize.js'

const en = {
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  previousYear: 'Previous year',
  nextYear: 'Next year',
  chooseMonth: 'Choose a month',
  hasEvents: 'has events',
  noEvents: 'No events',
}

const fr: typeof en = {
  previousMonth: 'Mois précédent',
  nextMonth: 'Mois suivant',
  previousYear: 'Année précédente',
  nextYear: 'Année suivante',
  chooseMonth: 'Choisir un mois',
  hasEvents: 'contient des événements',
  noEvents: 'Aucun événement',
}

const de: typeof en = {
  previousMonth: 'Vorheriger Monat',
  nextMonth: 'Nächster Monat',
  previousYear: 'Vorheriges Jahr',
  nextYear: 'Nächstes Jahr',
  chooseMonth: 'Monat auswählen',
  hasEvents: 'hat Termine',
  noEvents: 'Keine Termine',
}

const es: typeof en = {
  previousMonth: 'Mes anterior',
  nextMonth: 'Mes siguiente',
  previousYear: 'Año anterior',
  nextYear: 'Año siguiente',
  chooseMonth: 'Elegir un mes',
  hasEvents: 'tiene eventos',
  noEvents: 'Sin eventos',
}

const it: typeof en = {
  previousMonth: 'Mese precedente',
  nextMonth: 'Mese successivo',
  previousYear: 'Anno precedente',
  nextYear: 'Anno successivo',
  chooseMonth: 'Scegli un mese',
  hasEvents: 'ha eventi',
  noEvents: 'Nessun evento',
}

const pt: typeof en = {
  previousMonth: 'Mês anterior',
  nextMonth: 'Próximo mês',
  previousYear: 'Ano anterior',
  nextYear: 'Próximo ano',
  chooseMonth: 'Escolher um mês',
  hasEvents: 'tem eventos',
  noEvents: 'Sem eventos',
}

const nl: typeof en = {
  previousMonth: 'Vorige maand',
  nextMonth: 'Volgende maand',
  previousYear: 'Vorig jaar',
  nextYear: 'Volgend jaar',
  chooseMonth: 'Kies een maand',
  hasEvents: 'heeft afspraken',
  noEvents: 'Geen afspraken',
}

const vi: typeof en = {
  previousMonth: 'Tháng trước',
  nextMonth: 'Tháng sau',
  previousYear: 'Năm trước',
  nextYear: 'Năm sau',
  chooseMonth: 'Chọn tháng',
  hasEvents: 'có sự kiện',
  noEvents: 'Không có sự kiện',
}

/**
 * The month planner's words the browser cannot translate through `Intl`, picked from `locale` or the nearest `lang`; any
 * other language falls back to English.
 */
export const monthPlannerMessages = defineMessages('month-planner', en, { fr, de, es, it, pt, nl, vi })
