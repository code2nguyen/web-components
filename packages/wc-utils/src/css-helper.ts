export function addClasses(target: HTMLElement, cls: string[]) {
  if (!target?.classList) return

  for (const item of cls) {
    if (!target.classList.contains(item)) target.classList.add(item)
  }
}
