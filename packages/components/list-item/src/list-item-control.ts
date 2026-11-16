import { fieldConsumerOf, type FieldContextConsumer } from '@c2n/core/contexts/field.js'
import type { ListItem } from './list-item.js'

/**
 * The settings-row behaviour of `c2-list-item`, loaded the first time a row's `control` slot is filled, so an ordinary
 * row never pays for it: naming the control through the field protocol, keeping that name current, and activating the
 * control from a click on the row.
 */

interface ControlState {
  consumer?: FieldContextConsumer
  observer?: MutationObserver
}

const states = new WeakMap<ListItem, ControlState>()

/**
 * As a `c2-form-field`'s label does: focus the control and, for a self-labelled one (a switch, a checkbox) or a native
 * control, click the element that took the focus. A select or a text field only takes the focus.
 */
export function activateControl(control: HTMLElement) {
  control.focus()
  const consumer = fieldConsumerOf(control)
  if (consumer && !consumer.selfLabelled) return
  let target: Element = control
  while (target.shadowRoot?.activeElement) target = target.shadowRoot.activeElement
  ;(target as HTMLElement).click()
}

function slotText(slot: HTMLSlotElement | null) {
  return (slot?.assignedNodes({ flatten: true }) ?? [])
    .map((node) => node.textContent)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Lets go of the control the row named, if any. */
export function releaseControl(row: ListItem) {
  const state = states.get(row)
  if (!state) return
  state.consumer?.detach(row)
  state.consumer = undefined
  state.observer?.disconnect()
}

/**
 * Names and describes a switch, checkbox or select in the row's `control` slot with the row's text and `description`,
 * or lets go of one that left it. A text field is left alone: claiming it would hide its own hint and error line, which
 * the row cannot show for it.
 */
export function syncControl(row: ListItem) {
  let consumer = fieldConsumerOf(row.controlElement)
  if (consumer?.kind === 'text') consumer = undefined
  let state = states.get(row)
  if (consumer !== state?.consumer) releaseControl(row)
  if (!consumer) return
  if (!state) states.set(row, (state = {}))
  state.consumer = consumer
  // Text edited in place (a framework switching language) fires no slotchange.
  state.observer ??= new MutationObserver(() => row.requestUpdate())
  state.observer.observe(row, { subtree: true, childList: true, characterData: true })
  const root = row.renderRoot
  consumer.attach(row, {
    label: slotText(root.querySelector<HTMLSlotElement>('slot:not([name])')),
    description: slotText(root.querySelector<HTMLSlotElement>('slot[name="description"]')),
    invalid: false,
  })
}
