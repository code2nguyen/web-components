/**
 * Helpers for site chrome that must render as *plain* custom-element tags.
 *
 * `@astrojs/lit` claims every tag whose class is registered on the server (`customElements.get(tag)`), even when it is
 * written as a plain tag: the element is server-rendered with declarative shadow DOM, Lit-typed props (`href`, `value`,
 * `tooltip`…) are set as properties and vanish from the HTML, and the element gets `defer-hydration`, which nothing
 * removes for a non-island. Emitting the markup as a raw string through `set:html` bypasses the renderer, so the
 * element ships as plain HTML and upgrades normally once `data/chrome-modules.ts` registers it.
 *
 * The string building is the published `@c2n/core/raw-html.js`; what stays here is the site-specific part: the inner
 * HTML usually comes from `Astro.slots.render()`, which the Lit renderer has already server-rendered.
 */
import { escapeHtml, rawElement as rawHtmlElement, serializeAttributes, type RawAttributes, type RawAttributeValue } from '@c2n/core/raw-html.js'

export { escapeHtml, serializeAttributes }

export type AttributeValue = RawAttributeValue

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

/** `<tag …attributes>inner</tag>` as a raw string, with the inner HTML cleaned of server rendering. */
export function rawElement(tag: string, attributes: RawAttributes, innerHtml = ''): string {
  return rawHtmlElement(tag, attributes, stripServerRendering(innerHtml))
}
