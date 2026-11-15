import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Header of the column of each tier's first value. */
  from: 'From',
  /** Header of the column of each tier's upper bound, when `key-label` is not set. */
  upTo: 'Up to',
  /** Header of the column of each tier's rate, when `value-label` is not set. */
  rate: 'Rate',
  /** Accessible name of a tier's upper bound field: `{0}` is the column header, `{1}` the tier's number, `{2}` its first value. */
  boundField: (column: string, tier: number, from: string) => `${column}, tier ${tier}, from ${from}`,
  /** Accessible name of a tier's rate field: `{0}` is the column header, `{1}` the tier's number. */
  rateField: (column: string, tier: number) => `${column}, tier ${tier}`,
  /** Placeholder of the last tier's empty bound, and its bound in view mode: the tier has no upper limit. */
  noLimit: 'No limit',
  /** Read between a tier's first value and its bound in view mode. */
  to: 'to',
  /** Text of the add button, when `add-label` is not set. */
  addTier: 'Add tier',
  /** Accessible name of a tier's remove button: `{0}` is the tier's number. */
  removeTier: (tier: number) => `Remove tier ${tier}`,
  /** Default content of the `empty` slot. */
  empty: 'No tiers',
  /** The form's message while `required` and no tier is filled in. */
  valueMissing: 'Please add at least one tier.',
  /** Under a bound that is not a number. */
  notNumber: 'Enter a number.',
  /** Under a bound that does not rise above the tier before: `{0}` is the bound it must exceed. */
  notAbove: (bound: string) => `Must be above ${bound}.`,
  /** Under a bound below its tier's first value, when `step` counts whole units: `{0}` is that first value. */
  notBelow: (from: string) => `Must be at least ${from}.`,
  /** Under an empty bound on a tier that is not the last. */
  openNotLast: 'Only the last tier can have no limit.',
  /** Start of the preview line: `{0}` is the quantity. */
  previewAt: (quantity: string) => `At ${quantity}`,
  /** One tier's share of the preview: `{0}` is the quantity in the tier, `{1}` its rate. */
  term: (units: string, rate: string) => `${units} × ${rate}`,
  /** The preview's result: `{0}` is the total. */
  total: (total: string) => `= ${total}`,
  /** The preview when the rates are not numbers: `{0}` is the tier's number, `{1}` its value. */
  tierValue: (tier: number, value: string) => `tier ${tier}: ${value}`,
  /** The preview when the quantity is above the last bound: `{0}` is the quantity. */
  noTier: (quantity: string) => `No tier covers ${quantity}.`,
}

/** The tier editor's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const tierEditorMessages = defineMessages('tier-editor', en)
