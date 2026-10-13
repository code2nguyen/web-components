import { defineMessages } from '@c2n/core/localize.js'

const en = {
  label: 'Resize panels',
}

const fr: typeof en = {
  label: 'Redimensionner les panneaux',
}

const vi: typeof en = {
  label: 'Đổi kích thước bảng',
}

/** The split panel's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const splitPanelMessages = defineMessages('split-panel', en, { fr, vi })
