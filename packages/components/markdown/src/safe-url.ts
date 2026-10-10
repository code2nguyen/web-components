/** What a URL is for: links may also use `mailto:`/`tel:` and fragments; images only load over HTTP(S). */
export type UrlKind = 'link' | 'image'

/** App hook run after the protocol check: return a replacement URL (a proxy), or `null` to drop it. */
export type UrlTransform = (url: string, kind: UrlKind) => string | null | undefined

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const IMAGE_PROTOCOLS = new Set(['http:', 'https:'])
/** Base used to resolve relative URLs on the server, where there is no document; only the protocol is read from it. */
const SERVER_BASE = 'https://c2n.invalid/'

/** The streaming healer's placeholder for a link whose URL has not fully arrived. */
export const PENDING_URL = 'c2-pending:'

function base(): string {
  return typeof document !== 'undefined' ? document.baseURI : SERVER_BASE
}

/**
 * Returns `url` when it is safe to put in an `href` (links) or `src` (images), after the app's transform, or `null`.
 * The URL is parsed the way the browser will parse it, so control characters, whitespace and entity tricks that
 * smuggle `javascript:` past a string check are normalized before the protocol is compared with the allowlist.
 */
export function safeUrl(raw: string, kind: UrlKind, transform?: UrlTransform): string | null {
  const url = raw.trim()
  if (!url || url.startsWith(PENDING_URL)) return null
  let parsed: URL
  try {
    parsed = new URL(url, base())
  } catch {
    return null
  }
  const allowed = kind === 'image' ? IMAGE_PROTOCOLS : LINK_PROTOCOLS
  if (!allowed.has(parsed.protocol)) return null
  if (!transform) return url
  const next = transform(url, kind)
  if (next === null || next === undefined) return null
  // A transform cannot reintroduce a dangerous protocol.
  return next === url ? url : safeUrl(next, kind)
}

/** True when `url` leaves the current origin (so it opens in a new tab with `noopener`). */
export function isExternal(url: string): boolean {
  if (url.startsWith('#')) return false
  try {
    const parsed = new URL(url, base())
    if (parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') return false
    return typeof location === 'undefined' ? /^[a-z][a-z\d+.-]*:/i.test(url) : parsed.origin !== location.origin
  } catch {
    return false
  }
}

/** The origin of an image URL, for the `image-origins` allowlist. */
export function originOf(url: string): string {
  try {
    return new URL(url, base()).origin
  } catch {
    return ''
  }
}
