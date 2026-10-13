import { defineMessages } from '@c2n/core/localize.js'

const en = {
  loading: 'Loading suggestions…',
  loadError: 'Could not load suggestions.',
  empty: 'No suggestions found.',
  clear: 'Clear',
  suggestions: 'Suggestions',
  suggestionsFor: (label: string) => `${label} suggestions`,
  valueMissing: 'Please fill out this field.',
}

const fr: typeof en = {
  loading: 'Chargement des suggestions…',
  loadError: 'Impossible de charger les suggestions.',
  empty: 'Aucune suggestion trouvée.',
  clear: 'Effacer',
  suggestions: 'Suggestions',
  suggestionsFor: (label) => `Suggestions pour ${label}`,
  valueMissing: 'Veuillez renseigner ce champ.',
}

const vi: typeof en = {
  loading: 'Đang tải gợi ý…',
  loadError: 'Không thể tải gợi ý.',
  empty: 'Không tìm thấy gợi ý nào.',
  clear: 'Xóa',
  suggestions: 'Gợi ý',
  suggestionsFor: (label) => `Gợi ý cho ${label}`,
  valueMissing: 'Vui lòng điền vào trường này.',
}

/** The autocomplete's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const autocompleteMessages = defineMessages('autocomplete', en, { fr, vi })
