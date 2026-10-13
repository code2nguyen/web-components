import { addTranslations } from '@c2n/core/localize.js'
import { timeInputMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof timeInputMessages.en = {
  hours: 'Heures',
  minutes: 'Minutes',
  seconds: 'Secondes',
  period: 'AM/PM',
  now: 'Maintenant',
  done: 'Terminé',
  open: 'Ouvrir le sélecteur d’heure',
}

const vi: typeof timeInputMessages.en = {
  hours: 'Giờ',
  minutes: 'Phút',
  seconds: 'Giây',
  period: 'SA/CH',
  now: 'Bây giờ',
  done: 'Xong',
  open: 'Mở bộ chọn giờ',
}

addTranslations({ fr: { 'time-input': fr }, vi: { 'time-input': vi } })
