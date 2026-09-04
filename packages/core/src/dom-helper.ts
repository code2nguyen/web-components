import { isServer } from 'lit-html/is-server.js'

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

export function smartFixedPosition(fixed: boolean) {
  if (isServer) return
  const el = document.documentElement
  const scrollbarWidth = window.innerWidth - document.documentElement.offsetWidth
  if (fixed) {
    el.style.setProperty('--c2n-body-scroll-x', convertToUnit(-el.scrollLeft)!)
    el.style.setProperty('--c2n-body-scroll-y', convertToUnit(-el.scrollTop)!)
    el.style.setProperty('--c2n-scrollbar-offset', convertToUnit(scrollbarWidth)!)

    el.style.setProperty('overflow', 'hidden')
    el.style.setProperty('padding-inline-end', 'var(--c2n-scrollbar-offset)')
    el.style.setProperty('position', 'fixed')
    el.style.setProperty('top', 'var(--c2n-body-scroll-y)')
    el.style.setProperty('left', 'var(--c2n-body-scroll-x)')
    el.style.setProperty('width', '100%')
    el.style.setProperty('height', '100%')
  } else if (el.style.getPropertyValue('--c2n-body-scroll-x')) {
    const x = parseFloat(el.style.getPropertyValue('--c2n-body-scroll-x'))
    const y = parseFloat(el.style.getPropertyValue('--c2n-body-scroll-y'))

    el.style.removeProperty('overflow')
    el.style.removeProperty('padding-inline-end')
    el.style.removeProperty('position')
    el.style.removeProperty('top')
    el.style.removeProperty('left')
    el.style.removeProperty('width')
    el.style.removeProperty('height')

    el.style.removeProperty('--c2n-body-scroll-x')
    el.style.removeProperty('--c2n-body-scroll-y')
    el.style.removeProperty('--c2n-scrollbar-offset')
    el.scrollLeft = -x
    el.scrollTop = -y
  }
}

export function convertToUnit(str: string | number | null | undefined, unit = 'px'): string | undefined {
  if (str == null || str === '') {
    return undefined
  } else if (isNaN(+str!)) {
    return String(str)
  } else if (!isFinite(+str!)) {
    return undefined
  } else {
    return `${Number(str)}${unit}`
  }
}
