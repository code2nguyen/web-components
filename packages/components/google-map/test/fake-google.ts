/**
 * A stand-in for the parts of the Maps JavaScript API the elements use, so the suite runs with no key and no network.
 * It draws real DOM for what a user touches: the map canvas turns a click into a coordinate (x → lng, y → lat, one
 * degree per 10px from the top-left corner), and each marker is a button on it.
 *
 * Every call the elements make is recorded on `window.fakeGoogle` for the spec to read.
 */

type Listener = (event?: unknown) => void
type Point = { lat: number; lng: number }

export interface FakeGoogleLog {
  maps: FakeMap[]
  markers: FakeMarker[]
  polylines: FakePolyline[]
  routeRequests: Record<string, unknown>[]
  panoramas: FakePanorama[]
}

const log: FakeGoogleLog = { maps: [], markers: [], polylines: [], routeRequests: [], panoramas: [] }

const latLng = (point: Point) => ({ lat: () => point.lat, lng: () => point.lng, toJSON: () => ({ ...point }) })
const toPoint = (value: unknown): Point => {
  const point = value as { lat: number | (() => number); lng: number | (() => number) }
  return { lat: typeof point.lat === 'function' ? point.lat() : point.lat, lng: typeof point.lng === 'function' ? point.lng() : point.lng }
}

class MVCObject {
  listeners = new Map<string, Listener[]>()
  addListener(name: string, listener: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener])
    return { remove: () => {} }
  }
  trigger(name: string, event?: unknown) {
    for (const listener of this.listeners.get(name) ?? []) listener(event)
  }
}

class LatLngBounds {
  north = -90
  south = 90
  east = -180
  west = 180
  extend(value: unknown) {
    const point = toPoint(value)
    this.north = Math.max(this.north, point.lat)
    this.south = Math.min(this.south, point.lat)
    this.east = Math.max(this.east, point.lng)
    this.west = Math.min(this.west, point.lng)
    return this
  }
  union(other: { north: number; south: number; east: number; west: number }) {
    this.extend({ lat: other.north, lng: other.east })
    return this.extend({ lat: other.south, lng: other.west })
  }
  isEmpty() {
    return this.north < this.south
  }
  toJSON() {
    return { north: this.north, south: this.south, east: this.east, west: this.west }
  }
}

class FakeMap extends MVCObject {
  options: Record<string, unknown>
  center: Point
  zoom: number
  fitted?: ReturnType<LatLngBounds['toJSON']>
  streetView: FakePanorama
  surface: HTMLElement

  constructor(element: HTMLElement, options: Record<string, unknown>) {
    super()
    this.options = { ...options }
    this.center = toPoint(options.center)
    this.zoom = options.zoom as number
    this.streetView = new FakePanorama(document.createElement('div'), { visible: false })
    this.surface = document.createElement('div')
    this.surface.dataset.fakeMap = ''
    this.surface.style.cssText = 'position:absolute;inset:0'
    this.surface.addEventListener('click', (event) => {
      if (event.target !== this.surface) return
      const box = this.surface.getBoundingClientRect()
      this.trigger('click', { latLng: latLng({ lat: (event.clientY - box.top) / 10, lng: (event.clientX - box.left) / 10 }) })
    })
    element.append(this.surface)
    log.maps.push(this)
    this.#idle()
  }
  #idle() {
    queueMicrotask(() => this.trigger('idle'))
  }
  getCenter() {
    return latLng(this.center)
  }
  getZoom() {
    return this.zoom
  }
  getBounds() {
    return new LatLngBounds().extend(this.center)
  }
  panTo(center: unknown) {
    this.center = toPoint(center)
    this.#idle()
  }
  setZoom(zoom: number) {
    this.zoom = zoom
    this.#idle()
  }
  setOptions(options: Record<string, unknown>) {
    Object.assign(this.options, options)
  }
  fitBounds(bounds: LatLngBounds | ReturnType<LatLngBounds['toJSON']>) {
    this.fitted = bounds instanceof LatLngBounds ? bounds.toJSON() : { ...bounds }
    this.#idle()
  }
  getStreetView() {
    return this.streetView
  }
  setStreetView(panorama: FakePanorama | null) {
    this.options.streetView = panorama
  }
}

class FakePin {
  element: HTMLElement
  constructor(readonly options: Record<string, unknown>) {
    this.element = document.createElement('span')
    this.element.textContent = (options.glyphText as string) ?? ''
    this.element.style.background = options.background as string
  }
}

class FakeMarker extends EventTarget {
  position: unknown = null
  title = ''
  gmpDraggable = false
  gmpClickable: boolean
  zIndex: number | null = null
  #content: Node | null = null
  #map: FakeMap | null = null
  button = document.createElement('button')

  constructor(options: Record<string, unknown> = {}) {
    super()
    this.gmpClickable = Boolean(options.gmpClickable)
    this.button.dataset.fakeMarker = ''
    this.button.addEventListener('click', () => this.dispatchEvent(new Event('gmp-click')))
    log.markers.push(this)
  }
  get content() {
    return this.#content
  }
  set content(node: Node | null) {
    this.#content = node
    this.button.replaceChildren(...(node ? [node] : []))
  }
  get map() {
    return this.#map
  }
  set map(map: FakeMap | null) {
    this.#map = map
    if (map) {
      const point = toPoint(this.position)
      this.button.setAttribute('aria-label', this.title)
      this.button.style.cssText = `position:absolute;left:${point.lng * 10}px;top:${point.lat * 10}px`
      map.surface.append(this.button)
    } else this.button.remove()
  }
  /** What a drag ends with: the spec drops the marker somewhere else. */
  drop(point: Point) {
    this.position = latLng(point)
    this.dispatchEvent(new Event('gmp-dragend'))
  }
}

class FakePolyline {
  map: FakeMap | null
  constructor(readonly options: Record<string, unknown>) {
    this.map = options.map as FakeMap
    log.polylines.push(this)
  }
  setMap(map: FakeMap | null) {
    this.map = map
  }
}

class FakeRoute {
  constructor(
    readonly path: Point[],
    readonly distanceMeters: number,
  ) {}
  durationMillis = 720_000
  localizedValues = { distance: '4.2 km', duration: '12 mins' }
  get viewport() {
    const bounds = new LatLngBounds()
    for (const point of this.path) bounds.extend(point)
    return bounds
  }
  async createWaypointAdvancedMarkers({ map }: { map: FakeMap }) {
    return [this.path[0], this.path.at(-1)!].map((point, index) => {
      const marker = new FakeMarker()
      marker.position = point
      marker.title = String.fromCharCode(65 + index)
      marker.map = map
      return marker
    })
  }
  static async computeRoutes(request: Record<string, unknown>) {
    log.routeRequests.push(request)
    if (request.destination === 'Nowhere') return { routes: [] }
    const origin = typeof request.origin === 'string' ? { lat: 1, lng: 1 } : toPoint(request.origin)
    const destination = typeof request.destination === 'string' ? { lat: 9, lng: 9 } : toPoint(request.destination)
    const distance = request.travelMode === 'WALKING' ? 3900 : 4200
    return { routes: [new FakeRoute([origin, { lat: (origin.lat + destination.lat) / 2, lng: origin.lng }, destination], distance)] }
  }
}

class FakePanorama extends MVCObject {
  position: Point | null
  pov: { heading: number; pitch: number }
  zoom: number
  visible: boolean
  pano = ''
  options: Record<string, unknown>

  constructor(element: HTMLElement, options: Record<string, unknown>) {
    super()
    this.options = options
    this.position = options.position ? toPoint(options.position) : null
    this.pov = (options.pov as { heading: number; pitch: number }) ?? { heading: 0, pitch: 0 }
    this.zoom = (options.zoom as number) ?? 1
    this.visible = options.visible !== false
    element.dataset.fakePanorama = ''
    // The map's own panorama sits on a detached element; only the ones an element draws into are of interest.
    if (element.isConnected) log.panoramas.push(this)
    queueMicrotask(() => this.trigger('status_changed'))
  }
  getStatus() {
    // The fake has imagery everywhere except the open sea at 0,0.
    return this.position && this.position.lat === 0 && this.position.lng === 0 ? 'ZERO_RESULTS' : 'OK'
  }
  getPov() {
    return this.pov
  }
  getPosition() {
    return this.position ? latLng(this.position) : null
  }
  getZoom() {
    return this.zoom
  }
  getPano() {
    return this.pano
  }
  getVisible() {
    return this.visible
  }
  setPosition(position: unknown) {
    this.position = toPoint(position)
    this.trigger('position_changed')
    this.trigger('status_changed')
  }
  setPov(pov: { heading: number; pitch: number }) {
    this.pov = pov
    this.trigger('pov_changed')
  }
  setZoom(zoom: number) {
    this.zoom = zoom
  }
  setPano(pano: string) {
    this.pano = pano
  }
  setVisible(visible: boolean) {
    this.visible = visible
    this.trigger('visible_changed')
  }
  setOptions(options: Record<string, unknown>) {
    Object.assign(this.options, options)
  }
}

const libraries: Record<string, unknown> = {
  maps: { Map: FakeMap },
  marker: { AdvancedMarkerElement: FakeMarker, PinElement: FakePin },
  routes: { Route: FakeRoute },
  streetView: { StreetViewPanorama: FakePanorama },
}

/** Puts the fake on `window.google`, as the real script tag would. */
export function installFakeGoogle(): void {
  const scope = window as unknown as { google: unknown; fakeGoogle: FakeGoogleLog }
  scope.fakeGoogle = log
  scope.google = {
    maps: {
      importLibrary: async (name: string) => libraries[name],
      LatLngBounds,
      Polyline: FakePolyline,
    },
  }
}
