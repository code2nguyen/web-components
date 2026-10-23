import { browser } from '$app/env'

/**
 * An array or object for a `c2-*` property, from a route that is server-rendered.
 *
 * In the browser Svelte assigns it as a property (`rows in element` is true once the element is registered, which
 * `hooks.client.ts` does before hydration). On the server there are no properties, only attributes, and
 * `String(rows)` is `[object Object]`; JSON is what the component's attribute converter reads.
 */
export function data<T>(value: T): T | string {
  return browser ? value : JSON.stringify(value)
}
