/// <reference types="google.maps" />
import { LitElement, css, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { locationConverter, parseLatLng, readCssNumber, readCssVariable, type LatLng, type Location } from './geo.js'
import { findMap } from './map-child.js'

export type GoogleMapTravelMode = 'driving' | 'walking' | 'bicycling' | 'transit' | 'two-wheeler'

const TRAVEL_MODES: Record<GoogleMapTravelMode, google.maps.TravelModeString> = {
  driving: 'DRIVING',
  walking: 'WALKING',
  bicycling: 'BICYCLING',
  transit: 'TRANSIT',
  'two-wheeler': 'TWO_WHEELER',
}

/** The response fields the element reads. The Routes API bills and answers by field mask. */
const FIELDS = ['path', 'distanceMeters', 'durationMillis', 'localizedValues', 'viewport', 'legs']

// The line is a `google.maps.Polyline`, which takes its stroke as options rather than CSS, so the variables are
// read from this element when the route is drawn. These are their defaults.
const LINE_COLOR = 'rgb(2, 101, 220)'
const LINE_WIDTH = 5
const LINE_OPACITY = 1
const OUTLINE_COLOR = '#ffffff'
const OUTLINE_WIDTH = 2

export interface GoogleMapRouteEventDetail {
  /** Length of the route in metres. */
  distanceMeters: number
  /** Travel time in milliseconds, traffic included when Google has it. */
  durationMillis: number
  /** The distance as Google formats it for the map's language, e.g. `"4.2 km"`. */
  distanceText: string
  /** The duration as Google formats it, e.g. `"12 mins"`. */
  durationText: string
  /** The points of the drawn line. */
  path: LatLng[]
  /** The full `google.maps.routes.Route`, for legs, steps, tolls and warnings. */
  route: google.maps.routes.Route
}

export interface GoogleMapRouteErrorEventDetail {
  message: string
}

/** Events fired by {@link GoogleMapRoute}, keyed for `addEventListener`. */
export interface GoogleMapRouteEventMap {
  'route-change': CustomEvent<GoogleMapRouteEventDetail>
  'route-error': CustomEvent<GoogleMapRouteErrorEventDetail>
}

export interface GoogleMapRoute {
  addEventListener: TypedAddEventListener<GoogleMapRoute, GoogleMapRouteEventMap>
  removeEventListener: TypedRemoveEventListener<GoogleMapRoute, GoogleMapRouteEventMap>
}

/**
 * The road route from `origin` to `destination`, computed by the Google Routes API and drawn on the
 * `c2-google-map` it is placed in, with lettered markers at its ends. The map zooms to fit it. The route is
 * computed again whenever an end, a stop or the travel mode changes; `route-change` reports its distance and time.
 *
 * Needs the Routes API enabled on the key.
 *
 * ```html
 * <c2-google-map>
 *   <c2-google-map-route origin="Ben Thanh Market, Ho Chi Minh City" destination="10.7880,106.7058"></c2-google-map-route>
 * </c2-google-map>
 * ```
 *
 * @tag c2-google-map-route
 *
 * @event {CustomEvent<GoogleMapRouteEventDetail>} route-change - Fired when a route has been computed and drawn, with its `distanceMeters`, `durationMillis`, their formatted `distanceText`/`durationText`, the `path` and the Google `route`.
 * @event {CustomEvent<GoogleMapRouteErrorEventDetail>} route-error - Fired when no route could be computed: an end Google cannot find, no road between the ends, or the Routes API not enabled on the key.
 *
 * @cssproperty {color} [--c2-google-map-route__line--color=rgb(2, 101, 220)] - Colour of the route line.
 * @cssproperty {number} [--c2-google-map-route__line--width=5] - Width of the route line, in pixels.
 * @cssproperty {number} [--c2-google-map-route__line--opacity=1] - Opacity of the route line.
 * @cssproperty {color} [--c2-google-map-route__outline--color=#ffffff] - Colour of the edge drawn around the line.
 * @cssproperty {number} [--c2-google-map-route__outline--width=2] - Width of that edge on each side, in pixels; `0` removes it.
 */
@customElement('c2-google-map-route')
export class GoogleMapRoute extends LitElement {
  static override styles = css`
    :host {
      display: none;
    }
  `

  /** Where the route starts: `"lat,lng"`, an address, a plus code or a place name. */
  @property({ converter: locationConverter }) origin?: Location

  /** Where the route ends, in the same forms as `origin`. */
  @property({ converter: locationConverter }) destination?: Location

  /** Stops between the ends, as a JSON array of the same forms (`'["10.78,106.70", "Tan Dinh Market"]'`). */
  @property({ attribute: 'waypoints', converter: { fromAttribute: parseWaypoints, toAttribute: (value: Location[]) => JSON.stringify(value) } })
  waypoints: Location[] = []

  /** How the route is travelled: `driving`, `walking`, `bicycling`, `transit` or `two-wheeler`. */
  @property({ type: String, attribute: 'travel-mode' }) travelMode: GoogleMapTravelMode = 'driving'

  /** Leaves out the lettered markers at the ends and stops. */
  @property({ type: Boolean, attribute: 'hide-markers' }) hideMarkers = false

  /** Keeps the map's view instead of zooming to the route. */
  @property({ type: Boolean, attribute: 'no-fit' }) noFit = false

  #map?: google.maps.Map
  #route?: google.maps.routes.Route
  #lines: google.maps.Polyline[] = []
  #markers: google.maps.marker.AdvancedMarkerElement[] = []
  /** Counts requests so a slow answer cannot overwrite a newer one. */
  #request = 0

  /** The computed `google.maps.routes.Route`, once there is one. */
  get route(): google.maps.routes.Route | undefined {
    return this.#route
  }

  /** Length of the drawn route in metres. */
  get distanceMeters(): number | undefined {
    return this.#route?.distanceMeters
  }

  /** Travel time of the drawn route in milliseconds. */
  get durationMillis(): number | undefined {
    return this.#route?.durationMillis ?? undefined
  }

  override connectedCallback(): void {
    super.connectedCallback()
    void findMap(this).then((map) => {
      if (!map || !this.isConnected) return
      this.#map = map
      void this.#compute()
    })
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#request++
    this.#clear()
    this.#map = undefined
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (!this.#map) return
    if (changed.has('origin') || changed.has('destination') || changed.has('waypoints') || changed.has('travelMode')) void this.#compute()
    else if (changed.has('hideMarkers') && this.#route) void this.#draw(this.#route)
  }

  /** Computes the route again, for instance after the traffic has had time to change. */
  refresh(): Promise<void> {
    return this.#compute()
  }

  async #compute(): Promise<void> {
    const request = ++this.#request
    if (!this.#map || this.origin === undefined || this.destination === undefined) {
      this.#clear()
      this.#route = undefined
      return
    }
    try {
      const { Route } = await google.maps.importLibrary('routes')
      const { routes } = await Route.computeRoutes({
        origin: this.origin,
        destination: this.destination,
        intermediates: this.waypoints.map((location) => ({ location })),
        travelMode: TRAVEL_MODES[this.travelMode] ?? 'DRIVING',
        fields: FIELDS,
      })
      if (request !== this.#request) return
      const route = routes?.[0]
      if (!route?.path?.length) throw new Error('Google found no route between these places.')
      this.#route = route
      await this.#draw(route)
      if (request !== this.#request) return
      this.dispatchEvent(new CustomEvent<GoogleMapRouteEventDetail>('route-change', { detail: this.#detail(route) }))
    } catch (error) {
      if (request !== this.#request) return
      this.#clear()
      this.#route = undefined
      const message = error instanceof Error ? error.message : String(error)
      this.dispatchEvent(new CustomEvent<GoogleMapRouteErrorEventDetail>('route-error', { detail: { message } }))
    }
  }

  async #draw(route: google.maps.routes.Route): Promise<void> {
    const map = this.#map
    if (!map) return
    this.#clear()
    const path = toPath(route)
    const width = readCssNumber(this, '--c2-google-map-route__line--width', LINE_WIDTH)
    const outline = readCssNumber(this, '--c2-google-map-route__outline--width', OUTLINE_WIDTH)
    if (outline > 0) {
      this.#lines.push(
        new google.maps.Polyline({
          map,
          path,
          strokeColor: readCssVariable(this, '--c2-google-map-route__outline--color', OUTLINE_COLOR),
          strokeWeight: width + outline * 2,
          strokeOpacity: 1,
          zIndex: 1,
          clickable: false,
        }),
      )
    }
    this.#lines.push(
      new google.maps.Polyline({
        map,
        path,
        strokeColor: readCssVariable(this, '--c2-google-map-route__line--color', LINE_COLOR),
        strokeWeight: width,
        strokeOpacity: readCssNumber(this, '--c2-google-map-route__line--opacity', LINE_OPACITY),
        zIndex: 2,
        clickable: false,
      }),
    )
    if (!this.noFit && route.viewport) map.fitBounds(route.viewport, 48)
    if (!this.hideMarkers) {
      const markers = await route.createWaypointAdvancedMarkers({ map })
      // The route may have been redrawn or removed while the markers were being made.
      if (this.#route === route && this.#map === map && !this.hideMarkers) this.#markers = markers
      else for (const marker of markers) marker.map = null
    }
  }

  #clear(): void {
    for (const line of this.#lines) line.setMap(null)
    for (const marker of this.#markers) marker.map = null
    this.#lines = []
    this.#markers = []
  }

  #detail(route: google.maps.routes.Route): GoogleMapRouteEventDetail {
    return {
      distanceMeters: route.distanceMeters ?? 0,
      durationMillis: route.durationMillis ?? 0,
      distanceText: route.localizedValues?.distance ?? '',
      durationText: route.localizedValues?.duration ?? '',
      path: toPath(route),
      route,
    }
  }
}

function toPath(route: google.maps.routes.Route): LatLng[] {
  return (route.path ?? []).map((point) => parseLatLng(point)).filter((point): point is LatLng => point !== undefined)
}

function parseWaypoints(value: string | null): Location[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((item) => locationConverter.fromProperty(item) as Location) : []
  } catch {
    return []
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-google-map-route': GoogleMapRoute
  }
}
