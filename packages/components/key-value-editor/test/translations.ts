import { addTranslations } from '@c2n/core/localize.js'
import { tierEditorMessages } from '../src/tier-editor-messages.js'

// The French an app would add: the library ships its text in English only.

const tierFr: typeof tierEditorMessages.en = {
  from: 'De',
  upTo: "Jusqu'à",
  rate: 'Taux',
  boundField: (column, tier, from) => `${column}, palier ${tier}, à partir de ${from}`,
  rateField: (column, tier) => `${column}, palier ${tier}`,
  noLimit: 'Sans limite',
  to: 'à',
  addTier: 'Ajouter un palier',
  removeTier: (tier) => `Supprimer le palier ${tier}`,
  empty: 'Aucun palier',
  valueMissing: 'Ajoutez au moins un palier.',
  notNumber: 'Saisissez un nombre.',
  notAbove: (bound) => `Doit dépasser ${bound}.`,
  notBelow: (from) => `Doit valoir au moins ${from}.`,
  openNotLast: 'Seul le dernier palier peut être sans limite.',
  previewAt: (quantity) => `Pour ${quantity}`,
  term: (units, rate) => `${units} × ${rate}`,
  total: (total) => `= ${total}`,
  tierValue: (tier, value) => `palier ${tier} : ${value}`,
  noTier: (quantity) => `Aucun palier ne couvre ${quantity}.`,
}

addTranslations({ fr: { 'tier-editor': tierFr } })
