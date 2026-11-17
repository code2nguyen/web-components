import { createContext } from '@lit/context'

export const selectedItemValueContext = createContext<string[]>(Symbol('list-item-selectedItemValue'))

/**
 * Fired (bubbling) by a row whose `focus()` is called while it is not focusable yet: its list writes the roving
 * tabindex, which it otherwise defers until first use so a server-rendered row hydrates unchanged.
 */
export const LIST_ITEM_FOCUS_REQUEST_EVENT = 'c2-list-item-focus-request'
