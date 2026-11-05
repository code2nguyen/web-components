import type { AddressProvider, AddressSuggestion } from '../provider.js'
import { streetLine } from '../provider.js'
import type { AddressValue } from '../formats.js'

export interface GooglePlacesOptions {
  /** A Maps Platform key with the Places API (New) enabled, restricted to your site's referrers. */
  apiKey: string
  /** Narrows suggestions to these place types; street addresses and buildings by default. */
  types?: string[]
}

interface Component {
  longText?: string
  shortText?: string
  types?: string[]
}

/**
 * An `AddressProvider` on the Google Places API (New), with `fetch` and no SDK. What is typed in the first line is sent
 * to Google, with a session token that groups the requests of one search for billing.
 */
export function googlePlacesProvider(options: GooglePlacesOptions): AddressProvider {
  let session = ''
  const token = () => (session ||= globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2))
  const headers = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': options.apiKey }
  return {
    async suggest(query, { country, locale, signal }) {
      const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          input: query,
          languageCode: locale,
          sessionToken: token(),
          includedPrimaryTypes: options.types ?? ['street_address', 'premise', 'subpremise', 'route'],
          ...(country ? { includedRegionCodes: [country.toLowerCase()] } : {}),
        }),
      })
      if (!response.ok) throw new Error(`Places autocomplete failed: ${response.status}`)
      const data = (await response.json()) as {
        suggestions?: {
          placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } }
        }[]
      }
      return (data.suggestions ?? []).flatMap((suggestion): AddressSuggestion[] => {
        const place = suggestion.placePrediction
        if (!place) return []
        return [
          {
            id: place.placeId,
            label: place.structuredFormat?.mainText?.text ?? place.text?.text ?? '',
            description: place.structuredFormat?.secondaryText?.text,
          },
        ]
      })
    },
    async resolve(id, { locale, signal }) {
      const query = new URLSearchParams({ languageCode: locale, sessionToken: token() })
      session = ''
      const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?${query}`, {
        headers: { ...headers, 'X-Goog-FieldMask': 'addressComponents' },
        signal,
      })
      if (!response.ok) throw new Error(`Place details failed: ${response.status}`)
      const data = (await response.json()) as { addressComponents?: Component[] }
      return fromGoogle(data.addressComponents ?? [])
    },
  }
}

/** An address from Google's address components. */
export function fromGoogle(components: Component[]): Partial<AddressValue> {
  const find = (...types: string[]) => components.find((component) => types.some((type) => component.types?.includes(type)))
  const country = find('country')?.shortText ?? ''
  return {
    line1: streetLine(country, find('street_number')?.longText ?? '', find('route')?.longText ?? find('premise')?.longText ?? ''),
    line2: find('subpremise')?.longText ?? '',
    city: find('locality', 'postal_town')?.longText ?? find('administrative_area_level_2')?.longText ?? '',
    district: find('sublocality_level_1', 'sublocality', 'neighborhood')?.longText ?? '',
    region: find('administrative_area_level_1')?.shortText ?? '',
    postalCode: find('postal_code')?.longText ?? '',
    country,
  }
}
