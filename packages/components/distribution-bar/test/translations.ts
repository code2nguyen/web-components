import { addTranslations } from '@c2n/core/localize.js'
import { distributionBarMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof distributionBarMessages.en = {
  label: 'Répartition',
  other: 'Autres',
  empty: 'Aucune donnée',
  summary: (name, parts) => `${name} : ${parts}`,
  part: (label, share) => `${label} ${share}`,
  both: (share, value) => `${share} · ${value}`,
  below: (smallest) => `<${smallest}`,
}

addTranslations({ fr: { 'distribution-bar': fr } })
