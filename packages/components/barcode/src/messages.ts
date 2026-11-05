import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The code's accessible name: `{0}` is the format (`EAN-13`), `{1}` the encoded value. */
  label: (format: string, value: string) => `Barcode, ${format}: ${value}`,
  /** The accessible name while there is nothing to draw. */
  barcode: 'Barcode',
  /** Shown in place of the code while there is no value. */
  empty: 'No value',
  /** Shown in place of the code when the value cannot be encoded in the format. */
  unencodable: "Can't encode this value",
}

/** The barcode's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const barcodeMessages = defineMessages('barcode', en)
