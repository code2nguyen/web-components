import { createContext } from '@lit/context'

export interface LayoutContext {
    viewportWidth: Number;
    viewportHeight: Number;
    gridColumns: Number;
    gridRows?: Number;
    rowHeight?: Number;
}
export const layoutContext = createContext(Symbol('layout-context'))
