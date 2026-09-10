import { createContext } from '@lit/context'
import type { Details } from './details'

export interface AccordionContext {
  expandedChanged(panel: Details): void
}

export const accordionContext = createContext<AccordionContext>(Symbol('details-accordion'))
