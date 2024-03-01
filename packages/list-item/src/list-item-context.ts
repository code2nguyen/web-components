import { createContext } from '@lit/context'

export const selectedItemValueContext = createContext<string[]>(Symbol('list-item-selectedItemValue'))
