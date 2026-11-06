import { addTranslations } from '@c2n/core/localize.js'
import { imageCompareMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof imageCompareMessages.en = {
  compare: 'Comparer les images',
  compareNamed: (before, after) => `Comparer : ${before} / ${after}`,
  value: (before, after) => `${before} avant, ${after} après`,
}

addTranslations({ fr: { 'image-compare': fr } })
