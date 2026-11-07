import { addTranslations } from '@c2n/core/localize.js'
import { barcodeMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof barcodeMessages.en = {
  label: (format, value) => `Code-barres, ${format} : ${value}`,
  barcode: 'Code-barres',
  empty: 'Aucune valeur',
  unencodable: 'Impossible de coder cette valeur',
}

addTranslations({ fr: { barcode: fr } })
