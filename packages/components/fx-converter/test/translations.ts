import { addTranslations } from '@c2n/core/localize.js'
import { fxConverterMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof fxConverterMessages.en = {
  fromLabel: 'Vous envoyez',
  toLabel: 'Le destinataire reçoit',
  toExactLabel: 'Le destinataire reçoit exactement',
  fee: 'Frais',
  converted: 'Montant converti',
  rate: 'Taux de change',
  rateLine: (from, rate, to) => `1 ${from} = ${rate} ${to}`,
  guaranteed: (left) => `Garanti pendant ${left}`,
  expired: 'Taux expiré',
  indicative: 'Taux indicatif',
  newRate: 'Nouveau taux',
  swap: 'Inverser les devises',
  overMax: (limit) => `Vous pouvez envoyer jusqu’à ${limit}`,
  announceTo: (amount) => `Le destinataire reçoit ${amount}`,
  announceFrom: (amount) => `Vous envoyez ${amount}`,
}

addTranslations({ fr: { 'fx-converter': fr } })
