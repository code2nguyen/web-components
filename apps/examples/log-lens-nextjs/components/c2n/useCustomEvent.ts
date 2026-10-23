'use client'

import type { EventMapOf } from '@c2n/core/event-helper.js'
import { useEffect, useRef, type RefObject } from 'react'

/**
 * Strict-Mode-safe subscription for native and kebab-case c2 custom events.
 *
 * The element behind `ref` may mount after the component (rendered conditionally) or be replaced by
 * another one, so the effect runs after every commit and rebinds only when the element changed.
 */
export function useCustomEvent<T extends HTMLElement, Type extends keyof EventMapOf<T> & string>(
  ref: RefObject<T | null>,
  type: Type,
  handler: (event: EventMapOf<T>[Type]) => void,
): void {
  const latest = useRef(handler)
  latest.current = handler
  const bound = useRef<{ element: T; type: string; listener: (event: Event) => void } | null>(null)

  useEffect(() => {
    const element = ref.current
    const current = bound.current
    if (current?.element === element && current?.type === type) return
    if (current) current.element.removeEventListener(current.type, current.listener)
    bound.current = null
    if (!element) return

    const listener = (event: Event) => latest.current(event as EventMapOf<T>[Type])
    element.addEventListener(type, listener)
    bound.current = { element, type, listener }
  })

  // Unbind on unmount (and before Strict Mode's simulated remount, which then binds again).
  useEffect(
    () => () => {
      const current = bound.current
      if (current) current.element.removeEventListener(current.type, current.listener)
      bound.current = null
    },
    [],
  )
}
