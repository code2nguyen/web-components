/// <reference types="google.maps" />

/** A point on the map, in degrees. The same shape as `google.maps.LatLngLiteral`. */
export interface LatLng {
  lat: number
  lng: number
}

/** A route end: a coordinate, or anything Google can geocode (an address, a plus code, a place name). */
export type Location = LatLng | string

const COORDINATE = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/

/** Reads `"lat,lng"`, `{"lat":…,"lng":…}` or `[lat, lng]`. Anything else is `undefined`. */
export function parseLatLng(value: unknown): LatLng | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'string') {
    const match = COORDINATE.exec(value)
    if (match) return toLatLng(Number(match[1]), Number(match[2]))
    try {
      return parseLatLng(JSON.parse(value))
    } catch {
      return undefined
    }
  }
  if (Array.isArray(value)) return toLatLng(Number(value[0]), Number(value[1]))
  if (typeof value === 'object') {
    const point = value as { lat?: unknown; lng?: unknown }
    // A `google.maps.LatLng` exposes its coordinates as methods.
    const lat = typeof point.lat === 'function' ? (point.lat as () => number)() : point.lat
    const lng = typeof point.lng === 'function' ? (point.lng as () => number)() : point.lng
    return toLatLng(Number(lat), Number(lng))
  }
  return undefined
}

/** A coordinate when the value is one, otherwise the trimmed string for Google to geocode. */
export function parseLocation(value: unknown): Location | undefined {
  if (typeof value === 'string') return parseLatLng(value) ?? (value.trim() || undefined)
  return parseLatLng(value)
}

function toLatLng(lat: number, lng: number): LatLng | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined
  return { lat, lng }
}

/** Attribute ⇄ property converter for a coordinate written as `"lat,lng"`. A string assigned to the property parses too. */
export const latLngConverter = {
  fromAttribute: (value: string | null) => parseLatLng(value),
  toAttribute: (value: LatLng | undefined) => (value ? `${value.lat},${value.lng}` : null),
  fromProperty: (value: unknown) => parseLatLng(value) ?? value,
}

/** Converter for a route end: a coordinate string becomes a {@link LatLng}, any other string stays an address. */
export const locationConverter = {
  fromAttribute: (value: string | null) => parseLocation(value),
  toAttribute: (value: Location | undefined) => (value === undefined ? null : typeof value === 'string' ? value : `${value.lat},${value.lng}`),
  fromProperty: (value: unknown) => parseLocation(value) ?? value,
}

/** Two coordinates are the same point, to about a centimetre. */
export function sameLatLng(a: LatLng | undefined, b: LatLng | undefined): boolean {
  if (!a || !b) return a === b
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7
}

/** Reads a custom property off an element, or `fallback` when it is unset. */
export function readCssVariable(element: Element, name: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback
}

/** Reads a numeric custom property (`5`, `5px`), or `fallback` when it is unset or not a number. */
export function readCssNumber(element: Element, name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}
