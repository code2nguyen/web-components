import { addTranslations } from '@c2n/core/localize.js'
import { autocompleteMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof autocompleteMessages.en = {
  loading: 'Chargement des suggestions…',
  loadError: 'Impossible de charger les suggestions.',
  empty: 'Aucune suggestion trouvée.',
  clear: 'Effacer',
  suggestions: 'Suggestions',
  suggestionsFor: (label) => `Suggestions pour ${label}`,
  valueMissing: 'Veuillez renseigner ce champ.',
}

const vi: typeof autocompleteMessages.en = {
  loading: 'Đang tải gợi ý…',
  loadError: 'Không thể tải gợi ý.',
  empty: 'Không tìm thấy gợi ý nào.',
  clear: 'Xóa',
  suggestions: 'Gợi ý',
  suggestionsFor: (label) => `Gợi ý cho ${label}`,
  valueMissing: 'Vui lòng điền vào trường này.',
}

addTranslations({ fr: { autocomplete: fr }, vi: { autocomplete: vi } })
