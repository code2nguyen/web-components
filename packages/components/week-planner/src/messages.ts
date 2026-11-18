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
  available: 'Available',
  empty: 'Not set',
  paintHint: 'Arrow keys move, Space paints or clears, Shift+Arrow paints while moving',
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
  available: 'Disponible',
  empty: 'Non défini',
  paintHint: 'Flèches pour se déplacer, Espace pour peindre ou effacer, Maj+flèche pour peindre en se déplaçant',
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
  available: 'Verfügbar',
  empty: 'Nicht festgelegt',
  paintHint: 'Pfeiltasten bewegen, Leertaste markiert oder löscht, Umschalt+Pfeil markiert beim Bewegen',
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
  available: 'Disponible',
  empty: 'Sin definir',
  paintHint: 'Las flechas mueven, Espacio pinta o borra, Mayús+flecha pinta al moverse',
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
  available: 'Disponibile',
  empty: 'Non impostato',
  paintHint: 'Le frecce spostano, Spazio colora o cancella, Maiusc+freccia colora spostandosi',
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
  available: 'Disponível',
  empty: 'Não definido',
  paintHint: 'As setas movem, Espaço pinta ou apaga, Shift+seta pinta ao mover',
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
  available: 'Beschikbaar',
  empty: 'Niet ingesteld',
  paintHint: 'Pijltjestoetsen verplaatsen, spatie markeert of wist, Shift+pijl markeert tijdens het verplaatsen',
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
  available: 'Còn trống',
  empty: 'Chưa đặt',
  paintHint: 'Phím mũi tên để di chuyển, phím cách để tô hoặc xóa, Shift+mũi tên để tô khi di chuyển',
}

/**
 * The week planner's words the browser cannot translate through `Intl`, picked from `locale` or the nearest `lang`; any
 * other language falls back to English.
 */
export const weekPlannerMessages = defineMessages('week-planner', en, { fr, de, es, it, pt, nl, vi })
