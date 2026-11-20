import { addTranslations } from '@c2n/core/localize.js'
import { paginationMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof paginationMessages.en = {
  label: 'Pagination',
  previous: 'Précédent',
  next: 'Suivant',
  first: 'Première',
  last: 'Dernière',
  pageSize: 'Lignes par page :',
  range: (start, end, total) => `${start}–${end} sur ${total}`,
  page: (page, pageCount) => `Page ${page} sur ${pageCount}`,
  goToPage: (page) => `Aller à la page ${page}`,
  jump: (page, count) => `Aller à la page ${page}, ${count} pages sautées`,
}

addTranslations({ fr: { pagination: fr } })
