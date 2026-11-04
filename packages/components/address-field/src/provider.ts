import type { AddressValue } from './formats.js'

/** A suggestion for the first address line. */
export interface AddressSuggestion {
  /** What `resolve` needs to fetch the full address. */
  id: string
  label: string
  description?: string
}

/** What the provider is told with each request. */
export interface AddressProviderOptions {
  /** The country picked, as an ISO 3166-1 alpha-2 code. */
  country: string
  /** The page's language, for the provider's results. */
  locale: string
  signal: AbortSignal
}

/**
 * An address search service: `suggest` answers what was typed in the first line, and `resolve` turns the suggestion
 * picked into a full address. Write one for any service; `googlePlacesProvider` and `mapboxSearchProvider` wrap two.
 */
export interface AddressProvider {
  suggest(query: string, options: AddressProviderOptions): Promise<AddressSuggestion[]>
  resolve(id: string, options: Omit<AddressProviderOptions, 'country'>): Promise<Partial<AddressValue>>
}

/** Countries that write the house number before the street. */
export const NUMBER_FIRST = new Set(['US', 'CA', 'AU', 'NZ', 'GB', 'IE', 'IN', 'SG', 'MY', 'PH', 'ZA', 'JP', 'FR', 'LU', 'IL', 'HK', 'TH', 'KR'])

/** The first line from a house number and a street, in the country's order. */
export function streetLine(country: string, number: string, street: string): string {
  if (!number) return street
  if (!street) return number
  return NUMBER_FIRST.has(country.toUpperCase()) ? `${number} ${street}` : `${street} ${number}`
}
