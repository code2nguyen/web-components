import { addTranslations } from '@c2n/core/localize.js'
import { meterMessages } from '../src/messages.js'
import { rangeIndicatorMessages } from '../src/range-indicator-messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof meterMessages.en = {
  label: 'Jauge',
  total: (value, max) => `${value} sur ${max}`,
  segment: (label, value) => `${label} : ${value}`,
  overage: 'Dépassement',
}

const rangeFr: typeof rangeIndicatorMessages.en = {
  label: 'Plage',
  valueInBand: (value, band) => `${value}, ${band}`,
}

addTranslations({ fr: { meter: fr, 'range-indicator': rangeFr } })
