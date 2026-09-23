'use client'

import type { EventMapOf } from '@c2n/core/event-helper.js'
import { useEffect, useRef, type RefObject } from 'react'

/** Strict-Mode-safe subscription for native and kebab-case c2 custom events. */
export function useCustomEvent<T extends HTMLElement, Type extends keyof EventMapOf<T> & string>(
  ref: RefObject<T | null>,
  type: Type,
  handler: (event: EventMapOf<T>[Type]) => void,
): void {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const listener = (event: Event) => latest.current(event as EventMapOf<T>[Type])
    element.addEventListener(type, listener)
    return () => element.removeEventListener(type, listener)
  }, [ref, type])
}
