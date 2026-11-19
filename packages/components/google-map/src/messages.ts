import { defineMessages } from '@c2n/core/localize.js'

const en = {
  // Shown in place of the map or panorama while the Google Maps API loads.
  loadingMap: 'Loading map…',
  loadingStreetView: 'Loading Street View…',
  // Shown in place of the map when it cannot be shown, one per `map-error` reason.
  missingKey: 'Set a Google Maps API key to show this map.',
  loadFailed: 'The map could not be loaded.',
  authFailed: 'Google Maps rejected the API key. Check its HTTP referrer and API restrictions.',
  noImagery: 'Street View has no imagery near this place.',
  // A `c2-google-street-view` linked to a map with `for`, before a place is picked.
  pegman: 'Drag the pegman onto the map to look around.',
}

/** The Google Maps elements' interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const googleMapMessages = defineMessages('google-map', en)

export type GoogleMapMessageKey = keyof typeof en
