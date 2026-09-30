/// <reference types="google.maps" />

/**
 * One loader for every Google Maps element on the page.
 *
 * The Maps JavaScript API is a browser API: its key is always visible to the page, whoever hands it over, so there
 * is nothing to hide behind a server. Protect the key in the Google Cloud console instead — restrict it to your
 * sites' HTTP referrers, to the APIs the page uses (Maps JavaScript API, Routes API) and give it a quota.
 */

export interface GoogleMapsConfig {
  /** A browser API key, restricted to your HTTP referrers. */
  apiKey?: string
  /** The API release channel or version: `weekly` (default), `quarterly`, `beta`, or a number such as `3.62`. */
  version?: string
  /** The language of labels and controls, e.g. `vi` or `en-GB`. Defaults to the browser's language. */
  language?: string
  /** The region code that biases geocoding and borders, e.g. `VN`. */
  region?: string
}

/** Why a map could not be shown. */
export type GoogleMapsErrorReason = 'missing-key' | 'load-failed' | 'auth-failed' | 'no-imagery' | 'route-failed'

export class GoogleMapsError extends Error {
  constructor(
    readonly reason: GoogleMapsErrorReason,
    message: string,
  ) {
    super(message)
    this.name = 'GoogleMapsError'
  }
}

/** Dispatched on `window` when a key is configured, so an element that asked for one can load after all. */
export const CONFIG_EVENT = 'c2-google-maps-config'

/** Dispatched on `window` when Google rejects the key, so every element on the page can show it. */
export const AUTH_FAILURE_EVENT = 'c2-google-maps-auth-failure'

const CALLBACK = '__c2nGoogleMapsReady'

let config: GoogleMapsConfig = {}
let loading: Promise<void> | undefined
let authFailed = false

/**
 * Sets the key and loader options once for the whole page, before the first map loads. An `api-key` attribute on an
 * element is only used when no key was configured here.
 *
 * ```js
 * import { configureGoogleMaps } from '@c2n/google-map'
 * configureGoogleMaps({ apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY, language: 'vi', region: 'VN' })
 * ```
 */
export function configureGoogleMaps(options: GoogleMapsConfig): void {
  if (loading) console.warn('[c2-google-map] configureGoogleMaps() was called after the Maps API started loading; the new options are ignored.')
  else {
    config = { ...config, ...options }
    // Elements that rendered first, as islands hydrating before the app's own script, are waiting for this.
    if (options.apiKey) window.dispatchEvent(new Event(CONFIG_EVENT))
  }
}

/** The Maps API is on the page already, loaded by this module, by the application or by another library. */
export function isGoogleMapsLoaded(): boolean {
  return typeof google !== 'undefined' && typeof google.maps?.importLibrary === 'function'
}

/** The key that {@link loadGoogleMaps} would use: the configured one, else the element's. */
export function resolveApiKey(elementKey?: string): string | undefined {
  return config.apiKey || elementKey || undefined
}

/** Google rejected the key (wrong key, referrer not allowed, API not enabled, billing off). */
export function hasAuthFailed(): boolean {
  return authFailed
}

/** Loads the Maps JavaScript API once. Resolves at once when it is already on the page. */
export function loadGoogleMaps(elementKey?: string): Promise<void> {
  if (isGoogleMapsLoaded()) return Promise.resolve()
  if (loading) return loading

  const key = resolveApiKey(elementKey)
  if (!key) return Promise.reject(new GoogleMapsError('missing-key', 'Set a Google Maps API key to show this map.'))

  const globals = window as unknown as Record<string, unknown>
  // Google calls this global when it rejects the key; it offers no event or promise for it.
  const previousAuthFailure = globals.gm_authFailure
  globals.gm_authFailure = () => {
    authFailed = true
    window.dispatchEvent(new Event(AUTH_FAILURE_EVENT))
    if (typeof previousAuthFailure === 'function') (previousAuthFailure as () => void)()
  }

  loading = new Promise<void>((resolve, reject) => {
    globals[CALLBACK] = () => {
      delete globals[CALLBACK]
      resolve()
    }
    const params = new URLSearchParams({ key, v: config.version ?? 'weekly', loading: 'async', callback: CALLBACK })
    if (config.language) params.set('language', config.language)
    if (config.region) params.set('region', config.region)

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`
    script.async = true
    script.onerror = () => {
      loading = undefined
      script.remove()
      reject(new GoogleMapsError('load-failed', 'The Google Maps JavaScript API could not be loaded.'))
    }
    document.head.append(script)
  })
  return loading
}

/** Loads the API if needed, then one of its libraries (`maps`, `marker`, `routes`, `streetView`, …). */
export async function importGoogleLibrary<K extends keyof google.maps.ImportLibraryMap>(
  name: K,
  elementKey?: string,
): Promise<google.maps.ImportLibraryMap[K]> {
  await loadGoogleMaps(elementKey)
  return google.maps.importLibrary(name)
}

/** Maps the page's CSS `color-scheme` (as computed on `element`) to the map's colour scheme. */
export function colorSchemeOf(element: Element): google.maps.ColorSchemeString {
  const scheme = getComputedStyle(element).colorScheme ?? ''
  const dark = /\bdark\b/.test(scheme)
  const light = /\blight\b/.test(scheme)
  if (dark && !light) return 'DARK'
  if (light && !dark) return 'LIGHT'
  return 'FOLLOW_SYSTEM'
}
