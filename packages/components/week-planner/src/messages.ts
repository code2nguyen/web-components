import { defineMessages } from '@c2n/core/localize.js'

const en = {
  odd: 'Odd week',
  even: 'Even week',
  kind: 'Kind of week',
  plan: 'Week plan',
  previous: 'Previous days',
  next: 'Next days',
  previousWeek: 'Previous week',
  nextWeek: 'Next week',
  add: 'New event',
}

const fr: typeof en = {
  odd: 'Semaine impaire',
  even: 'Semaine paire',
  kind: 'Type de semaine',
  plan: 'Planning de la semaine',
  previous: 'Jours précédents',
  next: 'Jours suivants',
  previousWeek: 'Semaine précédente',
  nextWeek: 'Semaine suivante',
  add: 'Nouvel événement',
}

const de: typeof en = {
  odd: 'Ungerade Woche',
  even: 'Gerade Woche',
  kind: 'Wochentyp',
  plan: 'Wochenplan',
  previous: 'Vorherige Tage',
  next: 'Nächste Tage',
  previousWeek: 'Vorherige Woche',
  nextWeek: 'Nächste Woche',
  add: 'Neuer Termin',
}

const es: typeof en = {
  odd: 'Semana impar',
  even: 'Semana par',
  kind: 'Tipo de semana',
  plan: 'Plan semanal',
  previous: 'Días anteriores',
  next: 'Días siguientes',
  previousWeek: 'Semana anterior',
  nextWeek: 'Semana siguiente',
  add: 'Nuevo evento',
}

const it: typeof en = {
  odd: 'Settimana dispari',
  even: 'Settimana pari',
  kind: 'Tipo di settimana',
  plan: 'Piano settimanale',
  previous: 'Giorni precedenti',
  next: 'Giorni successivi',
  previousWeek: 'Settimana precedente',
  nextWeek: 'Settimana successiva',
  add: 'Nuovo evento',
}

const pt: typeof en = {
  odd: 'Semana ímpar',
  even: 'Semana par',
  kind: 'Tipo de semana',
  plan: 'Plano semanal',
  previous: 'Dias anteriores',
  next: 'Próximos dias',
  previousWeek: 'Semana anterior',
  nextWeek: 'Próxima semana',
  add: 'Novo evento',
}

const nl: typeof en = {
  odd: 'Oneven week',
  even: 'Even week',
  kind: 'Soort week',
  plan: 'Weekplanning',
  previous: 'Vorige dagen',
  next: 'Volgende dagen',
  previousWeek: 'Vorige week',
  nextWeek: 'Volgende week',
  add: 'Nieuwe afspraak',
}

const vi: typeof en = {
  odd: 'Tuần lẻ',
  even: 'Tuần chẵn',
  kind: 'Loại tuần',
  plan: 'Kế hoạch tuần',
  previous: 'Những ngày trước',
  next: 'Những ngày sau',
  previousWeek: 'Tuần trước',
  nextWeek: 'Tuần sau',
  add: 'Sự kiện mới',
}

/**
 * The week planner's words the browser cannot translate through `Intl`, picked from `locale` or the nearest `lang`; any
 * other language falls back to English.
 */
export const weekPlannerMessages = defineMessages('week-planner', en, { fr, de, es, it, pt, nl, vi })
