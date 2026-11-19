import { addTranslations } from '@c2n/core/localize.js'
import { googleMapMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.
const fr: { [K in keyof typeof googleMapMessages.en]: string } = {
  loadingMap: 'Chargement de la carte…',
  loadingStreetView: 'Chargement de Street View…',
  missingKey: 'Définissez une clé API Google Maps pour afficher cette carte.',
  loadFailed: 'La carte n’a pas pu être chargée.',
  authFailed: 'Google Maps a refusé la clé API.',
  noImagery: 'Street View n’a pas d’images près de ce lieu.',
  pegman: 'Déposez le bonhomme sur la carte pour regarder autour.',
}

addTranslations({ fr: { 'google-map': fr } })
