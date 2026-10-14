import { addTranslations } from '@c2n/core/localize.js'
import { splitPanelMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof splitPanelMessages.en = {
  label: 'Redimensionner les panneaux',
}

const vi: typeof splitPanelMessages.en = {
  label: 'Đổi kích thước bảng',
}

addTranslations({ fr: { 'split-panel': fr }, vi: { 'split-panel': vi } })
