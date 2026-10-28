import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Label of the upper field, the amount sent. */
  fromLabel: 'You send',
  /** Label of the lower field, the amount received. */
  toLabel: 'Recipient gets',
  /** Label of the lower field when the reader typed in it, so it is the amount that is kept. */
  toExactLabel: 'Recipient gets exactly',
  /** The fee line. */
  fee: 'Fee',
  /** The line under the fee: what is left to convert. */
  converted: 'Amount converted',
  /** The rate line when the rate has no guarantee. */
  rate: 'Exchange rate',
  /** The rate line without a fee: `{0}` the sent currency, `{1}` the rate, `{2}` the received currency. */
  rateLine: (from: string, rate: string, to: string) => `1 ${from} = ${rate} ${to}`,
  /** A guaranteed rate's time left, `{0}` already formatted ("24s", "5m"). */
  guaranteed: (left: string) => `Guaranteed for ${left}`,
  /** The guaranteed rate ran out. */
  expired: 'Rate expired',
  /** After a swap, until the app sets the real reverse rate. */
  indicative: 'Indicative rate',
  /** The button that asks the app for a new rate once it expired. */
  newRate: 'New rate',
  /** Accessible name of the swap button. */
  swap: 'Swap currencies',
  /** Error under the upper field above `max`: `{0}` is the limit, formatted with its currency. */
  overMax: (limit: string) => `You can send up to ${limit}`,
  /** Announced after typing in the upper field pauses: `{0}` is the computed amount. */
  announceTo: (amount: string) => `Recipient gets ${amount}`,
  /** Announced after typing in the lower field pauses: `{0}` is the computed amount. */
  announceFrom: (amount: string) => `You send ${amount}`,
}

/** The FX converter's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const fxConverterMessages = defineMessages('fx-converter', en)
