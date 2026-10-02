/**
 * The 50 US states and the District of Columbia from the US Census Bureau's 1:10m cartographic boundaries, about
 * 115 KB, drawn in the Albers USA projection with Alaska and Hawaii inset. Each state carries `name`, `id` (the
 * two-digit FIPS code) and `postal`, and joins on `postal` by default. The territories are left out: the Albers USA
 * projection has no place for them.
 */
// Imported as text and parsed once: the published module then holds one compact string, not a megabyte of literals.
import topology from 'us-atlas/states-10m.json?raw'
import type { Topology } from 'topojson-specification'
import { topologyFeatures, type MapSource } from './map-source.js'

const POSTAL: Readonly<Record<string, string>> = {
  '01': 'AL',
  '02': 'AK',
  '04': 'AZ',
  '05': 'AR',
  '06': 'CA',
  '08': 'CO',
  '09': 'CT',
  '10': 'DE',
  '11': 'DC',
  '12': 'FL',
  '13': 'GA',
  '15': 'HI',
  '16': 'ID',
  '17': 'IL',
  '18': 'IN',
  '19': 'IA',
  '20': 'KS',
  '21': 'KY',
  '22': 'LA',
  '23': 'ME',
  '24': 'MD',
  '25': 'MA',
  '26': 'MI',
  '27': 'MN',
  '28': 'MS',
  '29': 'MO',
  '30': 'MT',
  '31': 'NE',
  '32': 'NV',
  '33': 'NH',
  '34': 'NJ',
  '35': 'NM',
  '36': 'NY',
  '37': 'NC',
  '38': 'ND',
  '39': 'OH',
  '40': 'OK',
  '41': 'OR',
  '42': 'PA',
  '44': 'RI',
  '45': 'SC',
  '46': 'SD',
  '47': 'TN',
  '48': 'TX',
  '49': 'UT',
  '50': 'VT',
  '51': 'VA',
  '53': 'WA',
  '54': 'WV',
  '55': 'WI',
  '56': 'WY',
}

const features = topologyFeatures(JSON.parse(topology) as Topology, 'states')
  .filter((state) => String(state.properties.id) in POSTAL)
  .map((state) => ({ ...state, properties: { ...state.properties, postal: POSTAL[String(state.properties.id)] } }))

const source: MapSource = {
  id: 'us-states',
  features: { type: 'FeatureCollection', features },
  key: 'postal',
  projection: 'albers-usa',
  attribution: 'US Census Bureau cartographic boundaries, via us-atlas (ISC)',
}

export default source
