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

/** The carousel's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const carouselMessages = defineMessages('carousel', en)
