import { addTranslations } from '@c2n/core/localize.js'
import { addressFieldMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof addressFieldMessages.en = {
  addressGroup: 'Adresse',
  country: 'Pays ou région',
  select: 'Choisir',
  optional: (label) => `${label} (facultatif)`,
  required: (label) => `Saisissez ${label.toLowerCase()}`,
  postalInvalid: (label, example) => `${label} doit ressembler à ${example}`,
  filled: 'Adresse remplie',
  address: 'Adresse',
  addressLine1: 'Adresse, ligne 1',
  street: 'Rue',
  apartment: 'Appartement, étage, etc.',
  addressLine2: 'Adresse, ligne 2',
  building: 'Bâtiment, étage',
  city: 'Ville',
  town: 'Ville',
  cityWard: 'Ville / arrondissement',
  suburb: 'Quartier',
  district: 'District',
  neighborhood: 'Quartier',
  colonia: 'Colonia',
  state: 'État',
  province: 'Province',
  prefecture: 'Préfecture',
  county: 'Comté',
  emirate: 'Émirat',
  region: 'État / région',
  area: 'Zone',
  zip: 'Code ZIP',
  postcode: 'Code postal',
  postalCode: 'Code postal',
  pin: 'Code PIN',
  cep: 'CEP',
  eircode: 'Eircode',
}

addTranslations({ fr: { 'address-field': fr } })
