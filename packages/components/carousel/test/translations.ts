import { addTranslations } from '@c2n/core/localize.js'
import { carouselMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof carouselMessages.en = {
  label: 'Carrousel',
  carousel: 'carrousel',
  slide: 'diapositive',
  previous: 'Diapositive précédente',
  next: 'Diapositive suivante',
  indicators: 'Choisir une diapositive',
  goTo: (index) => `Aller à la diapositive ${index}`,
  slideLabel: (index, count) => `${index} sur ${count}`,
  play: 'Lancer le défilement automatique',
  pause: 'Arrêter le défilement automatique',
}

const vi: typeof carouselMessages.en = {
  label: 'Trình chiếu',
  carousel: 'trình chiếu',
  slide: 'trang chiếu',
  previous: 'Trang chiếu trước',
  next: 'Trang chiếu tiếp theo',
  indicators: 'Chọn trang chiếu',
  goTo: (index) => `Đến trang chiếu ${index}`,
  slideLabel: (index, count) => `${index} trên ${count}`,
  play: 'Bắt đầu tự động chuyển trang',
  pause: 'Dừng tự động chuyển trang',
}

addTranslations({ fr: { carousel: fr }, vi: { carousel: vi } })
