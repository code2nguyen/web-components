import { addTranslations } from '@c2n/core/localize.js'
import { wheelPickerMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof wheelPickerMessages.en = {
  label: 'Choisir une valeur',
  wheel: (index, count) => `Roue ${index} sur ${count}`,
}

addTranslations({ fr: { 'wheel-picker': fr } })
