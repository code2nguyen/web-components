import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The group's accessible name when it has no `label`. */
  addressGroup: 'Address',
  /** The country picker. */
  country: 'Country or region',
  /** A region picker's placeholder. */
  select: 'Select',
  /** A field's label when it may be left empty: `{0}` is the label. */
  optional: (label: string) => `${label} (optional)`,
  /** The message for an empty required field: `{0}` is its label. */
  required: (label: string) => `${label} is required`,
  /** The message for a postal code that does not match the country's format: `{0}` is its label, `{1}` an example. */
  postalInvalid: (label: string, example: string) => `${label} should look like ${example}`,
  /** Announced when a suggestion fills the address. */
  filled: 'Address filled in',
  // Field labels.
  address: 'Address',
  addressLine1: 'Address line 1',
  street: 'Street address',
  apartment: 'Apartment, suite, etc.',
  addressLine2: 'Address line 2',
  building: 'Building, floor',
  city: 'City',
  town: 'Town or city',
  cityWard: 'City / ward',
  suburb: 'Suburb',
  district: 'District',
  neighborhood: 'Neighbourhood',
  colonia: 'Colonia',
  state: 'State',
  province: 'Province',
  prefecture: 'Prefecture',
  county: 'County',
  emirate: 'Emirate',
  region: 'State / region',
  area: 'Area',
  zip: 'ZIP code',
  postcode: 'Postcode',
  postalCode: 'Postal code',
  pin: 'PIN code',
  cep: 'CEP',
  eircode: 'Eircode',
}

/** The address field's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const addressFieldMessages = defineMessages('address-field', en)
