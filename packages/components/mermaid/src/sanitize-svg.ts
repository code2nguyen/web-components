/** Elements that can run script, embed HTML or fetch other documents: removed with their subtree. */
const BLOCKED_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'animate',
  'set',
  'animatemotion',
  'animatetransform',
  'handler',
  'listener',
])

/** A `url(...)` that does not point at a fragment in the same document. */
const EXTERNAL_URL = /url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi
/** `@import` pulls in another stylesheet. */
const IMPORT_RULE = /@import[^;]*;?/gi

function cleanStyle(css: string): string {
  return css.replace(IMPORT_RULE, '').replace(EXTERNAL_URL, 'none')
}

/**
 * Parses SVG markup as XML and returns its root element with everything that could run script or make a request
 * removed: scripts, foreign objects (embedded HTML), frames, SMIL animation (which can rewrite `href`), links (their
 * content stays), every `on*` attribute, every `href` that is not a same-document fragment, and external `url()`/`@import` in styles. Returns
 * `null` when the markup is not a well-formed SVG document. The result is a detached node to adopt, so the markup is
 * never handed to an HTML parser.
 */
export function sanitizeSvg(markup: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
  const root = doc.documentElement
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) return null

  for (const element of [...root.querySelectorAll('*')]) {
    if (BLOCKED_ELEMENTS.has(element.localName.toLowerCase())) {
      element.remove()
      continue
    }
    if (element.localName === 'style') element.textContent = cleanStyle(element.textContent ?? '')
    // A link (Mermaid's `click … href`) keeps its content and loses the link.
    if (element.localName === 'a') element.replaceWith(...element.childNodes)
  }
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim()
      if (name.startsWith('on')) element.removeAttributeNode(attribute)
      else if ((name === 'href' || name === 'xlink:href' || name === 'src') && !value.startsWith('#')) element.removeAttributeNode(attribute)
      else if (name === 'style') attribute.value = cleanStyle(attribute.value)
      else if (/url\(/i.test(value)) attribute.value = cleanStyle(value)
    }
  }
  return document.importNode(root, true) as unknown as SVGSVGElement
}
