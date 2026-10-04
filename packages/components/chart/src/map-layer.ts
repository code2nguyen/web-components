import { LitElement, css, type PropertyValues } from 'lit'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { ChartRow } from './chart-types.js'

/** Fired at the parent map whenever a layer definition changes. */
export const MAP_LAYER_CHANGE_EVENT = 'c2-map-layer-change'

/** The tag, so the map can match a layer by name rather than by class identity. */
export const MAP_LAYER_TAG = 'c2-map-layer'

/** A plain snapshot of one `c2-map-layer`, which is all the map reads. */
export interface MapLayerConfig {
  type: 'points' | 'lines'
  data: ChartRow[]
  label?: string
  color?: string
  lonField: string
  latField: string
  regionField: string
  sizeField: string
  sizeLabel: string
  labelField: string
  fromField: string
  toField: string
  widthField: string
  widthLabel: string
  curve: 'geodesic' | 'arc' | 'straight'
  labels: boolean
  hidden: boolean
  format?: (value: number) => string
}

/**
 * One layer of marks drawn over a `c2-map-chart`'s regions, declared as a light-DOM child. It renders nothing
 * itself: like `c2-chart-series`, it is a definition the map reads. Each layer has its own `data` and is one entry
 * of the map's legend.
 *
 * - **`type="points"`** places a circle per row at `lon-field`/`lat-field`, or at the region named by `region-field`.
 *   `size-field` sizes it by area between `--c2-chart__marker--min-size` and `--max-size`.
 * - **`type="lines"`** draws a line per row from `from-field` to `to-field`. Each end is a region key or a
 *   `[lon, lat]` pair; `width-field` sets the stroke width up to `--c2-chart__flow--max-width`.
 *
 * ```html
 * <c2-map-chart>
 *   <c2-map-layer type="points" label="Offices" size-field="staff" label-field="city"
 *     data='[{ "city": "Lisbon", "lon": -9.14, "lat": 38.72, "staff": 120 }]'></c2-map-layer>
 *   <c2-map-layer type="lines" label="Routes" from-field="from" to-field="to"
 *     data='[{ "from": "PRT", "to": [-74, 40.7] }]'></c2-map-layer>
 * </c2-map-chart>
 * ```
 *
 * On a map drawn from an SVG (`projection="none"`), the longitude and latitude fields are x and y in the SVG's own
 * coordinates.
 *
 * @tag c2-map-layer
 */
@customElement('c2-map-layer')
export class MapLayer extends LitElement implements MapLayerConfig {
  static override styles = css`
    :host {
      display: none;
    }
  `

  /** What each row draws: a circle, or a line between two places. */
  @property({ type: String }) type: 'points' | 'lines' = 'points'

  /** The layer's rows, as an array or a JSON attribute. Compared by identity: replace the array to redraw. */
  @property({ converter: jsonPropertyConverter }) data: ChartRow[] = []

  /** Legend and tooltip name of the layer. */
  @property({ type: String }) label?: string

  /** Explicit colour. Falls back to the layer's slot in the chart palette. */
  @property({ type: String }) color?: string

  /** Row field holding a point's longitude. */
  @property({ type: String, attribute: 'lon-field' }) lonField = 'lon'

  /** Row field holding a point's latitude. */
  @property({ type: String, attribute: 'lat-field' }) latField = 'lat'

  /** Row field naming the region a point sits in, instead of a longitude and latitude. Read against the map's `region-key`. */
  @property({ type: String, attribute: 'region-field' }) regionField = ''

  /** Row field encoded as the area of each point. Without it every point has the minimum size. */
  @property({ type: String, attribute: 'size-field' }) sizeField = ''

  /** Names the size measure in the tooltip. Defaults to the humanized `size-field`. */
  @property({ type: String, attribute: 'size-label' }) sizeLabel = ''

  /** Row field naming each point or line in the tooltip, and beside a point when `labels` is set. */
  @property({ type: String, attribute: 'label-field' }) labelField = ''

  /** Row field holding where a line starts: a region key or a `[lon, lat]` pair. */
  @property({ type: String, attribute: 'from-field' }) fromField = 'from'

  /** Row field holding where a line ends: a region key or a `[lon, lat]` pair. */
  @property({ type: String, attribute: 'to-field' }) toField = 'to'

  /** Row field encoded as the stroke width of each line. */
  @property({ type: String, attribute: 'width-field' }) widthField = ''

  /** Names the width measure in the tooltip. Defaults to the humanized `width-field`. */
  @property({ type: String, attribute: 'width-label' }) widthLabel = ''

  /** How a line travels: the shortest path over the globe, a gentle arc, or a straight segment on the drawn map. */
  @property({ type: String }) curve: 'geodesic' | 'arc' | 'straight' = 'geodesic'

  /** Draws each point's `label-field` text beside it. */
  @property({ type: Boolean }) labels = false

  /** Leaves the layer out of the map without removing the definition. */
  @property({ type: Boolean, reflect: true }) override hidden = false

  /** Formats the layer's size or width values for the tooltip. Property only. */
  @property({ attribute: false }) format?: (value: number) => string

  /** A plain snapshot of this definition, so the map never holds a reference to the element. */
  toConfig(): MapLayerConfig {
    return {
      type: this.type,
      data: Array.isArray(this.data) ? this.data : [],
      label: this.label,
      color: this.color,
      lonField: this.lonField,
      latField: this.latField,
      regionField: this.regionField,
      sizeField: this.sizeField,
      sizeLabel: this.sizeLabel,
      labelField: this.labelField,
      fromField: this.fromField,
      toField: this.toField,
      widthField: this.widthField,
      widthLabel: this.widthLabel,
      curve: this.curve,
      labels: this.labels,
      hidden: this.hidden,
      format: this.format,
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.#notify()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#notify()
  }

  protected override updated(_changed: PropertyValues): void {
    this.#notify()
  }

  /** Composed so it crosses the shadow boundary of a host that wraps the map's slot; the map stops it there. */
  #notify(): void {
    this.dispatchEvent(new CustomEvent(MAP_LAYER_CHANGE_EVENT, { bubbles: true, composed: true }))
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-map-layer': MapLayer
  }
}
