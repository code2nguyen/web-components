import { addTranslations } from '@c2n/core/localize.js'
import { selectMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof selectMessages.en = {
  valueMissing: 'Veuillez sélectionner une option.',
  searchLabel: 'Filtrer les options',
  searchPlaceholder: 'Rechercher…',
  empty: 'Aucune option correspondante',
  loading: 'Chargement…',
  create: (label: string) => `Créer « ${label} »`,
}

const vi: typeof selectMessages.en = {
  valueMissing: 'Vui lòng chọn một mục.',
  searchLabel: 'Lọc các mục',
  searchPlaceholder: 'Tìm kiếm…',
  empty: 'Không có mục phù hợp',
  loading: 'Đang tải…',
  create: (label: string) => `Tạo “${label}”`,
}

addTranslations({ fr: { select: fr }, vi: { select: vi } })
