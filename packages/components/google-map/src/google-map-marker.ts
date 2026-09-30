/// <reference types="google.maps" />
import { LitElement, css, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { latLngConverter, parseLatLng, readCssNumber, readCssVariable, type LatLng } from './geo.js'
import { findMap } from './map-child.js'

export type GoogleMapMarkerEventDetail = LatLng

/** Events fired by {@link GoogleMapMarker}, keyed for `addEventListener`. */
export interface GoogleMapMarkerEventMap {
  'marker-click': CustomEvent<GoogleMapMarkerEventDetail>
  'marker-drag-end': CustomEvent<GoogleMapMarkerEventDetail>
}

export interface GoogleMapMarker {
  addEventListener: TypedAddEventListener<GoogleMapMarker, GoogleMapMarkerEventMap>
  removeEventListener: TypedRemoveEventListener<GoogleMapMarker, GoogleMapMarkerEventMap>
}

// The pin is drawn by Google's `PinElement`, which takes colours as options rather than CSS, so the variables are
// read from this element when the marker is drawn. These are their defaults.
const PIN_BACKGROUND = 'rgb(2, 101, 220)'
const PIN_BORDER = 'rgb(1, 70, 153)'
const GLYPH_COLOR = '#ffffff'

/**
 * A marker on the `c2-google-map` it is placed in, drawn as a Google Advanced Marker. The pin's colours come from
 * the CSS variables below, read when the marker is drawn; set `content` for a marker of your own.
 *
 * ```html
 * <c2-google-map center="10.7769,106.7009" zoom="14">
 *   <c2-google-map-marker position="10.7769,106.7009" label="Office" glyph="HQ"></c2-google-map-marker>
 * </c2-google-map>
 * ```
 *
 * @tag c2-google-map-marker
 *
 * @event {CustomEvent<GoogleMapMarkerEventDetail>} marker-click - Fired when the user clicks or presses the marker. `detail` is its position.
 * @event {CustomEvent<GoogleMapMarkerEventDetail>} marker-drag-end - Fired when the user drops a `draggable` marker. `detail` is the new position, which `position` also holds.
 *
 * @cssproperty {color} [--c2-google-map-marker__pin--background-color=rgb(2, 101, 220)] - Fill of the pin.
 * @cssproperty {color} [--c2-google-map-marker__pin--border-color=rgb(1, 70, 153)] - Outline of the pin.
 * @cssproperty {color} [--c2-google-map-marker__glyph--color=#ffffff] - Colour of the glyph text, or of the dot when there is no glyph.
 * @cssproperty {number} [--c2-google-map-marker__pin--scale=1] - Size of the pin relative to Google's default.
 */
@customElement('c2-google-map-marker')
export class GoogleMapMarker extends LitElement {
  static override styles = css`
    :host {
      display: none;
    }
  `

  /** Where the marker stands, written `"lat,lng"`. Updated when the user drags it. */
  @property({ converter: latLngConverter }) position?: LatLng

  /** Accessible name of the marker, also shown as its tooltip. */
  @property({ type: String }) label = ''

  /** A short text drawn inside the pin, such as a letter or a number. */
  @property({ type: String }) glyph = ''

  /** Lets the user move the marker. */
  @property({ type: Boolean }) override draggable = false

  /** Stacking order among markers; higher is on top. */
  @property({ type: Number, attribute: 'z-index' }) zIndex?: number

  /** A node to show instead of the pin. Property only. */
  @property({ attribute: false }) content?: Node

  #marker?: google.maps.marker.AdvancedMarkerElement
  #library?: google.maps.MarkerLibrary

  /** The underlying `google.maps.marker.AdvancedMarkerElement`, once it is on a map. */
  get marker(): google.maps.marker.AdvancedMarkerElement | undefined {
    return this.#marker
  }

  override connectedCallback(): void {
    super.connectedCallback()
    void this.#attach()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    if (this.#marker) this.#marker.map = null
    this.#marker = undefined
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (this.#marker) this.#apply(this.#marker, changed.has('glyph') || changed.has('content'))
  }

  async #attach(): Promise<void> {
    const map = await findMap(this)
    if (!map || !this.isConnected || this.#marker) return
    this.#library ??= await google.maps.importLibrary('marker')
    if (!this.isConnected || this.#marker) return

    const marker = new this.#library.AdvancedMarkerElement({ gmpClickable: true })
    marker.addEventListener('gmp-click', () => {
      if (this.position) this.dispatchEvent(new CustomEvent<GoogleMapMarkerEventDetail>('marker-click', { detail: { ...this.position } }))
    })
    marker.addEventListener('gmp-dragend', () => {
      const position = parseLatLng(marker.position)
      if (!position) return
      this.position = position
      this.dispatchEvent(new CustomEvent<GoogleMapMarkerEventDetail>('marker-drag-end', { detail: { ...position } }))
    })
    this.#apply(marker, true)
    marker.map = map
    this.#marker = marker
  }

  /** `redraw` rebuilds the pin, which reads the colour variables again. */
  #apply(marker: google.maps.marker.AdvancedMarkerElement, redraw: boolean): void {
    marker.position = this.position ?? null
    marker.title = this.label
    marker.gmpDraggable = this.draggable
    marker.zIndex = this.zIndex ?? null
    if (redraw) marker.content = this.content ?? this.#pin().element
  }

  #pin(): google.maps.marker.PinElement {
    return new this.#library!.PinElement({
      background: readCssVariable(this, '--c2-google-map-marker__pin--background-color', PIN_BACKGROUND),
      borderColor: readCssVariable(this, '--c2-google-map-marker__pin--border-color', PIN_BORDER),
      glyphColor: readCssVariable(this, '--c2-google-map-marker__glyph--color', GLYPH_COLOR),
      scale: readCssNumber(this, '--c2-google-map-marker__pin--scale', 1),
      ...(this.glyph ? { glyphText: this.glyph } : {}),
    })
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-google-map-marker': GoogleMapMarker
  }
}
