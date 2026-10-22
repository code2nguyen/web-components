/**
 * The domain of the close workbench. Every amount is an integer count of cents, signed from the cash account's point
 * of view: money coming into the bank account is positive, money going out is negative. Dates are calendar days
 * (`YYYY-MM-DD`), never instants.
 */

export type Cents = number
export type Day = string

/** How a line moved money, as the bank feed or the ledger reports it. */
export type Channel = 'ach' | 'wire' | 'check' | 'card' | 'deposit' | 'fee' | 'interest' | 'pos'

/** One line of the bank statement, as the bank feed delivers it. */
export interface BankLine {
  id: string
  date: Day
  description: string
  amount: Cents
  channel: Channel
  /** Invoice, payment or check number the bank carried through, if any. */
  reference: string
  /** Payer or payee name the feed parsed out of the description; empty when it could not. */
  counterparty: string
}

export type LedgerSource = 'AR' | 'AP' | 'GL' | 'Payroll'

/** One posting to the cash account in the general ledger. */
export interface LedgerEntry {
  id: string
  date: Day
  description: string
  amount: Cents
  channel: Channel
  source: LedgerSource
  /** Document number: `INV-1042`, `PAY-7731`, `CHK-10231`, `JE-0901`. */
  docNo: string
  counterparty: string
}

/** Which rule paired the lines of a match. */
export type MatchRule = 'reference' | 'amount-date' | 'split' | 'manual'

export interface Match {
  id: string
  rule: MatchRule
  bankIds: string[]
  ledgerIds: string[]
  /** 0 to 1: how sure the rule is. A manual match is 1. */
  confidence: number
  amount: Cents
  /** Days between the earliest and the latest line of the match. */
  dateGap: number
}

/** A bank line and a ledger entry that share a reference but not an amount. */
export interface Discrepancy {
  bankId: string
  ledgerId: string
  /** Bank minus ledger. */
  difference: Cents
}

export interface MatchOptions {
  /** Largest gap, in days, the amount-and-date and split rules accept. */
  dateWindowDays: number
}

export interface MatchResult {
  matches: Match[]
  discrepancies: Discrepancy[]
  unmatchedBank: string[]
  unmatchedLedger: string[]
}

/**
 * What an unexplained line turned out to be.
 *
 * - `unrecorded`: on the statement, not in the books (fees, interest, a returned item, a card purchase).
 * - `amount-mismatch`: both sides carry the same reference with different amounts.
 * - `duplicate`: a ledger entry whose document number another, matched entry already carries.
 * - `timing`: an end-of-period check or deposit the bank has not processed yet; it reconciles, it needs no entry.
 * - `unmatched`: a ledger entry with no explanation yet.
 */
export type ExceptionKind = 'unrecorded' | 'amount-mismatch' | 'duplicate' | 'timing' | 'unmatched'

/** The board column an exception sits in. */
export type ExceptionStage = 'new' | 'investigating' | 'adjust' | 'resolved'

export interface ReconException {
  id: string
  kind: ExceptionKind
  bankIds: string[]
  ledgerIds: string[]
  title: string
  /** What the workbench thinks happened, in one sentence. */
  hint: string
  /** The amount the books are off by, from the cash account's point of view (what an adjustment would post). */
  cashEffect: Cents
  /** The line amount shown on the card. */
  amount: Cents
  date: Day
}

/** One line of an adjusting journal entry. */
export interface JournalLine {
  ref: string
  account: string
  memo: string
  debit: Cents
  credit: Cents
}
