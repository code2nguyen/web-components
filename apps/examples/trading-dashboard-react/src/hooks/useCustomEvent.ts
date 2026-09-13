import { useEffect, useRef, type RefObject } from 'react'

/**
 * Subscribes to a custom event on a c2 element.
 *
 * JSX has no spelling for a kebab-case event name — there is no `onSelection-change` — and React's own
 * `onChange` is a synthetic event with form-control semantics of its own, so anything beyond a plain click is
 * wired through a ref and `addEventListener`. That is the whole React interop story for these components.
 *
 * The handler is kept in a ref so a new closure on every render does not re-subscribe the listener.
 */
export function useCustomEvent<T extends HTMLElement, E extends Event = Event>(ref: RefObject<T | null>, type: string, handler: (event: E) => void): void {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const listener = (event: Event) => latest.current(event as E)
    element.addEventListener(type, listener)
    return () => element.removeEventListener(type, listener)
  }, [ref, type])
}
