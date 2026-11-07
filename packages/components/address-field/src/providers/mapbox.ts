import type { AddressProvider } from '../provider.js'
import { streetLine } from '../provider.js'
import type { AddressValue } from '../formats.js'

export interface MapboxSearchOptions {
  /** A public Mapbox access token, restricted to your site's URLs. */
  accessToken: string
}

interface Context {
  address?: { name?: string; address_number?: string; street_name?: string }
  street?: { name?: string }
  postcode?: { name?: string }
  place?: { name?: string }
  locality?: { name?: string }
  neighborhood?: { name?: string }
  region?: { name?: string; region_code?: string }
  country?: { country_code?: string }
}

/**
 * An `AddressProvider` on the Mapbox Search Box API, with `fetch` and no SDK. What is typed in the first line is sent
 * to Mapbox, with a session token that groups the requests of one search for billing.
 */
export function mapboxSearchProvider(options: MapboxSearchOptions): AddressProvider {
  let session = ''
  const token = () => (session ||= globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2))
  return {
    async suggest(query, { country, locale, signal }) {
      const params = new URLSearchParams({ q: query, access_token: options.accessToken, session_token: token(), language: locale, types: 'address' })
      if (country) params.set('country', country.toLowerCase())
      const response = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?${params}`, { signal })
      if (!response.ok) throw new Error(`Mapbox suggest failed: ${response.status}`)
      const data = (await response.json()) as { suggestions?: { mapbox_id: string; name: string; full_address?: string; place_formatted?: string }[] }
      return (data.suggestions ?? []).map((suggestion) => ({
        id: suggestion.mapbox_id,
        label: suggestion.name,
        description: suggestion.place_formatted ?? suggestion.full_address,
      }))
    },
    async resolve(id, { signal }) {
      const params = new URLSearchParams({ access_token: options.accessToken, session_token: token() })
      session = ''
      const response = await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(id)}?${params}`, { signal })
      if (!response.ok) throw new Error(`Mapbox retrieve failed: ${response.status}`)
      const data = (await response.json()) as { features?: { properties?: { context?: Context } }[] }
      return fromMapbox(data.features?.[0]?.properties?.context ?? {})
    },
  }
}

/** An address from a Mapbox feature's context. */
export function fromMapbox(context: Context): Partial<AddressValue> {
  const country = (context.country?.country_code ?? '').toUpperCase()
  const address = context.address
  return {
    line1:
      address?.address_number || address?.street_name
        ? streetLine(country, address.address_number ?? '', address.street_name ?? context.street?.name ?? '')
        : (address?.name ?? ''),
    line2: '',
    city: context.place?.name ?? context.locality?.name ?? '',
    district: context.neighborhood?.name ?? '',
    region: context.region?.region_code ?? context.region?.name ?? '',
    postalCode: context.postcode?.name ?? '',
    country,
  }
}
