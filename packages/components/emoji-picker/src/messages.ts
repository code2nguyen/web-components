import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the picker. */
  label: 'Emoji picker',
  /** Placeholder and accessible name of the search field. */
  search: 'Search emoji',
  /** Accessible name of the row of category buttons. */
  categories: 'Emoji categories',
  /** Titles of the categories of the default set, and of the recently used and search result sections. */
  recent: 'Recently used',
  results: 'Search results',
  smileysEmotion: 'Smileys & emotion',
  peopleBody: 'People & body',
  animalsNature: 'Animals & nature',
  foodDrink: 'Food & drink',
  travelPlaces: 'Travel & places',
  activities: 'Activities',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
  /** Shown when a search matches nothing. */
  noResults: (query: string) => `No emoji found for “${query}”`,
  /** Announced with the number of matches after a search. */
  resultCount: (count: number) => (count === 1 ? '1 emoji found' : `${count} emoji found`),
  /** The preview line before an emoji is pointed at or focused. */
  placeholder: 'Pick an emoji',
  /** The skin-tone control and its six choices. */
  skinTone: 'Skin tone',
  currentSkinTone: (tone: string) => `Skin tone: ${tone}`,
  tone0: 'Default',
  tone1: 'Light',
  tone2: 'Medium-light',
  tone3: 'Medium',
  tone4: 'Medium-dark',
  tone5: 'Dark',
}

/** The emoji picker's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const emojiPickerMessages = defineMessages('emoji-picker', en)
