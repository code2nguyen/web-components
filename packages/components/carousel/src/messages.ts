import { defineMessages } from '@c2n/core/localize.js'

const en = {
  label: 'Carousel',
  carousel: 'carousel',
  slide: 'slide',
  previous: 'Previous slide',
  next: 'Next slide',
  indicators: 'Choose slide',
  goTo: (index: number, _count: number) => `Go to slide ${index}`,
  slideLabel: (index: number, count: number) => `${index} of ${count}`,
  play: 'Start slide rotation',
  pause: 'Stop slide rotation',
}

const fr: typeof en = {
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

const vi: typeof en = {
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

/** The carousel's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const carouselMessages = defineMessages('carousel', en, { fr, vi })
