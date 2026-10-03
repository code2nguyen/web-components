import { html, isServer, nothing, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { property, arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { getFieldValue } from '@c2n/core/data-helper.js'
import { geoArea, geoCentroid, geoDistance, geoInterpolate } from 'd3-geo'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type { Topology } from 'topojson-specification'
import mapStyles from './map-chart.scss?inline'
import { ChartBase, type ChartEventMap, type ChartLegendItem } from './chart-base.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import type { ChartAdapter, ChartBuildContext } from './chart-adapter.js'
import { loadECharts, type EchartsFeature } from './engines/echarts-loader.js'
import { columnValue, type NormalizeContext } from './chart-data.js'
import type { ChartFrame, ChartPointEventDetail, ChartRow, ChartSeriesConfig, ChartTooltipContext, ChartTooltipEntry } from './chart-types.js'
import { MAP_LAYER_CHANGE_EVENT, MAP_LAYER_TAG, type MapLayer, type MapLayerConfig } from './map-layer.js'
import { createMapScale, parseColor, formatColor, type MapScale } from './map-scale.js'
import { IDENTITY_PROJECTION, planarBounds, projectFeatures, projectionFor, type PlanarProjection } from './map-projection.js'
import { topologyFeatures, type MapFeature, type MapProjection, type MapSource } from './maps/map-source.js'
import './map-layer.js'

/** The maps bundled with the package, each loaded only when a chart names it. */
export type MapName = 'world-110m' | 'world-50m' | 'us-states'

/** Everything `geo` accepts: GeoJSON, a TopoJSON topology (its first object is drawn), or SVG markup. */
export type MapGeometryInput = FeatureCollection | Feature[] | Topology | string

const BUILT_IN_MAPS: Record<MapName, () => Promise<{ default: MapSource }>> = {
  'world-110m': () => import('./maps/world-110m.js'),
  'world-50m': () => import('./maps/world-50m.js'),
  'us-states': () => import('./maps/us-states.js'),
}

/** Named areas `extent` accepts, as `[west, south, east, north]` in degrees. */
const NAMED_AREAS: Record<string, [number, number, number, number]> = {
  africa: [-19, -36, 53, 38],
  asia: [26, -11, 150, 56],
  europe: [-25, 34, 45, 71],
  'middle-east': [25, 12, 63, 42],
  'north-america': [-170, 7, -52, 75],
  oceania: [110, -48, 180, 0],
  'south-america': [-82, -56, -34, 13],
}

/** The property ECharts names regions by. Written onto every feature, so the join key can be any property, or the id. */
const KEY_PROPERTY = '__c2Key'

/** The series index a hovered or clicked region is reported under: regions are not a series. */
const REGION_SERIES = -1

/** One region of the drawn map: every shape sharing a key, so a country of many islands is one region. */
export interface MapRegion {
  key: string
  name: string
  /** Position in the map's region list. */
  ordinal: number
  features: MapFeature[]
}

/** The geometry, joined to `region-key`. GeoJSON is registered with the engine once per projection it is drawn in. */
interface PreparedMap {
  /** Base of the names the geometry is registered under. */
  engineName: string
  kind: 'geojson' | 'svg'
  regions: MapRegion[]
  byKey: Map<string, MapRegion>
  projection: MapProjection
  anchors: Map<string, [number, number] | null>
  /** The features with their join key, in degrees. */
  features?: MapFeature[]
  /** The SVG markup with every region named. */
  svg?: string
  /** The engine map registered for each projection, and the planar geometry it was given. */
  registered: Map<MapProjection, { name: string; planar: FeatureCollection }>
}

/** `point-hover`/`point-click` detail on a map: the region the datum is, or sits in, and its source row. */
export interface MapPointEventDetail extends ChartPointEventDetail {
  region?: { key: string; name: string }
  /** The row behind the datum. `undefined` for a region with no data. */
  row?: ChartRow
}

/** What the tooltip slot and `renderTooltip` are handed on a map. */
export interface MapTooltipContext extends ChartTooltipContext {
  /** The hovered region, or the region a hovered point is placed in. */
  region?: { key: string; name: string }
  /** The row behind the hovered region, point or line. `undefined` for a region with no data. */
  row?: ChartRow
}

/** Detail of `selection-change`. */
export interface MapSelectionChangeEventDetail {
  /** Keys of the selected regions, in the order they were selected. */
  value: string[]
  regions: { key: string; name: string }[]
}

/** Detail of `view-change`. */
export interface MapViewChangeEventDetail {
  /** Zoom factor, `1` at the initial fit. */
  zoom: number
  /** The visible area as `[west, south, east, north]` in degrees, or `null` when the projection cannot say. */
  bounds: [number, number, number, number] | null
}

/** Detail of `unmatched-rows`. */
export interface MapUnmatchedRowsEventDetail {
  /** The `region-field` values that name no region of the map. */
  keys: string[]
}

/** Events fired by `c2-map-chart`, on top of every chart's. */
export interface MapChartEventMap extends ChartEventMap {
  'selection-change': CustomEvent<MapSelectionChangeEventDetail>
  'view-change': CustomEvent<MapViewChangeEventDetail>
  'unmatched-rows': CustomEvent<MapUnmatchedRowsEventDetail>
  input: Event
  change: Event
}

export interface MapChart {
  addEventListener: TypedAddEventListener<MapChart, MapChartEventMap>
  removeEventListener: TypedRemoveEventListener<MapChart, MapChartEventMap>
}

/** Values read from the host's `--c2-chart__region…`, `__scale…`, `__marker…` and `__flow…` properties. */
interface MapStyle {
  regionColor: string
  borderColor: string
  borderWidth: number
  hoverBorderColor: string
  hoverBorderWidth: number
  selectedColor: string
  selectedBorderColor: string
  selectedBorderWidth: number
  scaleStart: string
  scaleEnd: string
  scaleNegative: string
  scaleMid: string
  markerOpacity: number
  markerHoverOpacity: number
  markerBorderWidth: number
  markerMinSize: number
  markerMaxSize: number
  flowWidth: number
  flowMaxWidth: number
  flowOpacity: number
}

const STYLE_FALLBACK: MapStyle = {
  regionColor: '#f4f4f5',
  borderColor: '#ffffff',
  borderWidth: 0.5,
  hoverBorderColor: '#18181b',
  hoverBorderWidth: 1,
  selectedColor: '#dbeafe',
  selectedBorderColor: '#0265dc',
  selectedBorderWidth: 2,
  scaleStart: '#dce8fb',
  scaleEnd: '#0a3b8c',
  scaleNegative: '#c2410c',
  scaleMid: '#e4e4e7',
  markerOpacity: 0.5,
  markerHoverOpacity: 0.85,
  markerBorderWidth: 1,
  markerMinSize: 6,
  markerMaxSize: 40,
  flowWidth: 1.5,
  flowMaxWidth: 6,
  flowOpacity: 0.7,
}

/** A drawn point: `[lon, lat, size, diameter, row]`. */
type PointDatum = [number, number, number | null, number, number]

/** A drawn line. `row` is not read by the engine; it maps the item back to its row. */
interface LineDatum {
  coords: [number, number][]
  lineStyle: { width: number }
}

/** `unit_price` -> `Unit price`: a readable label for a field the author did not name. */
function humanize(field: string): string {
  const last = field.split('.').pop() ?? field
  const spaced = last.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

/** `color` at `alpha`, keeping the outline opaque while the fill stays translucent. */
function withAlpha(color: string, alpha: number): string {
  const rgba = parseColor(color)
  return rgba ? formatColor([rgba[0], rgba[1], rgba[2], rgba[3] * alpha]) : color
}

/** Geometry objects registered by this page, so the same map and key is registered with the engine once. */
const engineNames = new WeakMap<object, Map<string, string>>()
const svgNames = new Map<string, string>()
let mapCounter = 0

/**
 * A choropleth and point map drawn by ECharts on vector outlines: regions shaded by a value, with optional layers of
 * sized points and flow lines on top. The world (`world-110m`, `world-50m`) and US states (`us-states`) maps ship
 * with the package and load only when named; `geo` or `src` draws any GeoJSON, TopoJSON or SVG instead.
 *
 * ```html
 * <c2-map-chart region-field="country" value-field="revenue" value-label="Revenue"
 *   data='[{ "country": "BRA", "revenue": 1270 }, { "country": "DEU", "revenue": 2210 }]'>
 * </c2-map-chart>
 * ```
 *
 * Rows join regions through `region-field`, whose values are read against the map's `region-key`: ISO 3166-1
 * alpha-3 codes on the world maps (`iso_a2`, `id` for the numeric code and `name` also work), USPS codes on
 * `us-states`. Rows that match no region are reported by `unmatched-rows`. Regions without a row keep
 * `--c2-chart__region--background-color` and are listed as "No data" in the legend.
 *
 * `scale` picks a sequential ramp or a diverging one around a midpoint; `thresholds` turns either into stepped classes.
 * `c2-map-layer` children add points and lines, each with its own `data` and legend entry. `selection` makes the
 * regions selectable, as a form control whose `value` is the selected keys.
 *
 * Unlike the other charts, a data change rebuilds the engine options, because region colours are options rather than
 * series data. Maps are not a streaming chart.
 *
 * @tag c2-map-chart
 *
 * @slotcomponent c2-map-layer
 *
 * @event {CustomEvent<MapSelectionChangeEventDetail>} selection-change - Fired after the reader selects or deselects a region. `detail.value` holds the selected keys. Does not bubble. `input` and `change` fire alongside it.
 * @event {CustomEvent<MapViewChangeEventDetail>} view-change - Fired after the reader zooms or pans, or a zoom button is pressed. `detail.bounds` is the visible area in degrees. Does not bubble.
 * @event {Event} input - Fired with `selection-change` after the reader changes the selection, for two-way bindings such as `v-model`. Bubbles.
 * @event {Event} change - Fired with `selection-change` after the reader changes the selection, as a form control does. Bubbles.
 * @event {CustomEvent<MapUnmatchedRowsEventDetail>} unmatched-rows - Fired after the data or the map changes when some rows name no region of the map. `detail.keys` lists them. Does not bubble.
 *
 * @csspart zoom-controls - The group of zoom buttons shown when `roam` allows zooming.
 * @csspart zoom-control - One zoom button.
 * @csspart scale-legend - The colour key at the end of the built-in legend.
 *
 * @cssproperty {color} [--c2-chart__region--background-color=#f4f4f5] - Fill of a region without data.
 * @cssproperty {color} [--c2-chart__region--border-color=#ffffff] - Colour of the borders between regions.
 * @cssproperty {pixel} [--c2-chart__region--border-width=0.5px] - Width of the borders between regions.
 * @cssproperty {color} [--c2-chart__region__hover--border-color=#18181b] - Outline of the hovered region.
 * @cssproperty {pixel} [--c2-chart__region__hover--border-width=1px] - Outline width of the hovered region.
 * @cssproperty {color} [--c2-chart__region__selected--background-color=#dbeafe] - Fill of a selected region that has no data. A region with data keeps its scale colour.
 * @cssproperty {color} [--c2-chart__region__selected--border-color=#0265dc] - Outline of a selected region.
 * @cssproperty {pixel} [--c2-chart__region__selected--border-width=2px] - Outline width of a selected region.
 * @cssproperty {color} [--c2-chart__scale-start--color=#dce8fb] - Low end of a sequential scale.
 * @cssproperty {color} [--c2-chart__scale-end--color=#0a3b8c] - High end of a sequential scale, and positive end of a diverging one.
 * @cssproperty {color} [--c2-chart__scale-negative--color=#c2410c] - Negative end of a diverging scale.
 * @cssproperty {color} [--c2-chart__scale-mid--color=#e4e4e7] - Neutral midpoint of a diverging scale.
 * @cssproperty {length} [--c2-chart__scale-legend--width=160px] - Length of the colour key's gradient or row of classes.
 * @cssproperty {opacity} [--c2-chart__marker--opacity=0.5] - Fill opacity of a point. The outline stays opaque.
 * @cssproperty {opacity} [--c2-chart__marker__hover--opacity=0.85] - Fill opacity of the hovered point.
 * @cssproperty {pixel} [--c2-chart__marker--border-width=1px] - Outline width of a point.
 * @cssproperty {pixel} [--c2-chart__marker--min-size=6px] - Diameter of the smallest point, and of a point with no size.
 * @cssproperty {pixel} [--c2-chart__marker--max-size=40px] - Diameter of the point holding a layer's largest size.
 * @cssproperty {pixel} [--c2-chart__flow--width=1.5px] - Stroke width of a line without a width field.
 * @cssproperty {pixel} [--c2-chart__flow--max-width=6px] - Stroke width of the line holding a layer's largest width value.
 * @cssproperty {opacity} [--c2-chart__flow--opacity=0.7] - Opacity of a line.
 * @cssproperty {pixel} [--c2-chart__zoom-control--size=28px] - Width and height of a zoom button.
 * @cssproperty {color} [--c2-chart__zoom-control--background-color=#ffffff] - Background of a zoom button.
 * @cssproperty {color} [--c2-chart__zoom-control__hover--background-color=#f4f4f5] - Background of a hovered zoom button.
 * @cssproperty {color} [--c2-chart__zoom-control--color=#18181b] - Icon colour of a zoom button.
 * @cssproperty {border} [--c2-chart__zoom-control--border=1px solid #e4e4e7] - Border of a zoom button.
 * @cssproperty {border-radius} [--c2-chart__zoom-control--border-radius=6px] - Corner radius of a zoom button.
 * @cssproperty {opacity} [--c2-chart__series__dimmed--opacity=0.25] - Opacity the other series (or slices) keep while one is highlighted.
 */
@customElement('c2-map-chart')
export class MapChart extends EchartsChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(mapStyles)]

  static formAssociated = true

  protected override readonly features: readonly EchartsFeature[] = ['geo', 'scatter', 'lines']

  private readonly internals = this.attachInternals()

  /** A bundled map: `world-110m` (the default), `world-50m` or `us-states`. Ignored when `geo` or `src` is set. */
  @property({ type: String }) map: MapName = 'world-110m'

  /** URL of a GeoJSON, TopoJSON or SVG file to draw instead of a bundled map. */
  @property({ type: String }) src = ''

  /** Geometry to draw instead of a bundled map: GeoJSON, a TopoJSON topology, or SVG markup. Property only. */
  @property({ attribute: false }) geo?: MapGeometryInput

  /**
   * Feature property a row's `region-field` is matched against. Defaults to the map's own key: `iso_a3` on the world
   * maps, `postal` on `us-states`, and `id` on your own GeoJSON. An SVG's regions are its elements' `id`s.
   */
  @property({ type: String, attribute: 'region-key' }) regionKey = ''

  /** Row field naming each row's region. */
  @property({ type: String, attribute: 'region-field' }) regionField = ''

  /** Row field holding the value regions are shaded by. Without it the regions are drawn plain. */
  @property({ type: String, attribute: 'value-field' }) valueField = ''

  /** Names the value in the tooltip and the colour key. Defaults to the humanized `value-field`. */
  @property({ type: String, attribute: 'value-label' }) valueLabel = ''

  /** Text appended to every formatted value, such as `%` or ` °C`. */
  @property({ type: String }) unit = ''

  /** Formats a value for the tooltip and the colour key. Property only; `unit` is not appended to its result. */
  @property({ attribute: false }) format?: (value: number) => string

  /**
   * How longitude and latitude become the plane. Defaults to the map's own: Equal Earth for the world, Albers USA for
   * `us-states`, Mercator for your own GeoJSON and `none` for an SVG, whose coordinates are drawn as they are.
   */
  @property({ type: String }) projection?: MapProjection

  /** `sequential` shades from light to dark; `diverging` runs two hues out from a neutral midpoint. */
  @property({ type: String }) scale: 'sequential' | 'diverging' = 'sequential'

  /**
   * The values the scale's ends sit at: `[min, max]`, or `[min, mid, max]` for a diverging scale. Defaults to the data's
   * extent, and for a diverging scale to a range symmetric around `0`.
   */
  @property({ converter: jsonPropertyConverter }) domain?: number[]

  /** Class breaks, such as `[-10, -5, 0, 5, 10]`, which turn the scale into stepped classes. A value equal to a break is in the upper class. */
  @property({ converter: jsonPropertyConverter }) thresholds?: number[]

  /** One colour per class of a stepped scale, overriding the ramp: `["#16a34a", "#d97706", "#dc2626"]`. */
  @property({ converter: jsonPropertyConverter, attribute: 'scale-colors' }) scaleColors?: string[]

  /** One name per class of a stepped scale, shown in the colour key instead of the break values. */
  @property({ converter: jsonPropertyConverter, attribute: 'scale-labels' }) scaleLabels?: string[]

  /**
   * How the reader moves the map. `zoom` shows zoom buttons and lets a zoomed map be dragged; `pan` allows dragging
   * only; `both` adds the mouse wheel and pinch, which then no longer scroll the page.
   */
  @property({ type: String }) roam: 'none' | 'zoom' | 'pan' | 'both' = 'none'

  /** The largest zoom factor the reader can reach. */
  @property({ type: Number, attribute: 'max-zoom' }) maxZoom = 8

  /**
   * The area the map is fitted to: region keys (`"FRA DEU ITA"`), a named area (`europe`, `africa`, `asia`,
   * `middle-east`, `north-america`, `south-america`, `oceania`), or a `[west, south, east, north]` box in degrees.
   */
  @property({ type: String }) extent = ''

  /** Whether clicking a region selects it: `single` keeps one region selected, `multiple` toggles each one. */
  @property({ type: String }) selection: 'none' | 'single' | 'multiple' = 'none'

  /** Keys of the selected regions. As an attribute, separated by semicolons: `value="FRA;DEU"`. */
  @property({ converter: arrayPropertyConverter }) value: string[] = []

  /** Form field name. The form receives one entry per selected region. */
  @property({ type: String }) name = ''

  /** The geometry once loaded and joined to `region-key`. */
  @state() private prepared?: PreparedMap

  /** The `c2-map-layer` children, as snapshots. */
  @state() private layers: MapLayerConfig[] = []

  /** Layers switched off from the legend, by index. */
  @state() private hiddenLayers = new Set<number>()

  /** Why the geometry could not be loaded, shown in the error state. */
  @state() private geometryError = ''

  /** Bumped on every data change: region colours are options, so data has to rebuild them. */
  @state() private dataRevision = 0

  #loadToken = 0
  #geometryReady: Promise<void> = Promise.resolve()
  /** Per layer, the row each drawn item stands for, in draw order: the engine reports the draw index. */
  #layerRows: number[][] = []
  #joinCache?: { frame: ChartFrame | undefined; prepared: PreparedMap | undefined; revision: number; rows: Map<string, number>; unmatched: string[] }
  #lastUnmatched = ''

  constructor() {
    super()
    this.tooltip = 'item'
  }

  // ------------------------------------------------------------- lifecycle ---

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener(MAP_LAYER_CHANGE_EVENT, this.#handleLayerChange)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener(MAP_LAYER_CHANGE_EVENT, this.#handleLayerChange)
  }

  protected override firstUpdated(): void {
    super.firstUpdated()
    this.renderRoot.querySelector('slot.definitions')?.addEventListener('slotchange', () => this.#collectLayers())
  }

  /** The base fast path pushes data straight to the engine; a map's data also recolours its regions. */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has('data') || changed.has('revision')) return true
    return super.shouldUpdate(changed)
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (!this.hasUpdated && !isServer) this.#collectLayers()
    // Set before the base reads `changed`, so the data change counts as a presentation change too.
    if (changed.has('data') || changed.has('revision')) this.dataRevision += 1
    if (!isServer && (!this.hasUpdated || changed.has('map') || changed.has('src') || changed.has('geo') || changed.has('regionKey'))) {
      this.#geometryReady = this.#loadGeometry()
    }
    super.willUpdate(changed)
    // A map draws its outlines with or without rows, so it always has a frame to project.
    if (!this.frame) this.frame = { x: new Float64Array(0), columns: [], length: 0, capacity: 0, revision: 0 }
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    if (changed.has('value') || changed.has('name')) this.#syncFormValue()
    if (changed.has('dataRevision') || changed.has('prepared')) this.#reportUnmatched()
  }

  protected override get rendersWithoutData(): boolean {
    return true
  }

  protected override get readyToDraw(): boolean {
    return this.prepared !== undefined
  }

  protected override replacesOptions(changed: PropertyValues): boolean {
    const previousLayers = changed.get('layers') as MapLayerConfig[] | undefined
    return (
      changed.has('prepared') ||
      changed.has('projection') ||
      changed.has('extent') ||
      (previousLayers !== undefined && previousLayers.length !== this.layers.length)
    )
  }

  protected override validationError(): string {
    return this.geometryError
  }

  protected override async createAdapter(): Promise<ChartAdapter> {
    await this.#geometryReady
    return super.createAdapter()
  }

  // ------------------------------------------------------------ geometry ---

  async #loadGeometry(): Promise<void> {
    const token = ++this.#loadToken
    try {
      const prepared = await this.#prepare()
      // Registration needs the engine, which the first chart on the page loads here rather than in `createAdapter`.
      const engine = await loadECharts([...this.features, 'legend'], this.renderer)
      if (token !== this.#loadToken) return
      this.#engine = engine
      if (prepared.kind === 'svg') engine.registerMap(prepared.engineName, { svg: prepared.svg ?? '' })
      this.geometryError = ''
      this.prepared = prepared
    } catch (error) {
      if (token !== this.#loadToken) return
      this.prepared = undefined
      this.geometryError = error instanceof Error ? error.message : String(error)
    }
  }

  /** The engine namespace, held to register a GeoJSON map the first time it is drawn in a projection. */
  #engine?: { registerMap(name: string, source: unknown): void }

  /** Resolves `geo`, `src` or `map` into regions, and the engine-ready GeoJSON or SVG they come from. */
  async #prepare(): Promise<PreparedMap> {
    let input: MapGeometryInput | MapSource
    if (this.geo !== undefined) input = this.geo
    else if (this.src) {
      const response = await fetch(this.src)
      if (!response.ok) throw new Error(`The map at ${this.src} could not be loaded (${response.status}).`)
      const text = await response.text()
      input = text.trimStart().startsWith('<') ? text : (JSON.parse(text) as MapGeometryInput)
    } else {
      const load = BUILT_IN_MAPS[this.map]
      if (!load) throw new Error(`Unknown map "${this.map}". Use world-110m, world-50m or us-states, or pass your own geometry through geo or src.`)
      input = (await load()).default
    }
    if (typeof input === 'string') return this.#prepareSvg(input)
    return this.#prepareGeoJSON(input)
  }

  #prepareGeoJSON(input: Exclude<MapGeometryInput, string> | MapSource): PreparedMap {
    let source: object = input
    let features: MapFeature[]
    let defaultKey = 'id'
    let projection: MapProjection = 'mercator'
    if ('features' in input && 'attribution' in input) {
      features = input.features.features
      defaultKey = input.key
      projection = input.projection
    } else if (Array.isArray(input)) {
      features = input as MapFeature[]
    } else if ((input as { type?: string }).type === 'Topology') {
      features = topologyFeatures(input as Topology)
    } else if ((input as { type?: string }).type === 'FeatureCollection') {
      features = (input as FeatureCollection).features as MapFeature[]
    } else {
      throw new Error('geo must be a GeoJSON FeatureCollection, an array of features, a TopoJSON topology or SVG markup.')
    }
    if ('features' in input && 'attribution' in input) source = input.features

    const key = this.regionKey || defaultKey
    const regions: MapRegion[] = []
    const byKey = new Map<string, MapRegion>()
    const engineFeatures = features.map((item) => {
      const properties = (item.properties ?? {}) as Record<string, unknown>
      const name = String(properties.name ?? item.id ?? '')
      const raw = key === 'id' ? (properties.id ?? item.id) : properties[key]
      // A shape without the key (a disputed area with no ISO code) joins by its name, so it stays a region of its own.
      const regionKey = raw === undefined || raw === null || raw === '' ? name : String(raw)
      let region = byKey.get(regionKey)
      if (!region) {
        region = { key: regionKey, name, ordinal: regions.length, features: [] }
        regions.push(region)
        byKey.set(regionKey, region)
      }
      const feature = { ...item, properties: { ...properties, name, [KEY_PROPERTY]: regionKey } } as MapFeature
      region.features.push(feature)
      return feature
    })

    let names = engineNames.get(source)
    if (!names) engineNames.set(source, (names = new Map()))
    let engineName = names.get(key)
    if (!engineName) names.set(key, (engineName = `c2-map-${(mapCounter += 1)}`))
    return { engineName, kind: 'geojson', regions, byKey, projection, anchors: new Map(), features: engineFeatures, registered: new Map() }
  }

  /** ECharts names an SVG region by its `name` attribute; the component's contract is the `id`, so it is copied over. */
  #prepareSvg(markup: string): PreparedMap {
    const document = new DOMParser().parseFromString(markup, 'image/svg+xml')
    const root = document.documentElement
    if (root.localName !== 'svg') throw new Error('The map SVG could not be parsed.')
    const regions: MapRegion[] = []
    const byKey = new Map<string, MapRegion>()
    for (const element of Array.from(root.querySelectorAll('[id], [name]'))) {
      if (!['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'g'].includes(element.localName)) continue
      const key = element.getAttribute('name') || element.getAttribute('id') || ''
      if (!key || byKey.has(key)) continue
      element.setAttribute('name', key)
      const title = element.querySelector(':scope > title')?.textContent?.trim()
      const region: MapRegion = { key, name: element.getAttribute('data-name') || title || key, ordinal: regions.length, features: [] }
      regions.push(region)
      byKey.set(key, region)
    }
    const serialized = new XMLSerializer().serializeToString(root)
    let engineName = svgNames.get(serialized)
    if (!engineName) svgNames.set(serialized, (engineName = `c2-map-${(mapCounter += 1)}`))
    return { engineName, kind: 'svg', regions, byKey, projection: 'none', anchors: new Map(), svg: serialized, registered: new Map() }
  }

  /** The regions of the drawn map, in map order. Empty until the geometry has loaded. */
  get regions(): readonly MapRegion[] {
    return this.prepared?.regions ?? []
  }

  /** Where a point placed by region sits: the centroid of the region's largest shape, so France is not placed at sea. */
  #anchor(key: string): [number, number] | null {
    const prepared = this.prepared
    if (!prepared || prepared.kind === 'svg') return null
    const region = prepared.byKey.get(key) ?? this.#regionByLooseKey(key)
    if (!region) return null
    const cached = prepared.anchors.get(region.key)
    if (cached !== undefined) return cached
    let largest: Feature<Polygon> | undefined
    let largestArea = -1
    for (const item of region.features) {
      const geometry = item.geometry
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
      for (const coordinates of polygons) {
        const polygon: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } }
        const area = geoArea(polygon)
        if (area > largestArea) {
          largestArea = area
          largest = polygon
        }
      }
    }
    const anchor = largest ? (geoCentroid(largest) as [number, number]) : region.features[0] ? (geoCentroid(region.features[0]) as [number, number]) : null
    prepared.anchors.set(region.key, anchor)
    return anchor
  }

  /** A key matched without regard to case, for data that spells `fra` where the map has `FRA`. */
  #regionByLooseKey(key: string): MapRegion | undefined {
    const wanted = key.trim().toLowerCase()
    return this.prepared?.regions.find((region) => region.key.toLowerCase() === wanted)
  }

  /** `boundingCoords` for `extent`, in the projected plane: `[[x0, y0], [x1, y1]]`, or `null` to fit the whole map. */
  #extentBounds(): [[number, number], [number, number]] | null {
    const prepared = this.prepared
    const extent = this.extent.trim()
    if (!prepared || prepared.kind === 'svg' || !extent) return null
    const projection = this.#projection()
    if (extent.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(extent)
        if (Array.isArray(parsed) && parsed.length === 4 && parsed.every((value) => typeof value === 'number')) {
          return planarBounds(parsed as [number, number, number, number], projection)
        }
      } catch {
        return null
      }
      return null
    }
    const named = NAMED_AREAS[extent.toLowerCase()]
    if (named) return planarBounds(named, projection)
    // Regions are measured where they are drawn, so a country across the antimeridian is boxed by its visible pieces.
    const features = extent
      .split(/[\s,;]+/)
      .map((key) => prepared.byKey.get(key) ?? this.#regionByLooseKey(key))
      .flatMap((region) => region?.features ?? [])
    return features.length > 0 ? planarBounds(features, projection) : null
  }

  /** The d3 projection the map is drawn in, or `undefined` when its coordinates are drawn as they are. */
  #projection(): PlanarProjection | undefined {
    return this.prepared?.kind === 'geojson' ? projectionFor(this.#projectionName()) : undefined
  }

  /** A place in degrees, on the drawn plane. `null` where the projection cannot show it (Albers USA outside the US). */
  private toPlane(place: [number, number] | null): [number, number] | null {
    if (!place) return null
    const projection = this.#projection()
    if (!projection) return place
    const point = projection(place)
    return point && Number.isFinite(point[0]) && Number.isFinite(point[1]) ? point : null
  }

  /** The engine map the geometry is drawn as: GeoJSON is projected and registered once per projection. */
  #engineMap(prepared: PreparedMap): string {
    if (prepared.kind === 'svg') return prepared.engineName
    const name = this.#projectionName()
    const registered = prepared.registered.get(name)
    if (registered) return registered.name
    const projection = projectionFor(name)
    const features = prepared.features ?? []
    const planar: FeatureCollection = projection ? projectFeatures(features, projection) : { type: 'FeatureCollection', features }
    const engineName = `${prepared.engineName}:${name}`
    this.#engine?.registerMap(engineName, planar)
    prepared.registered.set(name, { name: engineName, planar })
    return engineName
  }

  // ---------------------------------------------------------------- layers ---

  #handleLayerChange = (event: Event): void => {
    // The layers' change event is internal plumbing; it must not escape the chart.
    event.stopPropagation()
    this.#collectLayers()
  }

  #collectLayers(): void {
    const found = Array.from(this.querySelectorAll<MapLayer>(MAP_LAYER_TAG))
    if (!isServer && typeof customElements !== 'undefined') for (const element of found) customElements.upgrade(element)
    this.layers = found.filter((element) => typeof element.toConfig === 'function' && !element.hidden).map((element) => element.toConfig())
  }

  /** Key a layer is highlighted by: its label, or its position when it has none. */
  #layerKey(layer: MapLayerConfig, index: number): string {
    return layer.label || `layer-${index + 1}`
  }

  /** Shows or hides one layer, as the legend does in `toggle` mode. */
  setLayerVisible(index: number, visible: boolean): void {
    const next = new Set(this.hiddenLayers)
    if (visible) next.delete(index)
    else next.add(index)
    this.hiddenLayers = next
  }

  // ------------------------------------------------------------------ data ---

  /** The value series, when `value-field` is set: what the frame reads and the tooltip names. */
  override get resolvedSeries(): ChartSeriesConfig[] {
    if (!this.valueField) return []
    return [{ field: this.valueField, label: this.valueLabel || humanize(this.valueField), format: this.format }]
  }

  protected override normalizeContext(): NormalizeContext {
    const base = super.normalizeContext()
    return { ...base, labelField: this.regionField, signature: `${base.signature}|${this.regionField}|${this.valueField}` }
  }

  protected override reshapesFrame(changed: PropertyValues): boolean {
    return super.reshapesFrame(changed) || changed.has('regionField') || changed.has('valueField')
  }

  /** Which row each region key joins, and the keys no region matched. Cached per frame and geometry. */
  #join(): { rows: Map<string, number>; unmatched: string[] } {
    const frame = this.frame
    const prepared = this.prepared
    const cache = this.#joinCache
    if (cache && cache.frame === frame && cache.prepared === prepared && cache.revision === frame?.revision) return cache
    const rows = new Map<string, number>()
    const unmatched: string[] = []
    const labels = frame?.labels ?? []
    for (let row = 0; row < (frame?.length ?? 0); row += 1) {
      const key = labels[row]
      if (key === undefined) continue
      const region = prepared?.byKey.get(key) ?? this.#regionByLooseKey(key)
      if (region) rows.set(region.key, row)
      else unmatched.push(key)
    }
    this.#joinCache = { frame, prepared, revision: frame?.revision ?? 0, rows, unmatched }
    return this.#joinCache
  }

  /** The value a region is shaded by, or `null` when it has no row (or no value field is set). */
  #valueOf(key: string): { row: number | undefined; value: number | null } {
    const row = this.#join().rows.get(key)
    const column = this.frame?.columns[0]
    return { row, value: row === undefined || !column || !this.valueField ? null : columnValue(column, row) }
  }

  #rowObject(row: number | undefined): ChartRow | undefined {
    if (row === undefined || !Array.isArray(this.data)) return undefined
    const value: unknown = this.data[row]
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as ChartRow) : undefined
  }

  #reportUnmatched(): void {
    if (!this.prepared || !this.regionField) return
    const { unmatched } = this.#join()
    const signature = `${this.prepared.engineName}|${this.dataRevision}`
    if (unmatched.length === 0 || signature === this.#lastUnmatched) return
    this.#lastUnmatched = signature
    this.dispatchEvent(new CustomEvent<MapUnmatchedRowsEventDetail>('unmatched-rows', { detail: { keys: unmatched } }))
  }

  /** The scale regions are shaded with, or `undefined` when there is nothing to shade. */
  #scale(style: MapStyle = this.#style()): MapScale | undefined {
    if (!this.valueField || !this.prepared) return undefined
    const values: number[] = []
    for (const region of this.prepared.regions) {
      const { value } = this.#valueOf(region.key)
      if (value !== null) values.push(value)
    }
    if (values.length === 0) return undefined
    const diverging = this.scale === 'diverging'
    return createMapScale(
      {
        kind: this.scale,
        domain: this.domain ?? [],
        thresholds: this.thresholds,
        colors: this.scaleColors,
        start: diverging ? style.scaleNegative : style.scaleStart,
        end: style.scaleEnd,
        mid: style.scaleMid,
      },
      values,
    )
  }

  /** Per layer, the engine data: `[lon, lat, size, diameter, row]` points, largest first, or line items. */
  protected override projectData(): unknown[] {
    const style = this.#style()
    this.#layerRows = []
    return this.layers.map((layer, index) => {
      const rows: number[] = []
      this.#layerRows[index] = rows
      if (this.hiddenLayers.has(index)) return []
      return layer.type === 'lines' ? this.#lineData(layer, rows, style) : this.#pointData(layer, rows, style)
    })
  }

  #placeOf(value: unknown): [number, number] | null {
    if (Array.isArray(value) && value.length >= 2) {
      const lon = toNumber(value[0])
      const lat = toNumber(value[1])
      return lon === null || lat === null ? null : [lon, lat]
    }
    if (typeof value === 'object' && value !== null) {
      const place = value as { lon?: unknown; lat?: unknown }
      const lon = toNumber(place.lon)
      const lat = toNumber(place.lat)
      return lon === null || lat === null ? null : [lon, lat]
    }
    if (typeof value === 'string' && value) return this.#anchor(value)
    return null
  }

  #pointData(layer: MapLayerConfig, rows: number[], style: MapStyle): PointDatum[] {
    const points: PointDatum[] = []
    let largest = 0
    layer.data.forEach((row, index) => {
      const place = this.toPlane(
        layer.regionField
          ? this.#placeOf(String(getFieldValue(row, layer.regionField) ?? ''))
          : this.#placeOf([getFieldValue(row, layer.lonField), getFieldValue(row, layer.latField)]),
      )
      if (!place) return
      const size = layer.sizeField ? toNumber(getFieldValue(row, layer.sizeField)) : null
      if (size !== null) largest = Math.max(largest, size)
      points.push([place[0], place[1], size, 0, index])
    })
    for (const point of points) {
      const size = point[2]
      point[3] =
        size === null || size <= 0 || !(largest > 0) ? style.markerMinSize : Math.max(style.markerMinSize, style.markerMaxSize * Math.sqrt(size / largest))
    }
    // Larger points first, so the small ones stay on top and hoverable.
    points.sort((a, b) => b[3] - a[3])
    for (const point of points) rows.push(point[4])
    return points
  }

  #lineData(layer: MapLayerConfig, rows: number[], style: MapStyle): LineDatum[] {
    const items: LineDatum[] = []
    const widths = layer.data.map((row) => (layer.widthField ? toNumber(getFieldValue(row, layer.widthField)) : null))
    const largest = Math.max(0, ...widths.map((width) => width ?? 0))
    const flat = this.#projectionName() === 'none'
    layer.data.forEach((row, index) => {
      const from = this.#placeOf(getFieldValue(row, layer.fromField))
      const to = this.#placeOf(getFieldValue(row, layer.toField))
      if (!from || !to) return
      const value = widths[index]
      const width = value === null || !(largest > 0) ? style.flowWidth : 1 + (style.flowMaxWidth - 1) * Math.max(0, value / largest)
      const paths = layer.curve === 'geodesic' && !flat ? geodesic(from, to) : [[from, to]]
      for (const path of paths) {
        // A sample the projection cannot show (Albers USA outside the US) breaks the line rather than ending it.
        const coords = path.map((place) => this.toPlane(place)).filter((point): point is [number, number] => point !== null)
        if (coords.length < 2) continue
        items.push({ coords, lineStyle: { width } })
        rows.push(index)
      }
    })
    return items
  }

  // --------------------------------------------------------------- options ---

  /** Reads the map's custom properties through the probes the chart renders. */
  #style(): MapStyle {
    const root = this.renderRoot as ParentNode | undefined
    const probe = (name: string) => root?.querySelector<HTMLElement>(`.map-probe--${name}`)
    if (!probe('region') || typeof getComputedStyle !== 'function') return STYLE_FALLBACK
    const read = (name: string) => getComputedStyle(probe(name) as HTMLElement)
    const number = (value: string, fallback: number) => {
      const parsed = parseFloat(value)
      return Number.isFinite(parsed) ? parsed : fallback
    }
    const region = read('region')
    const hover = read('hover')
    const selected = read('selected')
    const marker = read('marker')
    const flow = read('flow')
    const markerMinSize = number(marker.width, STYLE_FALLBACK.markerMinSize)
    return {
      regionColor: region.color || STYLE_FALLBACK.regionColor,
      borderColor: region.borderTopColor || STYLE_FALLBACK.borderColor,
      borderWidth: number(region.borderTopWidth, STYLE_FALLBACK.borderWidth),
      hoverBorderColor: hover.borderTopColor || STYLE_FALLBACK.hoverBorderColor,
      hoverBorderWidth: number(hover.borderTopWidth, STYLE_FALLBACK.hoverBorderWidth),
      selectedColor: selected.color || STYLE_FALLBACK.selectedColor,
      selectedBorderColor: selected.borderTopColor || STYLE_FALLBACK.selectedBorderColor,
      selectedBorderWidth: number(selected.borderTopWidth, STYLE_FALLBACK.selectedBorderWidth),
      scaleStart: read('scale-start').color || STYLE_FALLBACK.scaleStart,
      scaleEnd: read('scale-end').color || STYLE_FALLBACK.scaleEnd,
      scaleNegative: read('scale-negative').color || STYLE_FALLBACK.scaleNegative,
      scaleMid: read('scale-mid').color || STYLE_FALLBACK.scaleMid,
      markerOpacity: number(marker.opacity, STYLE_FALLBACK.markerOpacity),
      markerHoverOpacity: number(read('marker-hover').opacity, STYLE_FALLBACK.markerHoverOpacity),
      markerBorderWidth: number(marker.borderTopWidth, STYLE_FALLBACK.markerBorderWidth),
      markerMinSize,
      markerMaxSize: Math.max(markerMinSize, number(marker.height, STYLE_FALLBACK.markerMaxSize)),
      flowWidth: number(flow.borderTopWidth, STYLE_FALLBACK.flowWidth),
      flowMaxWidth: number(flow.width, STYLE_FALLBACK.flowMaxWidth),
      flowOpacity: number(flow.opacity, STYLE_FALLBACK.flowOpacity),
    }
  }

  #projectionName(): MapProjection {
    if (this.prepared?.kind === 'svg') return 'none'
    return this.projection || this.prepared?.projection || 'equal-earth'
  }

  #geoOption(prepared: PreparedMap, style: MapStyle): Record<string, unknown> {
    const scale = this.#scale(style)
    const selected = new Set(this.value)
    const regions: Record<string, unknown>[] = []
    for (const region of prepared.regions) {
      const { value } = this.#valueOf(region.key)
      const isSelected = selected.has(region.key)
      if (value === null && !isSelected) continue
      const areaColor = value !== null && scale ? scale.colorOf(value) : isSelected ? style.selectedColor : style.regionColor
      const border = isSelected ? { borderColor: style.selectedBorderColor, borderWidth: style.selectedBorderWidth } : {}
      regions.push({
        name: region.key,
        itemStyle: { areaColor, ...border },
        emphasis: { itemStyle: { areaColor, ...(isSelected ? border : {}) } },
      })
    }
    const roam = this.roam === 'both' ? true : this.roam === 'zoom' || this.roam === 'pan' ? 'move' : false
    return {
      map: this.#engineMap(prepared),
      ...(prepared.kind === 'geojson' ? { nameProperty: KEY_PROPERTY } : {}),
      // Already projected by d3; the identity keeps ECharts from flipping and squashing the plane as it does to degrees.
      projection: prepared.kind === 'geojson' ? IDENTITY_PROJECTION : undefined,
      roam,
      scaleLimit: { min: 1, max: Math.max(1, this.maxZoom) },
      boundingCoords: this.#extentBounds(),
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      clip: true,
      selectedMode: false,
      label: { show: false },
      itemStyle: { areaColor: style.regionColor, borderColor: style.borderColor, borderWidth: style.borderWidth },
      emphasis: {
        label: { show: false },
        itemStyle: { areaColor: style.regionColor, borderColor: style.hoverBorderColor, borderWidth: style.hoverBorderWidth },
      },
      regions,
    }
  }

  protected override seriesOption(index: number, context: ChartBuildContext): Record<string, unknown> {
    const layer = this.layers[index]
    const { theme } = context
    const style = this.#style()
    const color = layer?.color ?? theme.palette[index % theme.palette.length]
    const highlighted = this.highlighted
    const dim = highlighted !== null && layer && highlighted !== this.#layerKey(layer, index) ? theme.dimmedOpacity : 1
    const name = layer ? (layer.label ?? this.#layerKey(layer, index)) : ''
    if (layer?.type === 'lines') {
      return {
        type: 'lines',
        name,
        coordinateSystem: 'geo',
        geoIndex: 0,
        polyline: layer.curve !== 'arc',
        z: 3,
        lineStyle: { color, opacity: style.flowOpacity * dim, width: style.flowWidth, curveness: layer.curve === 'arc' ? 0.25 : 0, cap: 'round' },
        emphasis: { lineStyle: { opacity: 1 } },
      }
    }
    return {
      type: 'scatter',
      name,
      coordinateSystem: 'geo',
      geoIndex: 0,
      z: 4,
      symbol: 'circle',
      symbolSize: (value: PointDatum) => value[3],
      itemStyle: { color: withAlpha(color, style.markerOpacity), borderColor: color, borderWidth: style.markerBorderWidth, opacity: dim },
      emphasis: { scale: false, itemStyle: { color: withAlpha(color, style.markerHoverOpacity), borderWidth: style.markerBorderWidth + 1 } },
      label: {
        show: Boolean(layer?.labels && layer.labelField),
        position: 'top',
        distance: 4,
        color: theme.color,
        fontSize: theme.fontSize,
        fontWeight: 600,
        textBorderColor: theme.surface,
        textBorderWidth: 3,
        formatter: (params: { value: PointDatum }) => {
          const row = layer?.data[params.value[4]]
          return row && layer?.labelField ? String(getFieldValue(row, layer.labelField) ?? '') : ''
        },
      },
    }
  }

  protected override coordinateSystem(): Record<string, unknown> {
    return {}
  }

  protected override buildOptions(context: ChartBuildContext): unknown {
    const { theme } = context
    const style = this.#style()
    const animate = this.animation === 'auto' && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      animationDurationUpdate: 0,
      animationEasing: 'cubicOut',
      color: theme.palette,
      textStyle: { fontFamily: theme.fontFamily === 'inherit' ? undefined : theme.fontFamily, fontSize: theme.fontSize, color: theme.color },
      legend: { show: false },
      geo: this.prepared ? this.#geoOption(this.prepared, style) : undefined,
      series: this.layers.map((_layer, index) => this.seriesOption(index, context)),
    }
  }

  // ----------------------------------------------------------- interaction ---

  /** Turns an engine report into the index pair the base hands to `tooltipContextAt` and `pointAt`. */
  #target(detail: { index: number; seriesIndex: number; name?: string; component?: string }): { index: number; seriesIndex: number } | undefined {
    if (detail.component === 'geo') {
      const region = this.prepared?.byKey.get(detail.name ?? '')
      return region ? { index: region.ordinal, seriesIndex: REGION_SERIES } : undefined
    }
    const row = this.#layerRows[detail.seriesIndex]?.[detail.index]
    return row === undefined ? undefined : { index: row, seriesIndex: detail.seriesIndex }
  }

  protected override handleEngineHover(detail: { index: number; seriesIndex: number; px: number; py: number; name?: string; component?: string } | null): void {
    const target = detail ? this.#target(detail) : undefined
    super.handleEngineHover(detail && target ? { ...target, px: detail.px, py: detail.py } : null)
  }

  protected override handleEngineClick(detail: { index: number; seriesIndex: number; name?: string; component?: string }): void {
    const target = this.#target(detail)
    if (!target) return
    const point = this.pointAt(target.index, target.seriesIndex)
    if (!point) return
    const event = new CustomEvent<ChartPointEventDetail>('point-click', { detail: point, cancelable: true })
    this.dispatchEvent(event)
    if (event.defaultPrevented) return
    if (target.seriesIndex === REGION_SERIES) {
      if (this.selection !== 'none' && point.region) this.#toggleRegion(point.region.key)
      return
    }
    const layer = this.layers[target.seriesIndex]
    if (layer && this.layers.length > 1) {
      const key = this.#layerKey(layer, target.seriesIndex)
      this.highlight(this.highlighted === key ? null : key)
    }
  }

  protected override handleEngineViewChange({ zoom }: { zoom: number }): void {
    this.dispatchEvent(new CustomEvent<MapViewChangeEventDetail>('view-change', { detail: { zoom, bounds: this.#visibleBounds() } }))
  }

  /**
   * The plot's corners in degrees: the view transform (a uniform scale and a translation from the plane to the plot)
   * is solved from two points of the plane, and the corners are inverted through d3.
   */
  #visibleBounds(): MapViewChangeEventDetail['bounds'] {
    const plot = this.plotElement
    const adapter = this.adapter
    if (!plot || !adapter?.convertToPixel) return null
    const qa = adapter.convertToPixel({ geoIndex: 0 }, [0, 0])
    const qb = adapter.convertToPixel({ geoIndex: 0 }, [100, 100])
    if (!qa || !qb) return null
    const scale = (qb[0] - qa[0]) / 100
    if (!Number.isFinite(scale) || scale === 0) return null
    const projection = this.#projection()
    const toDegrees = (x: number, y: number): number[] | null => {
      const plane: [number, number] = [(x - qa[0]) / scale, (y - qa[1]) / scale]
      return projection ? (projection.invert?.(plane) ?? null) : plane
    }
    const topLeft = toDegrees(0, 0)
    const bottomRight = toDegrees(plot.clientWidth, plot.clientHeight)
    if (!topLeft || !bottomRight || ![...topLeft, ...bottomRight].every(Number.isFinite)) return null
    return [topLeft[0], bottomRight[1], bottomRight[0], topLeft[1]]
  }

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): MapTooltipContext {
    const theme = this.themeController.theme
    if (detail.seriesIndex === REGION_SERIES) {
      const region = this.prepared?.regions[detail.index]
      const { row, value } = region ? this.#valueOf(region.key) : { row: undefined, value: null }
      const series = this.resolvedSeries[0]
      const entries: ChartTooltipEntry[] =
        series && row !== undefined
          ? [
              {
                seriesIndex: REGION_SERIES,
                series,
                value,
                formatted: this.#formatValue(value),
                color: value === null ? theme.mutedColor : (this.#scale()?.colorOf(value) ?? theme.palette[0]),
              },
            ]
          : []
      return {
        index: detail.index,
        x: row ?? -1,
        formattedX: region?.name ?? '',
        label: region?.name,
        entries,
        px: detail.px,
        py: detail.py,
        region: region ? { key: region.key, name: region.name } : undefined,
        row: this.#rowObject(row),
      }
    }
    const layer = this.layers[detail.seriesIndex]
    const row = layer?.data[detail.index]
    const color = layer?.color ?? theme.palette[detail.seriesIndex % theme.palette.length]
    const entries: ChartTooltipEntry[] = []
    const measure = layer?.type === 'lines' ? layer.widthField : layer?.sizeField
    if (layer && row && measure) {
      const value = toNumber(getFieldValue(row, measure))
      const label = (layer.type === 'lines' ? layer.widthLabel : layer.sizeLabel) || humanize(measure)
      entries.push({
        seriesIndex: detail.seriesIndex,
        series: { field: measure, label },
        value,
        formatted: value === null ? '—' : (layer.format?.(value) ?? this.formatValue(value)),
        color,
      })
    }
    const region = layer && row ? this.#layerRegion(layer, row) : undefined
    return {
      index: detail.index,
      x: detail.index,
      formattedX: layer && row ? this.#layerTitle(layer, row, detail.seriesIndex) : '',
      label: layer && row && layer.labelField ? String(getFieldValue(row, layer.labelField) ?? '') : undefined,
      entries,
      px: detail.px,
      py: detail.py,
      region: region ? { key: region.key, name: region.name } : undefined,
      row,
    }
  }

  /** The tooltip title of a point or line: its label, else where it goes, else the layer's name. */
  #layerTitle(layer: MapLayerConfig, row: ChartRow, index: number): string {
    if (layer.labelField) {
      const label = getFieldValue(row, layer.labelField)
      if (label !== undefined && label !== null && label !== '') return String(label)
    }
    if (layer.type === 'lines') {
      const name = (value: unknown) => (typeof value === 'string' ? (this.prepared?.byKey.get(value) ?? this.#regionByLooseKey(value))?.name || value : null)
      const from = name(getFieldValue(row, layer.fromField))
      const to = name(getFieldValue(row, layer.toField))
      if (from && to) return `${from} → ${to}`
    }
    return layer.label ?? this.#layerKey(layer, index)
  }

  #layerRegion(layer: MapLayerConfig, row: ChartRow): MapRegion | undefined {
    if (layer.type !== 'points' || !layer.regionField) return undefined
    const key = String(getFieldValue(row, layer.regionField) ?? '')
    return this.prepared?.byKey.get(key) ?? this.#regionByLooseKey(key)
  }

  protected override pointAt(index: number, seriesIndex: number): MapPointEventDetail | undefined {
    if (seriesIndex === REGION_SERIES) {
      const region = this.prepared?.regions[index]
      if (!region) return undefined
      const { row, value } = this.#valueOf(region.key)
      return {
        index: row ?? -1,
        seriesIndex,
        series: this.resolvedSeries[0] ?? { field: '' },
        x: row ?? -1,
        y: value,
        label: region.name,
        region: { key: region.key, name: region.name },
        row: this.#rowObject(row),
      }
    }
    const layer = this.layers[seriesIndex]
    const row = layer?.data[index]
    if (!layer || !row) return undefined
    const measure = layer.type === 'lines' ? layer.widthField : layer.sizeField
    const region = this.#layerRegion(layer, row)
    return {
      index,
      seriesIndex,
      series: { field: measure, label: layer.label },
      x: index,
      y: measure ? toNumber(getFieldValue(row, measure)) : null,
      label: layer.labelField ? String(getFieldValue(row, layer.labelField) ?? '') : undefined,
      size: layer.type === 'points' && layer.sizeField ? toNumber(getFieldValue(row, layer.sizeField)) : undefined,
      region: region ? { key: region.key, name: region.name } : undefined,
      row,
    }
  }

  #toggleRegion(key: string): void {
    const selected = this.value.includes(key)
    const next = this.selection === 'single' ? (selected ? [] : [key]) : selected ? this.value.filter((item) => item !== key) : [...this.value, key]
    this.value = next
    const regions = next.map((item) => ({ key: item, name: this.prepared?.byKey.get(item)?.name ?? item }))
    this.dispatchEvent(new CustomEvent<MapSelectionChangeEventDetail>('selection-change', { detail: { value: next, regions } }))
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  #syncFormValue(): void {
    if (this.value.length === 0) {
      this.internals.setFormValue(null)
      return
    }
    const data = new FormData()
    for (const key of this.value) data.append(this.name || 'value', key)
    this.internals.setFormValue(data)
  }

  formResetCallback(): void {
    this.value = arrayPropertyConverter.fromAttribute(this.getAttribute('value') ?? '')
  }

  /** The form this map belongs to, when it has a `name` inside one. */
  get form(): HTMLFormElement | null {
    return this.internals.form
  }

  /** Zooms in one step around the centre of the map. */
  zoomIn(): void {
    this.#zoomBy(1.5)
  }

  /** Zooms out one step around the centre of the map. */
  zoomOut(): void {
    this.#zoomBy(1 / 1.5)
  }

  /** Returns to the initial fit: the whole map, or the `extent` area. */
  resetView(): void {
    this.adapter?.setOptions({ geo: { zoom: 1, center: null } }, 'merge')
    this.handleEngineViewChange({ zoom: 1 })
  }

  #zoomBy(factor: number): void {
    const plot = this.plotElement
    if (!plot) return
    this.adapter?.dispatchAction?.({ type: 'geoRoam', geoIndex: 0, zoom: factor, originX: plot.clientWidth / 2, originY: plot.clientHeight / 2 })
  }

  // ---------------------------------------------------------------- legend ---

  protected override legendItems(): ChartLegendItem[] {
    const theme = this.themeController.theme
    return this.layers.map((layer, index) => ({
      label: layer.label ?? this.#layerKey(layer, index),
      color: layer.color ?? theme.palette[index % theme.palette.length],
      visible: !this.hiddenLayers.has(index),
      ...this.legendEntryState(this.#layerKey(layer, index), !this.hiddenLayers.has(index), (visible) => this.setLayerVisible(index, visible)),
      series: { field: this.#layerKey(layer, index), label: layer.label },
      index,
    }))
  }

  #formatValue(value: number | null): string {
    if (value === null) return '—'
    return this.format?.(value) ?? `${this.formatValue(value)}${this.unit}`
  }

  /** The colour key: a gradient or a row of classes, and a "No data" swatch when some region has no row. */
  protected override renderLegendExtras(): unknown {
    const style = this.#style()
    const scale = this.#scale(style)
    if (!scale || !this.prepared) return nothing
    const title = this.resolvedSeries[0]?.label ?? ''
    const missing = this.prepared.regions.some((region) => this.#valueOf(region.key).value === null)
    const noData = missing ? html`<span class="scale-no-data"><i style="background:${style.regionColor}"></i>No data</span>` : nothing
    if (scale.steps) {
      const labels = this.scaleLabels
      const key = labels
        ? html`<span class="scale-classes">
            ${scale.steps.map((step, index) => html`<span class="scale-class"><i style="background:${step.color}"></i>${labels[index] ?? ''}</span>`)}
          </span>`
        : html`<span class="scale-steps" role="img" aria-label=${this.#stepsLabel(scale)}>
            ${scale.steps.map(
              (step, index) =>
                html`<span class="scale-step" style="background:${step.color}"
                  >${index < scale.steps!.length - 1 ? html`<span class="scale-break">${this.#formatValue(step.to)}</span>` : nothing}</span
                >`,
            )}
          </span>`
      return html`<div class="scale-legend scale-legend--stepped" part="scale-legend"><span class="scale-title">${title}</span>${key}${noData}</div>`
    }
    const [min, ...rest] = scale.domain
    const max = rest[rest.length - 1]
    const mid = scale.domain.length === 3 ? scale.domain[1] : undefined
    return html`
      <div class="scale-legend" part="scale-legend">
        <span class="scale-title">${title}</span>
        <span class="scale-ramp" role="img" aria-label=${`${title}: ${this.#formatValue(min)} to ${this.#formatValue(max)}`}>
          <span class="scale-gradient" style="background:linear-gradient(90deg, ${scale.gradient().join(', ')})"></span>
          <span class="scale-ticks">
            <span>${this.#formatValue(min)}</span>${mid !== undefined ? html`<span>${this.#formatValue(mid)}</span>` : nothing}<span
              >${this.#formatValue(max)}</span
            >
          </span>
        </span>
        ${noData}
      </div>
    `
  }

  #stepsLabel(scale: MapScale): string {
    const breaks = (scale.steps ?? []).slice(0, -1).map((step) => this.#formatValue(step.to))
    return `${this.resolvedSeries[0]?.label ?? ''}: classes broken at ${breaks.join(', ')}`
  }

  // ---------------------------------------------------------------- render ---

  protected override defaultTooltip(context: MapTooltipContext): TemplateResult {
    const noData = context.region && !context.row && this.valueField && this.prepared?.byKey.has(context.region.key)
    return html`${super.defaultTooltip(context)}${noData ? html`<div class="tooltip-row"><span class="tooltip-label">No data</span></div>` : nothing}`
  }

  protected override renderActionsExtras(): unknown {
    if (this.roam !== 'zoom' && this.roam !== 'both') return nothing
    return html`
      <div class="zoom-controls" part="zoom-controls">
        <button class="zoom-control" part="zoom-control" type="button" aria-label="Zoom in" @click=${() => this.zoomIn()}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>
        </button>
        <button class="zoom-control" part="zoom-control" type="button" aria-label="Zoom out" @click=${() => this.zoomOut()}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
        </button>
        <button class="zoom-control" part="zoom-control" type="button" aria-label="Reset view" @click=${() => this.resetView()}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" /></svg>
        </button>
      </div>
    `
  }

  /** The joined rows as a table, for a screen reader: the canvas itself says nothing. */
  #renderDataTable(): TemplateResult | typeof nothing {
    const prepared = this.prepared
    const series = this.resolvedSeries[0]
    if (!prepared || !series) return nothing
    const rows = prepared.regions.flatMap((region) => {
      const { row, value } = this.#valueOf(region.key)
      return row === undefined ? [] : [{ region, value }]
    })
    if (rows.length === 0) return nothing
    return html`
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">Region</th>
            <th scope="col">${series.label}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            ({ region, value }) => html`
              <tr>
                <th scope="row">${region.name}</th>
                <td>${this.#formatValue(value)}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `
  }

  protected override render(): TemplateResult {
    return html`
      ${super.render()}${this.#renderDataTable()}
      <span class="map-probes" aria-hidden="true">
        ${['region', 'hover', 'selected', 'scale-start', 'scale-end', 'scale-negative', 'scale-mid', 'marker', 'marker-hover', 'flow'].map(
          (name) => html`<span class="map-probe map-probe--${name}"></span>`,
        )}
      </span>
    `
  }
}

/** Degrees between samples along a geodesic line. */
const GEODESIC_STEP = 3

/**
 * The great-circle path from `from` to `to`, sampled every few degrees and split where it crosses the antimeridian,
 * so a Los Angeles to Tokyo route leaves the right edge and re-enters on the left rather than crossing the map.
 */
export function geodesic(from: [number, number], to: [number, number]): [number, number][][] {
  const steps = Math.max(2, Math.ceil((geoDistance(from, to) * 180) / Math.PI / GEODESIC_STEP))
  const interpolate = geoInterpolate(from, to)
  const paths: [number, number][][] = [[from]]
  let previous = from
  for (let step = 1; step <= steps; step += 1) {
    const point = step === steps ? to : (interpolate(step / steps) as [number, number])
    if (Math.abs(point[0] - previous[0]) > 180) {
      // Where the segment meets ±180°, by linear interpolation on the unwrapped longitude.
      const edge = previous[0] > 0 ? 180 : -180
      const unwrapped = point[0] + (edge > 0 ? 360 : -360)
      const t = (edge - previous[0]) / (unwrapped - previous[0])
      const lat = previous[1] + (point[1] - previous[1]) * t
      paths[paths.length - 1].push([edge, lat])
      paths.push([[-edge, lat]])
    }
    paths[paths.length - 1].push(point)
    previous = point
  }
  return paths
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-map-chart': MapChart
  }
}
