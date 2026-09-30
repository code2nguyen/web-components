/// <reference types="google.maps" />
import { unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { GoogleMapsElement, type GoogleMapsErrorEventDetail } from './google-maps-element.js'
import { colorSchemeOf, importGoogleLibrary } from './google-maps-loader.js'
import { latLngConverter, parseLatLng, sameLatLng, type LatLng } from './geo.js'
import styles from './google-map.scss?inline'
// The package root registers every element, so one import is enough for markup that uses them together.
import './google-map-marker.js'
import './google-map-route.js'
import './google-street-view.js'

export { configureGoogleMaps, isGoogleMapsLoaded, loadGoogleMaps, importGoogleLibrary, GoogleMapsError } from './google-maps-loader.js'
export type { GoogleMapsConfig, GoogleMapsErrorReason } from './google-maps-loader.js'
export type { GoogleMapsErrorEventDetail } from './google-maps-element.js'
export { parseLatLng, parseLocation } from './geo.js'
export type { LatLng, Location } from './geo.js'
export type { GoogleMapMarker, GoogleMapMarkerEventDetail, GoogleMapMarkerEventMap } from './google-map-marker.js'
export type {
  GoogleMapRoute,
  GoogleMapRouteEventDetail,
  GoogleMapRouteErrorEventDetail,
  GoogleMapRouteEventMap,
  GoogleMapTravelMode,
} from './google-map-route.js'
export type { GoogleStreetView, GoogleStreetViewChangeEventDetail, GoogleStreetViewReadyEventDetail, GoogleStreetViewEventMap } from './google-street-view.js'

export type GoogleMapType = 'roadmap' | 'satellite' | 'hybrid' | 'terrain'
export type GoogleMapGestureHandling = 'auto' | 'cooperative' | 'greedy' | 'none'

/** Google's shared test map ID. Advanced markers and route markers need a map ID; create your own for production. */
export const DEMO_MAP_ID = 'DEMO_MAP_ID'

const WORLD: LatLng = { lat: 20, lng: 0 }

export interface GoogleMapReadyEventDetail {
  map: google.maps.Map
}

export interface GoogleMapClickEventDetail extends LatLng {
  /** The place the user clicked, when they clicked a point of interest. */
  placeId?: string
}

export interface GoogleMapViewChangeEventDetail {
  center: LatLng
  zoom: number
  bounds?: { north: number; east: number; south: number; west: number }
}

/** Events fired by {@link GoogleMap}, keyed for `addEventListener`. */
export interface GoogleMapEventMap {
  'map-ready': CustomEvent<GoogleMapReadyEventDetail>
  'map-click': CustomEvent<GoogleMapClickEventDetail>
  'view-change': CustomEvent<GoogleMapViewChangeEventDetail>
  'map-error': CustomEvent<GoogleMapsErrorEventDetail>
}

export interface GoogleMap {
  addEventListener: TypedAddEventListener<GoogleMap, GoogleMapEventMap>
  removeEventListener: TypedRemoveEventListener<GoogleMap, GoogleMapEventMap>
}

/**
 * An interactive Google map. Markers and routes are declared as children; everything else the Maps JavaScript API
 * offers (Street View through the pegman, map types, traffic layers, clustering, …) stays reachable through the
 * underlying `google.maps.Map` on {@link GoogleMap.map}.
 *
 * The API is loaded once per page, from `configureGoogleMaps({ apiKey })` or this element's `api-key`. The key is a
 * browser key, visible to the page by design: restrict it to your sites' referrers and to the APIs you use.
 *
 * The map's light or dark look follows the CSS `color-scheme` computed on the element when the map is created.
 *
 * @tag c2-google-map
 *
 * @slot - `c2-google-map-marker` and `c2-google-map-route` elements. They render nothing in place.
 * @slotcomponent c2-google-map-marker
 * @slotcomponent c2-google-map-route
 *
 * @event {CustomEvent<GoogleMapReadyEventDetail>} map-ready - Fired once the map exists. `detail.map` is the `google.maps.Map`.
 * @event {CustomEvent<GoogleMapClickEventDetail>} map-click - Fired when the user clicks the map. `detail` holds the `lat`/`lng`, and the `placeId` of a clicked point of interest.
 * @event {CustomEvent<GoogleMapViewChangeEventDetail>} view-change - Fired when the map settles after a pan or zoom, with its `center`, `zoom` and `bounds`.
 *
 * @cssproperty {length} [--c2-google-map__container--width=100%] - Width of the map.
 * @cssproperty {length} [--c2-google-map__container--height=400px] - Height of the map.
 * @cssproperty {border} [--c2-google-map__container--border=1px solid #e4e4e7] - Border around the map.
 * @cssproperty {length} [--c2-google-map__container--border-radius=8px] - Corner radius of the map.
 * @cssproperty {color} [--c2-google-map__container--background-color=#ffffff] - Shown before the tiles arrive.
 * @cssproperty {color} [--c2-google-map__message--color=#71717a] - Colour of the loading and error notice.
 * @cssproperty {length} [--c2-google-map__message--font-size=14px] - Font size of the notice.
 * @cssproperty {color} [--c2-google-map__message__error--color=#dc2626] - Colour of the error notice.
 */
@customElement('c2-google-map')
export class GoogleMap extends GoogleMapsElement {
  static override styles = unsafeCSS(styles)

  /** Map centre, written `"lat,lng"`. Updated as the user pans. Without it the map shows the world. */
  @property({ converter: latLngConverter }) center?: LatLng

  /** Zoom level, from 0 (the world) to about 22 (buildings). Updated as the user zooms. */
  @property({ type: Number }) zoom?: number

  /**
   * A map ID from the Google Cloud console: cloud-based styling, vector rendering, and required by markers.
   * Defaults to Google's `DEMO_MAP_ID`, which is meant for development only. Read when the map is created.
   */
  @property({ type: String, attribute: 'map-id' }) mapId?: string

  /** The base map: `roadmap`, `satellite`, `hybrid` or `terrain`. */
  @property({ type: String, attribute: 'map-type' }) mapType: GoogleMapType = 'roadmap'

  /**
   * How the map answers scroll and touch gestures. `cooperative` asks for two fingers or Ctrl + scroll so the page
   * can still scroll past it; `greedy` takes every gesture; `none` freezes it.
   */
  @property({ type: String, attribute: 'gesture-handling' }) gestureHandling: GoogleMapGestureHandling = 'auto'

  /** Hides every built-in control: zoom, map type, Street View, fullscreen. */
  @property({ type: Boolean, attribute: 'disable-default-ui' }) disableDefaultUi = false

  /** Any other `google.maps.MapOptions`, applied over the attributes. Property only. */
  @property({ attribute: false }) options?: google.maps.MapOptions

  #map?: google.maps.Map
  #resolveReady!: (map: google.maps.Map) => void
  #ready = new Promise<google.maps.Map>((resolve) => (this.#resolveReady = resolve))
  /** The view the map reported last, so writing it back to `center`/`zoom` does not move the map again. */
  #reported: { center?: LatLng; zoom?: number } = {}

  protected readonly loadingMessage = 'Loading map…'

  /** The underlying `google.maps.Map`, once it exists. */
  get map(): google.maps.Map | undefined {
    return this.#map
  }

  /** Resolves with the `google.maps.Map` once it exists. Children wait on it. */
  get ready(): Promise<google.maps.Map> {
    return this.#ready
  }

  /** Pans and zooms so every point is in view. */
  fitBounds(points: Iterable<LatLng | google.maps.LatLngBoundsLiteral>, padding: number | google.maps.Padding = 48): void {
    if (!this.#map) return
    const bounds = new google.maps.LatLngBounds()
    for (const point of points) {
      if ('north' in point) bounds.union(point)
      else bounds.extend(point)
    }
    if (!bounds.isEmpty()) this.#map.fitBounds(bounds, padding)
  }

  /** Opens Street View on this map, at `position` or at the map centre. */
  showStreetView(position?: LatLng, pov?: google.maps.StreetViewPov): void {
    const panorama = this.#map?.getStreetView()
    if (!panorama) return
    panorama.setPosition(position ?? this.#map!.getCenter()!)
    if (pov) panorama.setPov(pov)
    panorama.setVisible(true)
  }

  protected async initialize(): Promise<void> {
    const { Map } = await importGoogleLibrary('maps', this.apiKey)
    const center = this.center ?? WORLD
    const map = new Map(this.canvas, {
      center,
      zoom: this.zoom ?? (this.center ? 12 : 2),
      mapId: this.mapId || DEMO_MAP_ID,
      colorScheme: colorSchemeOf(this),
      ...this.#viewOptions(),
      ...this.options,
    })
    this.#map = map

    map.addListener('click', (event: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
      if (!event.latLng) return
      const detail: GoogleMapClickEventDetail = { lat: event.latLng.lat(), lng: event.latLng.lng() }
      if ('placeId' in event && event.placeId) detail.placeId = event.placeId
      this.dispatchEvent(new CustomEvent<GoogleMapClickEventDetail>('map-click', { detail }))
    })
    map.addListener('idle', () => this.#reportView())

    this.status = 'ready'
    this.#resolveReady(map)
    this.dispatchEvent(new CustomEvent<GoogleMapReadyEventDetail>('map-ready', { detail: { map } }))
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    const map = this.#map
    if (!map) return
    if (changed.has('center') && this.center && !sameLatLng(this.center, this.#reported.center)) map.panTo(this.center)
    if (changed.has('zoom') && this.zoom !== undefined && this.zoom !== this.#reported.zoom) map.setZoom(this.zoom)
    if (changed.has('mapType') || changed.has('gestureHandling') || changed.has('disableDefaultUi') || changed.has('options')) {
      map.setOptions({ ...this.#viewOptions(), ...this.options })
    }
  }

  #viewOptions(): google.maps.MapOptions {
    return { mapTypeId: this.mapType, gestureHandling: this.gestureHandling, disableDefaultUI: this.disableDefaultUi }
  }

  #reportView(): void {
    const map = this.#map!
    const center = parseLatLng(map.getCenter())
    const zoom = map.getZoom()
    if (!center || zoom === undefined) return
    this.#reported = { center, zoom }
    this.center = center
    this.zoom = zoom
    const bounds = map.getBounds()?.toJSON()
    this.dispatchEvent(new CustomEvent<GoogleMapViewChangeEventDetail>('view-change', { detail: { center, zoom, bounds } }))
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-google-map': GoogleMap
  }
}
