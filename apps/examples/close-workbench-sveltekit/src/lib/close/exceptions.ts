/**
 * Turns what the matching engine left over into exceptions a person can work: each one says what probably happened,
 * and how far it moves the book balance once it is adjusted.
 */
import { daysBetween } from './dates.ts'
import { formatMoney } from './money.ts'
import { normalizeReference } from './matching.ts'
import type { BankLine, Channel, Day, ExceptionKind, LedgerEntry, MatchResult, ReconException } from './types.ts'

/** Ledger-only checks and deposits this close to the period end are timing differences, not errors. */
export const TIMING_DAYS = 3

/** What kind of unrecorded bank line this is, which also decides the account its adjustment goes to. */
export type UnrecordedCategory = 'bank-fee' | 'interest' | 'returned-item' | 'card-purchase' | 'other'

export function unrecordedCategory(line: BankLine): UnrecordedCategory {
  const text = line.description.toUpperCase()
  if (/RETURNED ITEM|\bNSF\b/.test(text)) return 'returned-item'
  if (line.channel === 'interest' || /INTEREST/.test(text)) return 'interest'
  if (line.channel === 'fee' || /FEE|CHARGE/.test(text)) return 'bank-fee'
  if (line.channel === 'pos') return 'card-purchase'
  return 'other'
}

/** A difference made of transposed digits is always divisible by 9: 1,532 − 1,352 = 180. */
export function looksTransposed(difference: number): boolean {
  return difference !== 0 && difference % 9 === 0
}

const unrecordedHints: Record<UnrecordedCategory, string> = {
  'bank-fee': 'A bank charge on the statement that was never booked.',
  interest: 'Interest the bank credited; book it as interest income.',
  'returned-item': 'A customer payment came back unpaid. Reinstate the receivable and chase the customer.',
  'card-purchase': 'A debit card purchase with no expense entry. Find the receipt and book it.',
  other: 'On the statement but not in the books. Find out what it is.',
}

export function exceptionId(kind: ExceptionKind, bankIds: string[], ledgerIds: string[]): string {
  return `X:${kind}:${[...bankIds, ...ledgerIds].join('+')}`
}

/** What a same-reference, different-amount pair most likely is, read from which side of the books it is on and which way it is off. */
function mismatchHint(entry: LedgerEntry, difference: number): string {
  const amount = formatMoney(Math.abs(difference))
  if (entry.amount > 0)
    return difference < 0
      ? `${entry.counterparty} paid ${amount} less than invoiced, likely an early-payment discount.`
      : `${entry.counterparty} paid ${amount} more than invoiced: an overpayment to refund or apply to the next invoice.`
  return difference < 0 ? `The bank paid out ${amount} more than was booked.` : `The bank paid out ${amount} less than was booked.`
}

/** Book entries that reach the bank days after they are written: checks, card settlements and deposits. */
const IN_TRANSIT: ReadonlySet<Channel> = new Set(['check', 'card', 'deposit'])

export function classifyExceptions(bank: BankLine[], ledger: LedgerEntry[], result: MatchResult, periodEnd: Day): ReconException[] {
  const bankById = new Map(bank.map((line) => [line.id, line]))
  const ledgerById = new Map(ledger.map((entry) => [entry.id, entry]))
  const exceptions: ReconException[] = []
  const inDiscrepancy = new Set(result.discrepancies.flatMap((item) => [item.bankId, item.ledgerId]))

  for (const { bankId, ledgerId, difference } of result.discrepancies) {
    const line = bankById.get(bankId)!
    const entry = ledgerById.get(ledgerId)!
    const transposed = looksTransposed(difference)
    exceptions.push({
      id: exceptionId('amount-mismatch', [bankId], [ledgerId]),
      kind: 'amount-mismatch',
      bankIds: [bankId],
      ledgerIds: [ledgerId],
      title: `${entry.docNo}: bank ${formatMoney(line.amount)}, books ${formatMoney(entry.amount)}`,
      hint: transposed
        ? `The difference of ${formatMoney(Math.abs(difference))} is divisible by 9, which usually means transposed digits in the entry.`
        : mismatchHint(entry, difference),
      cashEffect: difference,
      amount: difference,
      date: line.date,
    })
  }

  for (const id of result.unmatchedBank) {
    if (inDiscrepancy.has(id)) continue
    const line = bankById.get(id)!
    const category = unrecordedCategory(line)
    // An unmatched entry of the same amount on the other side is far likelier than an unbooked receipt.
    const twin =
      category === 'other' ? result.unmatchedLedger.map((ledgerId) => ledgerById.get(ledgerId)!).find((entry) => entry.amount === line.amount) : undefined
    exceptions.push({
      id: exceptionId('unrecorded', [id], []),
      kind: 'unrecorded',
      bankIds: [id],
      ledgerIds: [],
      title: line.description,
      hint: twin
        ? `${twin.docNo} (${twin.description}) is unmatched for the same amount, ${Math.abs(daysBetween(twin.date, line.date))} days apart. Match the two by hand instead of booking it.`
        : unrecordedHints[category],
      cashEffect: line.amount,
      amount: line.amount,
      date: line.date,
    })
  }

  const matchedDocNos = new Set(
    result.matches.flatMap((match) => match.ledgerIds.map((ledgerId) => normalizeReference(ledgerById.get(ledgerId)!.docNo))).filter(Boolean),
  )
  for (const id of result.unmatchedLedger) {
    if (inDiscrepancy.has(id)) continue
    const entry = ledgerById.get(id)!
    const reference = normalizeReference(entry.docNo)
    let kind: ExceptionKind = 'unmatched'
    // Unexplained, it is a posting the bank never saw: reversing it is the entry that would square the books. The
    // likelier answer is a bank line under another date or amount, which a manual match resolves instead.
    let hint = 'In the books but not on the statement. Look for it on the bank side and match the two by hand; if it never happened, reverse it.'
    let cashEffect = -entry.amount
    if (reference && matchedDocNos.has(reference)) {
      kind = 'duplicate'
      hint = `${entry.docNo} is already matched to the statement; this second posting doubles it. Reverse it.`
      cashEffect = -entry.amount
    } else if (IN_TRANSIT.has(entry.channel) && daysBetween(entry.date, periodEnd) < TIMING_DAYS) {
      kind = 'timing'
      cashEffect = 0
      hint =
        entry.amount < 0
          ? 'An outstanding check: written at month end, not cleared yet. It reconciles without an entry.'
          : 'A deposit in transit: booked at month end, credited by the bank next month. It reconciles without an entry.'
    }
    exceptions.push({
      id: exceptionId(kind, [], [id]),
      kind,
      bankIds: [],
      ledgerIds: [id],
      title: entry.description,
      hint,
      cashEffect,
      amount: entry.amount,
      date: entry.date,
    })
  }

  return exceptions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

/** Whether resolving the exception takes a journal entry (as opposed to an explanation). */
export function needsAdjustment(exception: ReconException): boolean {
  return exception.cashEffect !== 0
}
