import type { ClassInfo } from 'lit-html/directives/class-map.js'

export function addClasses(target: HTMLElement, cls: ClassInfo) {
  if (!target?.classList) return

  for (const item of Object.keys(cls)) {
    target.classList.toggle(item, !!cls[item])
  }
}
