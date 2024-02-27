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
