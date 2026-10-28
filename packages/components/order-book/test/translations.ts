import { addTranslations } from '@c2n/core/localize.js'
import { orderBookMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof orderBookMessages.en = {
  label: 'Carnet d’ordres',
  asks: 'Ventes',
  bids: 'Achats',
  price: 'Prix',
  priceIn: (quote) => `Prix (${quote})`,
  size: 'Quantité',
  sizeIn: (base) => `Quantité (${base})`,
  total: 'Total',
  bid: 'Achat',
  ask: 'Vente',
  grouping: 'Regroupement des prix',
  spread: (value, percent) => `Écart ${value} (${percent})`,
  mid: 'Prix médian',
  last: 'Dernier prix',
  own: 'votre ordre',
  loading: 'En attente du carnet…',
  empty: 'Aucun ordre',
}

addTranslations({ fr: { 'order-book': fr } })
