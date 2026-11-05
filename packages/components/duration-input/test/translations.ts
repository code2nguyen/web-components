import { addTranslations } from '@c2n/core/localize.js'
import { durationInputMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof durationInputMessages.en = {
  placeholder: 'ex. 1 h 30 min',
  preview: (duration) => `= ${duration}`,
  badInput: 'Saisissez une durée comme 1 h 30 min',
  valueMissing: 'Saisissez une durée',
  rangeUnderflow: (min) => `Saisissez ${min} ou plus`,
  rangeOverflow: (max) => `Saisissez ${max} ou moins`,
  weekWords: 'sem semaine semaines',
  dayWords: 'j jour jours',
  hourWords: 'heure heures',
  minuteWords: 'mn minute minutes',
  secondWords: 'seconde secondes',
}

addTranslations({ fr: { 'duration-input': fr } })
