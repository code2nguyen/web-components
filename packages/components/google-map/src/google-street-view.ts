/// <reference types="google.maps" />
import { unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { GoogleMapsElement, type GoogleMapsErrorEventDetail } from './google-maps-element.js'
import { GoogleMapsError, importGoogleLibrary } from './google-maps-loader.js'
import { latLngConverter, parseLatLng, sameLatLng, type LatLng } from './geo.js'
import type { GoogleMap } from './google-map.js'
import styles from './google-street-view.scss?inline'

export interface GoogleStreetViewReadyEventDetail {
  panorama: google.maps.StreetViewPanorama
}

export interface GoogleStreetViewChangeEventDetail {
  position?: LatLng
  heading: number
  pitch: number
  zoom: number
  /** Google's ID of the panorama on show. */
  pano: string
}

/** Events fired by {@link GoogleStreetView}, keyed for `addEventListener`. */
export interface GoogleStreetViewEventMap {
  'map-ready': CustomEvent<GoogleStreetViewReadyEventDetail>
  'view-change': CustomEvent<GoogleStreetViewChangeEventDetail>
  'map-error': CustomEvent<GoogleMapsErrorEventDetail>
}

export interface GoogleStreetView {
  addEventListener: TypedAddEventListener<GoogleStreetView, GoogleStreetViewEventMap>
  removeEventListener: TypedRemoveEventListener<GoogleStreetView, GoogleStreetViewEventMap>
}

const NO_IMAGERY = 'Street View has no imagery near this place.'

/**
 * A Google Street View panorama. Give it a `position` to look around a place, or link it to a map with `for`: the
 * map's pegman then opens Street View here instead of over the map, and the map's markers show in the panorama.
 *
 * ```html
 * <c2-google-street-view position="48.8584,2.2945" heading="320" pitch="10"></c2-google-street-view>
 * ```
 *
 * @tag c2-google-street-view
 *
 * @event {CustomEvent<GoogleStreetViewReadyEventDetail>} map-ready - Fired once the panorama exists. `detail.panorama` is the `google.maps.StreetViewPanorama`.
 * @event {CustomEvent<GoogleStreetViewChangeEventDetail>} view-change - Fired when the user moves or looks around, with the `position`, `heading`, `pitch`, `zoom` and `pano`.
 *
 * @cssproperty {length} [--c2-google-street-view__container--width=100%] - Width of the panorama.
 * @cssproperty {length} [--c2-google-street-view__container--height=400px] - Height of the panorama.
 * @cssproperty {border} [--c2-google-street-view__container--border=1px solid #e4e4e7] - Border around the panorama.
 * @cssproperty {length} [--c2-google-street-view__container--border-radius=8px] - Corner radius of the panorama.
 * @cssproperty {color} [--c2-google-street-view__container--background-color=#ffffff] - Shown before the imagery arrives.
 * @cssproperty {color} [--c2-google-street-view__message--color=#71717a] - Colour of the loading and error notice.
 * @cssproperty {length} [--c2-google-street-view__message--font-size=14px] - Font size of the notice.
 * @cssproperty {color} [--c2-google-street-view__message__error--color=#dc2626] - Colour of the error notice.
 */
@customElement('c2-google-street-view')
export class GoogleStreetView extends GoogleMapsElement {
  static override styles = unsafeCSS(styles)

  /** Where to stand, written `"lat,lng"`. Google picks the nearest panorama. Updated as the user walks. */
  @property({ converter: latLngConverter }) position?: LatLng

  /** A panorama ID, instead of a `position`. */
  @property({ type: String }) pano?: string

  /** Compass direction the camera faces, in degrees (0 is north, 90 east). */
  @property({ type: Number }) heading = 0

  /** Camera angle up or down, in degrees, from -90 to 90. */
  @property({ type: Number }) pitch = 0

  /** Camera zoom, from 0 (widest) to about 4. */
  @property({ type: Number }) zoom = 1

  /** The `id` of a `c2-google-map` whose pegman opens Street View here. */
  @property({ type: String }) for?: string

  /** Hides every built-in control. */
  @property({ type: Boolean, attribute: 'disable-default-ui' }) disableDefaultUi = false

  /** Any other `google.maps.StreetViewPanoramaOptions`, applied over the attributes. Property only. */
  @property({ attribute: false }) options?: google.maps.StreetViewPanoramaOptions

  #panorama?: google.maps.StreetViewPanorama
  #reported?: GoogleStreetViewChangeEventDetail
  #linked?: google.maps.Map

  protected readonly loadingMessage = 'Loading Street View…'

  /** The underlying `google.maps.StreetViewPanorama`, once it exists. */
  get panorama(): google.maps.StreetViewPanorama | undefined {
    return this.#panorama
  }

  protected async initialize(): Promise<void> {
    const { StreetViewPanorama } = await importGoogleLibrary('streetView', this.apiKey)
    const panorama = new StreetViewPanorama(this.canvas, {
      ...(this.pano ? { pano: this.pano } : this.position ? { position: this.position } : {}),
      pov: { heading: this.heading, pitch: this.pitch },
      zoom: this.zoom,
      disableDefaultUI: this.disableDefaultUi,
      // Without a place of its own the panorama waits, hidden, for the linked map's pegman.
      visible: Boolean(this.pano || this.position),
      ...this.options,
    })
    this.#panorama = panorama
    panorama.addListener('status_changed', () => {
      if (panorama.getStatus() === 'OK') {
        if (this.status !== 'ready' && panorama.getVisible()) this.status = 'ready'
      } else if (this.position || this.pano) {
        this.fail(new GoogleMapsError('no-imagery', NO_IMAGERY))
      }
    })
    panorama.addListener('position_changed', () => this.#report())
    panorama.addListener('pov_changed', () => this.#report())
    panorama.addListener('zoom_changed', () => this.#report())
    panorama.addListener('visible_changed', () => {
      if (panorama.getVisible() && this.status === 'loading') this.status = 'ready'
    })
    if (this.pano || this.position) this.status = 'ready'
    else this.message = 'Drag the pegman onto the map to look around.'
    this.dispatchEvent(new CustomEvent<GoogleStreetViewReadyEventDetail>('map-ready', { detail: { panorama } }))
    void this.#link()
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    const panorama = this.#panorama
    if (!panorama) return
    const reported = this.#reported
    if (changed.has('pano') && this.pano && this.pano !== reported?.pano) panorama.setPano(this.pano)
    if (changed.has('position') && this.position && !sameLatLng(this.position, reported?.position)) {
      panorama.setPosition(this.position)
      panorama.setVisible(true)
    }
    const heading = Number.isFinite(this.heading) ? this.heading : 0
    const pitch = Number.isFinite(this.pitch) ? this.pitch : 0
    if ((changed.has('heading') || changed.has('pitch')) && (heading !== reported?.heading || pitch !== reported?.pitch)) {
      panorama.setPov({ heading, pitch })
    }
    if (changed.has('zoom') && Number.isFinite(this.zoom) && this.zoom !== reported?.zoom) panorama.setZoom(this.zoom)
    if (changed.has('disableDefaultUi') || changed.has('options')) panorama.setOptions({ disableDefaultUI: this.disableDefaultUi, ...this.options })
    if (changed.has('for')) void this.#link()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#unlink()
  }

  async #link(): Promise<void> {
    this.#unlink()
    const panorama = this.#panorama
    const host = this.for ? (this.getRootNode() as Document | ShadowRoot).getElementById?.(this.for) : null
    if (!panorama || !host || host.localName !== 'c2-google-map') return
    await customElements.whenDefined('c2-google-map')
    const map = await (host as GoogleMap).ready
    if (this.#panorama !== panorama || !this.isConnected) return
    map.setStreetView(panorama)
    this.#linked = map
  }

  #unlink(): void {
    // Hand the map its own panorama back, so the pegman still works after this element leaves.
    this.#linked?.setStreetView(null)
    this.#linked = undefined
  }

  #report(): void {
    const panorama = this.#panorama!
    const pov = panorama.getPov()
    // Google reports NaN for a value it has not settled yet; keep the last good one rather than hand NaN back to it.
    const settled = (value: number | undefined, fallback: number) => (Number.isFinite(value) ? value! : fallback)
    const detail: GoogleStreetViewChangeEventDetail = {
      position: parseLatLng(panorama.getPosition()),
      heading: settled(pov.heading, this.heading),
      pitch: settled(pov.pitch, this.pitch),
      zoom: settled(panorama.getZoom(), this.zoom),
      pano: panorama.getPano(),
    }
    this.#reported = detail
    if (detail.position) this.position = detail.position
    this.heading = detail.heading
    this.pitch = detail.pitch
    this.zoom = detail.zoom
    if (detail.pano) this.pano = detail.pano
    this.dispatchEvent(new CustomEvent<GoogleStreetViewChangeEventDetail>('view-change', { detail }))
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-google-street-view': GoogleStreetView
  }
}
