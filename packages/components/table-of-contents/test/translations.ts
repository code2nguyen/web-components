import { addTranslations } from '@c2n/core/localize.js'
import { tableOfContentsMessages } from '../src/messages.js'
import { indexBarMessages } from '../src/index-bar-messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof tableOfContentsMessages.en = {
  label: 'Sur cette page',
}

const vi: typeof tableOfContentsMessages.en = {
  label: 'Trên trang này',
}

const indexBarFr: typeof indexBarMessages.en = {
  label: 'Index alphabétique',
}

const indexBarVi: typeof indexBarMessages.en = {
  label: 'Chỉ mục',
}

addTranslations({ fr: { 'table-of-contents': fr, 'index-bar': indexBarFr }, vi: { 'table-of-contents': vi, 'index-bar': indexBarVi } })
