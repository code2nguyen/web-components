import { addTranslations } from '@c2n/core/localize.js'
import { emojiPickerMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof emojiPickerMessages.en = {
  label: 'Sélecteur d’émojis',
  search: 'Rechercher un émoji',
  categories: 'Catégories d’émojis',
  recent: 'Utilisés récemment',
  results: 'Résultats',
  smileysEmotion: 'Smileys et émotions',
  peopleBody: 'Personnes et corps',
  animalsNature: 'Animaux et nature',
  foodDrink: 'Nourriture et boissons',
  travelPlaces: 'Voyages et lieux',
  activities: 'Activités',
  objects: 'Objets',
  symbols: 'Symboles',
  flags: 'Drapeaux',
  noResults: (query) => `Aucun émoji pour « ${query} »`,
  resultCount: (count) => (count === 1 ? '1 émoji trouvé' : `${count} émojis trouvés`),
  placeholder: 'Choisissez un émoji',
  skinTone: 'Teint',
  currentSkinTone: (tone) => `Teint : ${tone}`,
  tone0: 'Par défaut',
  tone1: 'Clair',
  tone2: 'Moyennement clair',
  tone3: 'Moyen',
  tone4: 'Moyennement foncé',
  tone5: 'Foncé',
}

addTranslations({ fr: { 'emoji-picker': fr } })
