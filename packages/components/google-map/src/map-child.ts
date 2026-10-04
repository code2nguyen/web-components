/// <reference types="google.maps" />
import type { GoogleMap } from './google-map.js'

/**
 * The `google.maps.Map` of the `c2-google-map` an overlay element sits in, once it exists. `undefined` when the
 * element is not inside a map. Children never import the map module, so they upgrade in any order.
 */
export async function findMap(child: Element): Promise<google.maps.Map | undefined> {
  const host = child.closest('c2-google-map')
  if (!host) return undefined
  await customElements.whenDefined('c2-google-map')
  return (host as GoogleMap).ready
}
