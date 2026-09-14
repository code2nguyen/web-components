import { useEffect, useRef, type RefObject } from 'react'
import type { EventMapOf } from '@c2n/core/event-helper.js'

/**
 * Subscribes to an event on a c2 element.
 *
 * JSX has no spelling for a kebab-case event name — there is no `onSelection-change` — and React's own
 * `onChange` is a synthetic event with form-control semantics of its own, so anything beyond a plain click is
 * wired through a ref and `addEventListener`. That is the whole React interop story for these components.
 *
 * `EventMapOf` reads the element's own event map, so the name is checked against what the component actually
 * fires and the handler's event is narrowed with no cast — a `selection-change` on a `c2-table` hands back rows,
 * the same name on a `c2-select` hands back option values.
 *
 * The handler is kept in a ref so a new closure on every render does not re-subscribe the listener.
 */
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
