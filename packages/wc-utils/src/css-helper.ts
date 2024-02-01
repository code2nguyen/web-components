export function addClasses(target: HTMLElement, cls: string[]) {
    for (const item of cls) {
        if (!target.classList.contains(item))
            target.classList.add(item)
    }
}