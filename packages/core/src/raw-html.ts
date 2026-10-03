/**
 * Build custom-element markup as a plain HTML string, for rendering many instances of a component without
 * server-rendering them.
 *
 * Declarative shadow DOM cannot share a stylesheet, so a server renderer (`@astrojs/lit`, `@lit-labs/ssr`, …) inlines
 * the component's whole stylesheet into every instance's `<template shadowrootmode>`: 138 server-rendered
 * `c2-tree-item` rows took one page from 606 KB to 2.2 MB of HTML. Emitting the elements as a raw string instead
 * (`<Fragment set:html>` in Astro, `dangerouslySetInnerHTML` in React) ships them as plain tags, which upgrade once the
 * page registers the element on the client.
 *
 * This module has no dependency, touches no DOM and runs in Node, a worker or the browser.
 *
 * ```ts
 * import { rawElement, escapeHtml } from '@c2n/core/raw-html.js'
 *
 * const rows = files.map((file) => rawElement('c2-tree-item', { value: file.id, expanded: file.open }, escapeHtml(file.name))).join('')
 * const html = rawElement('c2-tree', { 'aria-label': 'Files' }, rows)
 * ```
 */

/**
 * A value {@link serializeAttributes} can write. `true` writes a bare attribute, `false`, `null` and `undefined` omit
 * it, an object or array is written as JSON (what the components' JSON attributes, such as `rows` or `items`, parse),
 * anything else is written as its string.
 */
export type RawAttributeValue = string | number | boolean | null | undefined | object

/** Attribute map accepted by {@link serializeAttributes} and {@link rawElement}. */
export type RawAttributes = Record<string, RawAttributeValue>

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
 * value. Use it on every piece of untrusted text you put in the `innerHtml` of {@link rawElement}.
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
export function serializeAttributes(attributes: RawAttributes): string {
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
 * `<tag …attributes>innerHtml</tag>` as a string. `innerHtml` is inserted as is: escape any text in it with
 * {@link escapeHtml}, or build it from nested `rawElement` calls.
 */
export function rawElement(tag: string, attributes: RawAttributes = {}, innerHtml = ''): string {
  if (!TAG_NAME.test(tag)) throw new TypeError(`Invalid tag name: ${JSON.stringify(tag)}`)
  return `<${tag}${serializeAttributes(attributes)}>${innerHtml}</${tag}>`
}
