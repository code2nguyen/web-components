/**
 * Every country at Natural Earth's 1:50m scale, about 750 KB: the map to use when the reader zooms in, or when
 * small countries and islands must be visible. Same keys and borders as `world-110m`.
 */
// Imported as text and parsed once: the published module then holds one compact string, not a megabyte of literals.
import topology from 'world-atlas/countries-50m.json?raw'
import type { Topology } from 'topojson-specification'
import { worldSource } from './world-source.js'

export default worldSource('world-50m', JSON.parse(topology) as Topology)
