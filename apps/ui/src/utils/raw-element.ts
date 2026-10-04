/**
 * Helpers for site chrome that must render as *plain* custom-element tags.
 *
 * `@astrojs/lit` claims every tag whose class is registered on the server (`customElements.get(tag)`), even when it is
 * written as a plain tag: the element is server-rendered with declarative shadow DOM, Lit-typed props (`href`, `value`,
 * `tooltip`…) are set as properties and vanish from the HTML, and the element gets `defer-hydration`, which nothing
 * removes for a non-island. Emitting the markup as a raw string through `set:html` bypasses the renderer, so the
 * element ships as plain HTML and upgrades normally once `data/chrome-modules.ts` registers it.
 *
 * The same string building is what the frameworks guide ("Many instances without server rendering") shows an app
 * writing for itself. What is site-specific here is `stripServerRendering`: the inner HTML usually comes from
 * `Astro.slots.render()`, which the Lit renderer has already server-rendered.
 */

/**
 * A value {@link serializeAttributes} can write. `true` writes a bare attribute, `false`, `null` and `undefined` omit
 * it, an object or array is written as JSON (what the components' JSON attributes, such as `rows` or `items`, parse),
 * anything else is written as its string.
 */
export type AttributeValue = string | number | boolean | null | undefined | object

/** Attribute map accepted by {@link serializeAttributes} and {@link rawElement}. */
export type Attributes = Record<string, AttributeValue>

const ATTRIBUTE_NAME = /^[^\s"'>/=]+$/

/** Per the HTML spec: no whitespace, quotes, `>`, `/`, `=` or control characters in an attribute name. */
function isAttributeName(name: string): boolean {
  if (!ATTRIBUTE_NAME.test(name)) return false
  for (let index = 0; index < name.length; index++) {
    const code = name.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return false
  }
  return true
}

const TAG_NAME = /^[a-zA-Z][a-zA-Z0-9._-]*$/

/**
 * Escapes `&`, `<`, `>` and `"`, which makes a string safe both as text content and inside a double-quoted attribute
 * value. Use it on every piece of untrusted text put in the inner HTML of {@link rawElement}.
 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Serialises an attribute map to the text that goes after a tag name, each attribute preceded by a space:
 * `{ value: 'a', open: true, hidden: false, rows: [{ id: 1 }] }` → ` value="a" open rows="[{&quot;id&quot;:1}]"`.
 *
 * Throws on an attribute name that would break out of the tag, so a name taken from data cannot inject markup.
 */
export function serializeAttributes(attributes: Attributes): string {
  let html = ''
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue
    if (!isAttributeName(name)) throw new TypeError(`Invalid attribute name: ${JSON.stringify(name)}`)
    if (value === true) {
      html += ` ${name}`
      continue
    }
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    html += ` ${name}="${escapeHtml(text)}"`
  }
  return html
}

/**
 * Removes what the Lit renderer added to slotted content (declarative shadow roots, hydration markers,
 * `defer-hydration`), so the nested elements upgrade as fresh, plain elements instead of half-hydrated ones.
 */
export function stripServerRendering(html: string): string {
  return html
    .replace(/<template shadowroot(?:mode)?="open"(?:\s+shadowroot(?:mode)?="open")?>[\s\S]*?<\/template>/g, '')
    .replace(/<!--\/?lit-(?:part|node)[^>]*-->/g, '')
    .replace(/\s+defer-hydration(?==|\s|>)/g, '')
}

/**
 * `<tag …attributes>inner</tag>` as a raw string, with the inner HTML cleaned of server rendering. The inner HTML is
 * otherwise inserted as is: escape any text in it with {@link escapeHtml}, or build it from nested `rawElement` calls.
 */
export function rawElement(tag: string, attributes: Attributes = {}, innerHtml = ''): string {
  if (!TAG_NAME.test(tag)) throw new TypeError(`Invalid tag name: ${JSON.stringify(tag)}`)
  return `<${tag}${serializeAttributes(attributes)}>${stripServerRendering(innerHtml)}</${tag}>`
}
