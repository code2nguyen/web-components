/**
 * Every country at Natural Earth's 1:110m scale, about 105 KB. The default map of `c2-map-chart`.
 *
 * Borders are Natural Earth's, which draws the boundaries in effect on the ground rather than any one government's
 * claim. An application that must show an official view passes its own outlines through `geo` instead.
 */
// Imported as text and parsed once: the published module then holds one compact string, not a megabyte of literals.
import topology from 'world-atlas/countries-110m.json?raw'
import type { Topology } from 'topojson-specification'
import { worldSource } from './world-source.js'

export default worldSource('world-110m', JSON.parse(topology) as Topology)
