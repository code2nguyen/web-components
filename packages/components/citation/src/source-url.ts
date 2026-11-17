// The address checks a citation and a list of sources share: their own module, so the list's entry does not load the
// marker and its hover card.

/**
 * A link address the marker may follow: http(s), or relative to the page. Anything else (`javascript:`, `data:`) is
 * dropped, so a source taken from a model's output cannot run script when clicked.
 */
export function safeSourceUrl(value: string): string {
  const url = cleanUrl(value)
  if (!url) return ''
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase()
  if (scheme === undefined) return url
  return scheme === 'http' || scheme === 'https' ? url : ''
}

/** An icon address the preview may load: what {@link safeSourceUrl} allows, plus inline `data:image/` icons. */
export function safeIconUrl(value: string): string {
  const url = cleanUrl(value)
  return /^data:image\//i.test(url) ? url : safeSourceUrl(url)
}

/**
 * An address as the browser's URL parser reads it: without the leading and trailing control characters and spaces it
 * strips, and without the tabs and line breaks it drops anywhere, so `java\tscript:` is seen for the `javascript:` it is.
 */
function cleanUrl(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').replace(/[\t\n\r]/g, '')
}

/** Whether a link `target` opens another browsing context, which must not get a handle on this page. */
export function opensElsewhere(target: string): boolean {
  const name = target.trim().toLowerCase()
  return name !== '' && name !== '_self' && name !== '_parent' && name !== '_top'
}

/** The site an address belongs to, without `www.`: `https://www.nytimes.com/…` gives `nytimes.com`. */
export function sourceHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
