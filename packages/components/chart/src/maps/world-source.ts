import type { Topology } from 'topojson-specification'
import { ISO_CODES } from './iso-codes.js'
import { topologyFeatures, type MapSource } from './map-source.js'

/** Natural Earth leaves these without an ISO code. Kosovo has the user-assigned code most datasets use. */
const UNASSIGNED: Readonly<Record<string, readonly [alpha2: string, alpha3: string]>> = { Kosovo: ['XK', 'XKX'] }

/** Antarctica: left out, as on most thematic world maps, where it would be the largest shape and hold no data. */
const ANTARCTICA = '010'

/**
 * A world map from a world-atlas topology. Each country carries `name`, `id` (ISO 3166-1 numeric), `iso_a2` and
 * `iso_a3`, and joins on `iso_a3` by default. A country Natural Earth gives no code (Northern Cyprus, Somaliland)
 * joins by its name instead.
 */
export function worldSource(id: string, topology: Topology): MapSource {
  const features = topologyFeatures(topology, 'countries')
    .filter((country) => country.properties.id !== ANTARCTICA)
    .map((country) => {
      const codes = (country.properties.id ? ISO_CODES[String(country.properties.id)] : undefined) ?? UNASSIGNED[country.properties.name]
      return { ...country, properties: { ...country.properties, iso_a2: codes?.[0], iso_a3: codes?.[1] } }
    })
  return {
    id,
    features: { type: 'FeatureCollection', features },
    key: 'iso_a3',
    projection: 'equal-earth',
    attribution: 'Natural Earth (public domain), via world-atlas (ISC)',
  }
}
