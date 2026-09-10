import { createContext } from '@lit/context'
import type { Radio } from './radio'

/** What a `c2-radio-group` shares with the `c2-radio` elements inside it. */
export interface RadioGroupContext {
  /** Form field name applied to every radio of the group. */
  name: string
  /** Disables every radio of the group. */
  disabled: boolean
  /** Called by a radio after its `checked` state changed, so the group can update `value` and uncheck the others. */
  checkedChanged(radio: Radio): void
}

export const radioGroupContext = createContext<RadioGroupContext | undefined>(Symbol('c2-radio-group'))
