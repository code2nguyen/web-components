import { addTranslations } from '@c2n/core/localize.js'
import { secretFieldMessages } from '../src/messages.js'
import { totpCodeMessages } from '../src/totp-code-messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof secretFieldMessages.en = {
  show: 'Afficher le secret',
  copy: 'Copier le secret',
  copied: 'Copié',
  regenerate: 'Régénérer le secret',
  hidden: 'Masqué',
  hiddenEnding: (end) => `Masqué, se termine par ${end}`,
  hiddenStarting: (start) => `Commence par ${start}, masqué`,
  hiddenBetween: (start, end) => `Commence par ${start}, masqué, se termine par ${end}`,
  empty: 'Aucun secret',
}

const frCode: typeof totpCodeMessages.en = {
  ...fr,
  show: 'Afficher le code',
  copy: 'Copier le code',
  empty: 'Aucun code',
  unavailable: 'Code indisponible',
  period: (seconds) => `Nouveau code toutes les ${seconds} secondes`,
}

addTranslations({ fr: { 'secret-field': fr, 'totp-code': frCode } })
