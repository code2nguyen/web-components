import { html, nothing, unsafeCSS, type TemplateResult } from 'lit'
import { live } from 'lit/directives/live.js'
import { formatKeys, formatShortcut } from '@c2n/core/shortcut-helper.js'
import type { LocalizeController } from '@c2n/core/localize.js'
import '@c2n/modal'
import '@c2n/kbd'
import '@c2n/text-field'
import type { Shortcut, ShortcutEntry } from './shortcut.js'
import type { ShortcutMessages } from './messages.js'
import type { ShortcutSheet, ShortcutSheetEntry, ShortcutSheetViewState } from './shortcut-sheet.js'
import viewStyles from './shortcut-sheet-view.scss?inline'

// The body of `c2-shortcut-sheet`, loaded with the modal, the keys and the search field the first time a sheet opens
// (or renders inline), so a page pays for none of them until the user asks for the list.

type Msg = LocalizeController<ShortcutMessages>

/** The sheet's styles, adopted by its shadow root with the view. */
export const styles = unsafeCSS(viewStyles)

const waiting = new WeakSet<ShortcutSheet>()

/** The entries of each `c2-shortcut` the sheet reads: those `for` names, or every one in its root. */
function sourceEntries(sheet: ShortcutSheet): ShortcutEntry[][] {
  if (sheet.noBindings) return []
  const root = sheet.getRootNode() as Document | ShadowRoot
  const ids = sheet.for.split(/\s+/).filter(Boolean)
  const found = ids.length ? ids.map((id) => root.getElementById?.(id) ?? document.getElementById(id)) : [...root.querySelectorAll('c2-shortcut')]
  const lists: ShortcutEntry[][] = []
  let pending = false
  for (const element of found) {
    if (element?.localName !== 'c2-shortcut') continue
    const source = element as Shortcut
    // An element that has not upgraded yet has no `entries`.
    const entries = source.entries
    if (!Array.isArray(entries)) pending = true
    else if (!source.disabled) lists.push(entries)
  }
  // Read it again once the element is defined; one that stays un-upgraded after that is left out.
  if (pending && !customElements.get('c2-shortcut') && !waiting.has(sheet)) {
    waiting.add(sheet)
    void customElements.whenDefined('c2-shortcut').then(() => {
      waiting.delete(sheet)
      sheet.refresh()
    })
  }
  return lists
}

function collect(sheet: ShortcutSheet, msg: Msg): ShortcutSheetEntry[] {
  const list: ShortcutSheetEntry[] = []
  for (const entries of sourceEntries(sheet))
    for (const { keys, description, group, disabled, labels } of entries)
      if (description && !disabled && labels.length) list.push({ keys, description, group, labels })
  // The sheet's own keys are bound through the strict parser, so they are labelled by it: a bare key is not listed.
  const own = sheet.keys && !sheet.inline ? formatShortcut(sheet.keys) : []
  if (own.length) list.push({ keys: sheet.keys, description: msg.t('show'), labels: own })
  for (const item of Array.isArray(sheet.shortcuts) ? sheet.shortcuts : []) {
    if (!item || typeof item.keys !== 'string' || !item.description) continue
    const labels = formatKeys(item.keys)
    if (labels.length) list.push({ keys: item.keys, description: item.description, group: item.group, labels })
  }
  return list
}

function matches(entry: ShortcutSheetEntry, terms: string[]): boolean {
  const text = [entry.group ?? '', entry.description, entry.keys, ...entry.labels].join(' ').toLocaleLowerCase()
  return terms.every((term) => text.includes(term))
}

function renderKeys(labels: string[], msg: Msg) {
  return labels.map(
    (label, alternative) =>
      html`${alternative ? html`<span class="separator">${msg.t('or')}</span>` : nothing}${label
        .split(' ')
        .map((stroke, step) => html`${step ? html`<span class="separator">${msg.t('then')}</span>` : nothing}<c2-kbd>${stroke}</c2-kbd>`)}`,
  )
}

/** Puts focus in the search field once the dialog has opened; on the first opening the field renders after the modal. */
async function focusSearch(event: Event) {
  const field = (event.currentTarget as HTMLElement).querySelector('c2-text-field')
  await field?.updateComplete
  field?.focus()
}

export function renderSheet(sheet: ShortcutSheet, { msg, query, setQuery }: ShortcutSheetViewState): TemplateResult {
  const search = query.trim()
  const terms = search.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const entries = collect(sheet, msg).filter((entry) => matches(entry, terms))

  // Shortcuts with no group come first, under "General" when others have a group.
  const grouped = entries.some((entry) => entry.group)
  const groups = new Map<string, ShortcutSheetEntry[]>()
  if (grouped && entries.some((entry) => !entry.group)) groups.set(msg.t('general'), [])
  for (const entry of entries) {
    const name = grouped ? entry.group || msg.t('general') : ''
    groups.set(name, [...(groups.get(name) ?? []), entry])
  }

  let index = 0
  const row = (entry: ShortcutSheetEntry) => {
    const context = { entry, index: index++, query: search }
    return html`<li class="item" part="item">
      ${
        sheet.renderItem
          ? sheet.renderItem(context)
          : html`<span class="description" part="description">${entry.description}</span><span class="keys" part="keys">${renderKeys(entry.labels, msg)}</span>`
      }
    </li>`
  }

  const content = html`${
      sheet.noSearch
        ? nothing
        : html`<div class="search" part="search">
            <c2-text-field
              type="search"
              clearable
              aria-label=${msg.t('search')}
              placeholder=${msg.t('search')}
              .value=${live(query)}
              @input=${(event: Event) => setQuery((event.currentTarget as HTMLInputElement).value)}
            ></c2-text-field>
          </div>`
    }
    <div class="status" role="status">${terms.length ? msg.t('results', entries.length) : ''}</div>
    ${
      entries.length
        ? html`<div class="groups" part="groups">
            ${[...groups].map(
              ([name, list]) =>
                html`<section class="group" part="group">
                  ${name ? html`<h3 class="group-heading" part="group-heading">${name}</h3>` : nothing}
                  <ul class="items" role="list">
                    ${list.map(row)}
                  </ul>
                </section>`,
            )}
          </div>`
        : html`<div class="empty" part="empty"><slot name="empty">${terms.length ? msg.t('noResults', search) : msg.t('empty')}</slot></div>`
    }`

  const hasFooter = !!sheet.querySelector(':scope > [slot="footer"]')
  const footer = html`<div class="footer" part="footer" slot=${sheet.inline ? nothing : hasFooter ? 'footer' : 'unassigned'} ?hidden=${!hasFooter}>
    <slot name="footer" @slotchange=${() => sheet.refresh()}></slot>
  </div>`

  if (sheet.inline)
    return html`<div class="panel inline" part="panel">${content}</div>
      ${footer}`

  return html`<c2-modal class="modal" ?open=${sheet.open} @open=${focusSearch} @close=${(event: Event) => event.target === event.currentTarget && sheet.hide()}>
    <span slot="title" part="title"><slot name="title">${msg.t('title')}</slot></span>
    <div class="panel" part="panel">${content}</div>
    ${footer}
  </c2-modal>`
}
