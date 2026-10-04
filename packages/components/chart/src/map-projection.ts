/**
 * Projection for `c2-map-chart`, done by d3-geo before ECharts sees the geometry.
 *
 * ECharts can take a projection, but it applies it to each vertex on its own. A ring that crosses the antimeridian
 * (Russia's Chukotka, Fiji) then jumps from one edge of the map to the other and is drawn as a stripe across it, and
 * a long edge stays straight where the projection should curve it. d3 projects through a stream that cuts at the
 * antimeridian and resamples curved edges, so the map projects with d3 and hands ECharts flat shapes through an
 * identity projection.
 */
import { geoAlbersUsa, geoEqualEarth, geoEquirectangular, geoGraticule, geoMercator, geoNaturalEarth1, geoPath, geoStream, type GeoProjection } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry, MultiPolygon } from 'geojson'
import type { MapFeatureProperties, MapProjection } from './maps/map-source.js'

/** What `c2-map-chart` projects with: a point forward, a point back, and the stream d3 draws through. */
export type PlanarProjection = Pick<GeoProjection, 'stream' | 'invert'> & ((point: [number, number]) => [number, number] | null)

/** The projection ECharts is given: the coordinates are already planar, and ECharts must neither flip nor squash them. */
export const IDENTITY_PROJECTION = {
  project: (point: number[]): number[] => point,
  unproject: (point: number[]): number[] => point,
}

/** The d3 projection behind a name, or `undefined` for `none`, whose coordinates are drawn as they are. */
export function projectionFor(name: MapProjection): PlanarProjection | undefined {
  switch (name) {
    case 'equal-earth':
      return geoEqualEarth()
    case 'natural-earth':
      return geoNaturalEarth1()
    case 'mercator':
      return geoMercator()
    case 'equirectangular':
      return geoEquirectangular()
    case 'albers-usa':
      return geoAlbersUsa() as unknown as PlanarProjection
    default:
      return undefined
  }
}

/** Twice the signed area of a ring. With y pointing down, d3's exterior rings come out positive and holes negative. */
function ringArea(ring: [number, number][]): number {
  let area = 0
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[(index + 1) % ring.length]
    area += x1 * y2 - x2 * y1
  }
  return area
}

function contains(ring: [number, number][], [x, y]: [number, number]): boolean {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, yi] = ring[index]
    const [xj, yj] = ring[previous]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** One region's geometry, projected and cut at the antimeridian, as planar polygons. `null` when nothing is visible. */
export function projectGeometry(geometry: Geometry, projection: PlanarProjection): MultiPolygon | null {
  const rings: [number, number][][] = []
  let ring: [number, number][] | null = null
  let inPolygon = false
  geoStream(
    geometry,
    projection.stream({
      point: (x, y) => ring?.push([x, y]),
      lineStart: () => (ring = []),
      lineEnd: () => {
        if (ring && inPolygon && ring.length > 2) rings.push(ring)
        ring = null
      },
      polygonStart: () => (inPolygon = true),
      polygonEnd: () => (inPolygon = false),
      sphere: () => undefined,
    }),
  )
  const exteriors = rings.filter((item) => ringArea(item) > 0).map((item) => [item])
  for (const hole of rings.filter((item) => ringArea(item) < 0)) exteriors.find(([outer]) => contains(outer, hole[0]))?.push(hole)
  if (exteriors.length === 0) return null
  // GeoJSON rings are closed: the first position repeats at the end.
  return { type: 'MultiPolygon', coordinates: exteriors.map((polygon) => polygon.map((item) => [...item, item[0]])) }
}

/** Every feature projected to the plane. Features the projection cannot show at all (Albers USA outside the US) are dropped. */
export function projectFeatures<T extends MapFeatureProperties>(
  features: Feature<Geometry, T>[],
  projection: PlanarProjection,
): FeatureCollection<MultiPolygon, T> {
  const projected: Feature<MultiPolygon, T>[] = []
  for (const item of features) {
    const geometry = item.geometry ? projectGeometry(item.geometry, projection) : null
    if (geometry) projected.push({ ...item, geometry })
  }
  return { type: 'FeatureCollection', features: projected }
}

/**
 * The planar box around `features`, or around a `[west, south, east, north]` box in degrees, as ECharts'
 * `boundingCoords`: `[[x0, y0], [x1, y1]]`. A degree box follows its parallels, as a map reader expects.
 */
export function planarBounds(
  target: Feature[] | [number, number, number, number],
  projection: PlanarProjection | undefined,
): [[number, number], [number, number]] | null {
  const object: Geometry | FeatureCollection =
    typeof target[0] === 'number'
      ? geoGraticule()
          .extent([
            [target[0] as number, target[1] as number],
            [target[2] as number, target[3] as number],
          ])
          .outline()
      : { type: 'FeatureCollection', features: target as Feature[] }
  const [[x0, y0], [x1, y1]] = geoPath(projection ?? null).bounds(object)
  return [x0, y0, x1, y1].every(Number.isFinite) && x1 > x0 && y1 > y0
    ? [
        [x0, y0],
        [x1, y1],
      ]
    : null
}
