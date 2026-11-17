import { addTranslations } from '@c2n/core/localize.js'
import { passwordFieldMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.
const fr: { [K in keyof typeof passwordFieldMessages.en]: string } = {
  generate: 'Générer un mot de passe',
  suggestion: 'Mot de passe suggéré',
  regenerate: 'En générer un autre',
  copy: 'Copier le mot de passe',
  use: 'Utiliser ce mot de passe',
  kind: 'Type de mot de passe',
  password: 'Mot de passe',
  passphrase: 'Phrase de passe',
  length: 'Longueur',
  lowercase: 'Minuscules (a–z)',
  uppercase: 'Majuscules (A–Z)',
  numbers: 'Chiffres (0–9)',
  symbols: 'Symboles (!@#)',
  words: 'Mots',
  separator: 'Séparateur',
  capitalize: 'Majuscule à chaque mot',
  includeNumber: 'Ajouter un chiffre',
  strength: 'Robustesse de la suggestion',
  entropy: 'environ {0} bits',
  noSuggestion: 'Aucune suggestion ne respecte les règles de ce champ.',
}

addTranslations({ fr: { 'password-field': fr } })
