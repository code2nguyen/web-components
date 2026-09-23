'use client'

import type { DependencyList, RefObject } from 'react'
import { useEffect } from 'react'

export type ElementProperties<T extends HTMLElement> = Partial<Omit<T, keyof HTMLElement>>

/** Assign property-only values after the custom element definition is available. */
export async function assignElementProperties<T extends HTMLElement>(
  element: T,
  tagName: `${string}-${string}`,
  properties: ElementProperties<T>,
): Promise<void> {
  await customElements.whenDefined(tagName)
  for (const key of Object.keys(properties) as Array<keyof ElementProperties<T>>) {
    const value = properties[key]
    if (element[key as keyof T] !== value) Object.assign(element, { [key]: value })
  }
}

/** React helper for idempotent property assignment under development Strict Mode. */
export function useElementProperties<T extends HTMLElement>(
  ref: RefObject<T | null>,
  tagName: `${string}-${string}`,
  properties: ElementProperties<T>,
  dependencies: DependencyList,
): void {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let active = true
    void customElements.whenDefined(tagName).then(() => {
      if (active && element.isConnected) void assignElementProperties(element, tagName, properties)
    })
    return () => {
      active = false
    }
    // The caller supplies dependencies for the deliberately property-shaped value.
  }, [ref, tagName, ...dependencies])
}
