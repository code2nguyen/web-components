import { createContext } from '@lit/context'

export interface LayoutContext {
  viewportWidth: number
  viewportHeight: number
  gridColumns: number
  gridRows?: number
  rowHeight?: number
}
export const layoutContext = createContext(Symbol('layout-context'))
