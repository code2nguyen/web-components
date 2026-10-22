/**
 * The bank reconciliation itself, the way an accountant writes it on one page:
 *
 *   statement balance + deposits in transit − outstanding checks   = adjusted bank balance
 *   book balance      + adjustments posted                          = adjusted book balance
 *
 * The two adjusted balances agree, and the difference is zero, once every unrecorded item, mismatch and duplicate
 * has been adjusted. Matching never changes the balances: it is how you find what the adjustments must be.
 */
import { addDays } from './dates.ts'
import { formatAmount, sum } from './money.ts'
import { accountLabel, ACCOUNTS, CASH_ACCOUNT, cashEffectOf } from './journal.ts'
import type { BankLine, Cents, JournalLine, LedgerEntry, ReconException } from './types.ts'

export interface Reconciliation {
  statementBalance: Cents
  depositsInTransit: Cents
  /** Negative: checks written and not cleared. */
  outstandingChecks: Cents
  adjustedBank: Cents
  bookBalance: Cents
  adjustmentsPosted: Cents
  adjustedBook: Cents
  /** Adjusted bank minus adjusted book. Zero means reconciled. */
  difference: Cents
}

export function reconcile(opening: Cents, bank: BankLine[], ledger: LedgerEntry[], exceptions: ReconException[], posted: JournalLine[]): Reconciliation {
  const ledgerById = new Map(ledger.map((entry) => [entry.id, entry]))
  const timing = exceptions.filter((item) => item.kind === 'timing').map((item) => ledgerById.get(item.ledgerIds[0])!)
  const depositsInTransit = sum(timing.filter((entry) => entry.amount > 0).map((entry) => entry.amount))
  const outstandingChecks = sum(timing.filter((entry) => entry.amount < 0).map((entry) => entry.amount))
  const statementBalance = opening + sum(bank.map((line) => line.amount))
  const bookBalance = opening + sum(ledger.map((entry) => entry.amount))
  const adjustmentsPosted = cashEffectOf(posted)
  const adjustedBank = statementBalance + depositsInTransit + outstandingChecks
  const adjustedBook = bookBalance + adjustmentsPosted
  return {
    statementBalance,
    depositsInTransit,
    outstandingChecks,
    adjustedBank,
    bookBalance,
    adjustmentsPosted,
    adjustedBook,
    difference: adjustedBank - adjustedBook,
  }
}

/** Daily closing balance of each side over the period, for the balance chart. */
export function dailyBalances(opening: Cents, bank: BankLine[], ledger: LedgerEntry[], start: string, end: string) {
  const days: { day: string; bank: number; book: number }[] = []
  let bankBalance = opening
  let bookBalance = opening
  for (let day = start; day <= end; day = addDays(day, 1)) {
    bankBalance += sum(bank.filter((line) => line.date === day).map((line) => line.amount))
    bookBalance += sum(ledger.filter((entry) => entry.date === day).map((entry) => entry.amount))
    days.push({ day, bank: bankBalance, book: bookBalance })
  }
  return days
}

// --- Trial balance -----------------------------------------------------------------------------------------------

/**
 * September 30 balances before adjustments (debit positive). Cash is the book balance; retained earnings is whatever
 * makes the trial balance foot, as it would after the August close.
 */
const OTHER_BALANCES: Record<string, Cents> = {
  '1200': 86_412_30,
  '1300': 132_908_75,
  '1999': 0,
  '2000': -61_377_14,
  '2100': -18_240_00,
  '4000': -412_880_60,
  '4910': 3_118_25,
  '5000': 241_906_42,
  '6100': 129_843_80,
  '6200': 29_052_66,
  '6420': 2_486_19,
  '6810': 1_212_40,
  '7010': -406_12,
}

export function trialBalance(bookBalance: Cents, adjustments: JournalLine[] = []): Map<string, Cents> {
  const balances = new Map<string, Cents>([[CASH_ACCOUNT, bookBalance], ...Object.entries(OTHER_BALANCES)])
  balances.set('3000', -sum(balances.values()))
  for (const line of adjustments) {
    if (!(line.account in ACCOUNTS)) continue
    balances.set(line.account, (balances.get(line.account) ?? 0) + line.debit - line.credit)
  }
  return new Map([...balances].sort(([a], [b]) => a.localeCompare(b)))
}

/** One line per account, debit and credit columns aligned: the text the diff viewer compares. */
export function formatTrialBalance(balances: Map<string, Cents>): string {
  const width = 34
  const column = 16
  const lines = [...balances].map(([code, balance]) => {
    const debit = balance > 0 ? formatAmount(balance) : ''
    const credit = balance < 0 ? formatAmount(-balance) : ''
    return `${accountLabel(code).padEnd(width)}${debit.padStart(column)}${credit.padStart(column)}`
  })
  const debits = sum([...balances.values()].filter((value) => value > 0))
  const credits = -sum([...balances.values()].filter((value) => value < 0))
  const rule = '-'.repeat(width + column * 2)
  return [
    `${'Account'.padEnd(width)}${'Debit'.padStart(column)}${'Credit'.padStart(column)}`,
    rule,
    ...lines,
    rule,
    `${'Total'.padEnd(width)}${formatAmount(debits).padStart(column)}${formatAmount(credits).padStart(column)}`,
  ].join('\n')
}
