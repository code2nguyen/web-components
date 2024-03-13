export const Breakpoints = {
  Phone: '(max-width: 599.98px)',
  Tablet: '(min-width: 600px) and (max-width: 959.98px)',
  Destop: '(min-width: 960px)',
}

export function redispatchEvent(host: HTMLElement, event: Event) {
  if (event.bubbles) {
    event.stopPropagation()
  }

  const copy = Reflect.construct(event.constructor, [event.type, event])
  const dispatched = host.dispatchEvent(copy)
  if (!dispatched) {
    event.preventDefault()
  }
  return dispatched
}
