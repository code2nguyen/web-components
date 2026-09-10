/**
 * Studio mode: the full-screen configuration screen an example expands into when its "customize" button is pressed.
 *
 * Nothing is moved in the DOM. The example's `figure.example` gets `is-configuring` (fixed, fills the viewport left of
 * the inspector), `.docs` gets `show-configuration-panel` (inspector fixed on the right) and `<html>` gets
 * `c2n-studio-open` (scroll lock). State is `$configStore`; this module only mirrors it to the DOM and wires the studio
 * bar / example toolbar controls. Bound once per page, with delegated listeners, so it also covers examples that were
 * not in the DOM when the page script ran.
 */
import { $configStore } from '../store/config-store.ts'
import type { ComponentConfigState } from '../model/component-config-state.ts'
import { closeInspector, getChanges, openExample, resetExample } from './playground.ts'
import { getComponentByUid } from './dom.ts'

const EXAMPLE_SELECTOR = '.example[data-uid]'

function exampleOf(uid: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.example[data-uid="${uid}"]`)
}

/** "Prefix and suffix icons": text of the nearest heading above the example, else "Example N". */
function exampleLabel(example: HTMLElement): string {
  if (example.dataset.label) return example.dataset.label
  let node: Element | null = example.previousElementSibling
  while (node) {
    if (/^H[2-4]$/.test(node.tagName)) {
      const text = node.textContent?.trim() ?? ''
      // A section heading ("Examples") is not an example label.
      if (text && !/^examples?$/i.test(text)) return text
      break
    }
    if (node.matches(EXAMPLE_SELECTOR)) break
    node = node.previousElementSibling
  }
  const index = Array.from(document.querySelectorAll(EXAMPLE_SELECTOR)).indexOf(example)
  return `Example ${index + 1}`
}

function pageTitle(): string {
  return document.querySelector('.prose h1')?.textContent?.trim() ?? document.title
}

function hasChanges(uid: string): boolean {
  const changes = getChanges(uid)
  return Object.keys(changes.css).length > 0 || Object.keys(changes.attributes ?? {}).length > 0
}

function syncBadges(state: ComponentConfigState) {
  document.querySelectorAll<HTMLElement>(EXAMPLE_SELECTOR).forEach((example) => {
    const uid = example.dataset.uid ?? ''
    const customized = !!state.configs?.has(uid) && hasChanges(uid)
    example.classList.toggle('is-customized', customized)
    const badge = example.querySelector<HTMLElement>('.example__badge')
    const reset = example.querySelector<HTMLElement>('.example__reset')
    if (badge) badge.hidden = !customized
    if (reset) reset.hidden = !customized
  })
}

/**
 * Focuses a control inside the inspector's shadow root once it has rendered.
 *
 * The selector must name the `c2-*` element, not a bare `input`: the panel is built from web components, so the real
 * `<input>` lives one shadow root deeper and was never reachable from here (the old `.presets input` matched nothing,
 * which is why "Save preset" opened the tab but never focused the name field). `c2-text-field.focus()` forwards.
 */
function focusPanelInput(selector: string) {
  requestAnimationFrame(() => {
    const panel = document.querySelector('demo-component-configuration-panel')
    panel?.shadowRoot?.querySelector<HTMLElement>(selector)?.focus()
  })
}

function isEditableTarget(event: Event): boolean {
  const target = event.composedPath()[0]
  if (!(target instanceof HTMLElement)) return false
  return target.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
}

export function installStudio(docs: Element | null) {
  let openUid = ''
  let savedScrollY = 0

  $configStore.subscribe((state) => {
    const open = !!state.showConfig && !!state.uid
    const uid = open ? state.uid! : ''

    document.querySelectorAll<HTMLElement>('.mdx-code-block-setting-btn').forEach((button) => {
      const active = open && button.dataset.uid === uid
      button.classList.toggle('active', active)
      button.setAttribute('aria-pressed', String(active))
    })
    docs?.classList.toggle('show-configuration-panel', open)
    document.documentElement.classList.toggle('c2n-studio-open', open)

    document.querySelectorAll<HTMLElement>(`${EXAMPLE_SELECTOR}.is-configuring`).forEach((example) => {
      if (example.dataset.uid !== uid) example.classList.remove('is-configuring')
    })

    if (open) {
      // Entering the studio removes the example from the page flow, which can clamp the scroll position.
      if (!openUid) savedScrollY = window.scrollY
      const example = exampleOf(uid)
      if (example) {
        example.classList.add('is-configuring')
        const title = example.querySelector<HTMLElement>('.example__studio-title')
        const tag = example.querySelector<HTMLElement>('.example__studio-tag')
        if (title) title.textContent = `${pageTitle()} · ${exampleLabel(example)}`
        if (tag) tag.textContent = getComponentByUid(uid)?.tagName.toLowerCase() ?? ''
        if (openUid !== uid) example.querySelector<HTMLElement>('.example__studio-exit')?.focus()
      }
    } else if (openUid) {
      // Return to exactly where the page was before entering the studio.
      window.scrollTo({ top: savedScrollY, behavior: 'instant' })
      exampleOf(openUid)?.querySelector<HTMLElement>('.mdx-code-block-setting-btn')?.focus({ preventScroll: true })
    }
    openUid = uid

    syncBadges(state)
  })

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    const control = target?.closest<HTMLElement>('.example__studio-exit, .example__studio-reset, .example__reset, .example__studio-save')
    if (!control) return
    const uid = control.closest<HTMLElement>(EXAMPLE_SELECTOR)?.dataset.uid
    if (!uid) return

    if (control.matches('.example__studio-exit')) {
      closeInspector()
    } else if (control.matches('.example__studio-reset, .example__reset')) {
      if (!$configStore.get().configs?.has(uid)) openExample(uid)
      resetExample(uid)
    } else if (control.matches('.example__studio-save')) {
      $configStore.setKey('activeTab', 'presets')
      focusPanelInput('.collection .inspector-field')
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !$configStore.get().showConfig) return
    if (isEditableTarget(event)) return
    event.preventDefault()
    closeInspector()
  })
}
