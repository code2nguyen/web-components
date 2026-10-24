import { addTranslations } from '@c2n/core/localize.js'
import { tableOfContentsMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof tableOfContentsMessages.en = {
  label: 'Sur cette page',
}

const vi: typeof tableOfContentsMessages.en = {
  label: 'Trên trang này',
}

addTranslations({ fr: { 'table-of-contents': fr }, vi: { 'table-of-contents': vi } })
