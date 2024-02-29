import { createContext } from '@lit/context'

export const selectedTabContext = createContext<string>(Symbol('selected-tab-context'))
