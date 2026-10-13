import { defineMessages } from '@c2n/core/localize.js'

const en = {
  hours: 'Hours',
  minutes: 'Minutes',
  seconds: 'Seconds',
  period: 'AM/PM',
  now: 'Now',
  done: 'Done',
  open: 'Open time picker',
}

const fr: typeof en = {
  hours: 'Heures',
  minutes: 'Minutes',
  seconds: 'Secondes',
  period: 'AM/PM',
  now: 'Maintenant',
  done: 'Terminé',
  open: 'Ouvrir le sélecteur d’heure',
}

const vi: typeof en = {
  hours: 'Giờ',
  minutes: 'Phút',
  seconds: 'Giây',
  period: 'SA/CH',
  now: 'Bây giờ',
  done: 'Xong',
  open: 'Mở bộ chọn giờ',
}

/** The time input's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const timeInputMessages = defineMessages('time-input', en, { fr, vi })
