import { html, nothing } from 'lit'
import { isComposingKey } from '@c2n/core/dom-helper.js'

/** What an editable item's value is edited with. */
export type DescriptionEditor = 'text' | 'number' | 'date' | 'email' | 'url' | 'select' | 'textarea'

/** What the item hands the editor. */
export interface DescriptionEditorContext {
  type: DescriptionEditor
  value: string
  options: string[]
  label: string
  commit(value: string): void
  cancel(): void
}

/**
 * The editor an item swaps its value for, loaded the first time an item is edited so a read-only list never ships it.
 * Enter (Ctrl+Enter in a text area) and leaving the field commit a changed value; Escape cancels. A select commits a
 * choice made with the pointer at once, and one made with the arrow keys on Enter or leaving it.
 */
export function renderEditor(context: DescriptionEditorContext) {
  let done = false
  // Only a field the reader changed commits: a number or date field that opened empty over formatted content (no
  // `edit-value`) must not erase the value when it is merely left.
  let changed = false
  // A choice made with the pointer commits at once; the arrow keys only move through the options, Enter commits.
  let pointer = false
  const finish = (commit: boolean, value: string) => {
    if (done) return
    done = true
    if (commit && changed) context.commit(value)
    else context.cancel()
  }
  const input = () => {
    changed = true
  }
  const keydown = (event: KeyboardEvent) => {
    pointer = false
    if (isComposingKey(event)) return
    const field = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    if (event.key === 'Escape') {
      event.preventDefault()
      finish(false, field.value)
    } else if (event.key === 'Enter' && (context.type !== 'textarea' || event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      finish(true, field.value)
    }
  }
  const blur = (event: FocusEvent) => finish(true, (event.target as HTMLInputElement).value)
  if (context.type === 'select') {
    const options = context.options.includes(context.value) || !context.value ? context.options : [context.value, ...context.options]
    return html`<select
      class="editor"
      part="editor"
      aria-label=${context.label}
      @keydown=${keydown}
      @blur=${blur}
      @pointerdown=${() => (pointer = true)}
      @change=${(event: Event) => {
        changed = true
        if (pointer) finish(true, (event.target as HTMLSelectElement).value)
      }}
    >
      ${options.map((option) => html`<option value=${option} ?selected=${option === context.value}>${option}</option>`)}
    </select>`
  }
  if (context.type === 'textarea') {
    return html`<textarea
      class="editor editor--area"
      part="editor"
      aria-label=${context.label}
      .value=${context.value}
      @input=${input}
      @keydown=${keydown}
      @blur=${blur}
    ></textarea>`
  }
  return html`<input
    class="editor"
    part="editor"
    type=${context.type}
    inputmode=${context.type === 'number' ? 'decimal' : nothing}
    aria-label=${context.label}
    .value=${context.value}
    @input=${input}
    @keydown=${keydown}
    @blur=${blur}
  />`
}
