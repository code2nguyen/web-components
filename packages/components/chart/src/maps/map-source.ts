/**
 * The shape every map `c2-map-chart` draws: GeoJSON features whose properties carry the keys a row can join on.
 *
 * The bundled maps (`@c2n/chart/maps/*.js`) are built from TopoJSON at import time by the helpers below, so the
 * package ships the compact TopoJSON and converts it once per page.
 */
import { feature } from 'topojson-client'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'

/** The projections `c2-map-chart` knows by name. `none` draws the coordinates as they are (an SVG, or pre-projected data). */
export type MapProjection = 'equal-earth' | 'natural-earth' | 'mercator' | 'equirectangular' | 'albers-usa' | 'none'

/** Properties of one region. `name` is what the tooltip shows; any other property can be the join key. */
export interface MapFeatureProperties {
  name: string
  [key: string]: unknown
}

export type MapFeature = Feature<Geometry, MapFeatureProperties>

/** A bundled or prepared GeoJSON map. */
export interface MapSource {
  /** Stable identifier, used to register the geometry with the engine once per page. */
  id: string
  features: FeatureCollection<Geometry, MapFeatureProperties>
  /** The property rows join on unless `region-key` names another. */
  key: string
  /** The projection used unless `projection` names another. */
  projection: MapProjection
  /** Where the outlines come from, for the docs and for an application's credits. */
  attribution: string
}

/** Every feature of a TopoJSON object as GeoJSON, with `id` copied into the properties so it can be a join key. */
export function topologyFeatures(topology: Topology, objectName?: string): MapFeature[] {
  const name = objectName ?? Object.keys(topology.objects)[0]
  const object = topology.objects[name] as GeometryCollection | undefined
  if (!object) return []
  const collection = feature(topology, object) as
    FeatureCollection<Geometry, Record<string, unknown> | null> | Feature<Geometry, Record<string, unknown> | null>
  const features = 'features' in collection ? collection.features : [collection]
  return features.map((item) => ({
    ...item,
    properties: { ...item.properties, id: item.id === undefined ? undefined : String(item.id), name: String(item.properties?.name ?? item.id ?? '') },
  }))
}
