/**
 * The matching engine. Each rule only sees the lines the rules before it left over, from the most certain to the
 * least, so a strong pairing is never stolen by a weak one:
 *
 * 1. **Reference**: same normalised reference (invoice, payment or check number) and the same amount.
 * 2. **Amount and date**: the same amount within the date window, and no other candidate on either side. An
 *    ambiguous amount is left for a person rather than guessed.
 * 3. **Split**: one bank line equals the sum of two to four ledger entries from the same counterparty within the
 *    window (a customer paying several invoices at once).
 *
 * Lines that share a reference but not an amount are not matched: they come back as discrepancies, which the
 * exception classifier turns into amount mismatches.
 */
import { daysBetween } from './dates.ts'
import { sum } from './money.ts'
import type { BankLine, Discrepancy, LedgerEntry, Match, MatchOptions, MatchResult } from './types.ts'

export const DEFAULT_MATCH_OPTIONS: MatchOptions = { dateWindowDays: 3 }

/** Upper-case alphanumerics, and a check number stands for itself: `CHK-10244` and `10244` are one reference. */
export function normalizeReference(reference: string): string {
  return reference
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^CHK/, '')
}

function gap(dates: string[]): number {
  const sorted = [...dates].sort()
  return sorted.length < 2 ? 0 : daysBetween(sorted[0], sorted[sorted.length - 1])
}

export function matchId(bankIds: string[], ledgerIds: string[]): string {
  return `M:${[...bankIds].sort().join('+')}=${[...ledgerIds].sort().join('+')}`
}

function createMatch(rule: Match['rule'], bank: BankLine[], ledger: LedgerEntry[], confidence: number): Match {
  return {
    id: matchId(
      bank.map((line) => line.id),
      ledger.map((entry) => entry.id),
    ),
    rule,
    bankIds: bank.map((line) => line.id),
    ledgerIds: ledger.map((entry) => entry.id),
    confidence: Math.round(confidence * 100) / 100,
    amount: sum(bank.map((line) => line.amount)),
    dateGap: gap([...bank, ...ledger].map((line) => line.date)),
  }
}

/** Subsets of 2–4 entries whose amounts add up to `target`; the first found, or `undefined`. */
function findSubset(entries: LedgerEntry[], target: number): LedgerEntry[] | undefined {
  const pool = entries.slice(0, 12)
  const pick: LedgerEntry[] = []
  const search = (start: number, remaining: number): boolean => {
    if (remaining === 0 && pick.length >= 2) return true
    if (pick.length === 4) return false
    for (let index = start; index < pool.length; index++) {
      pick.push(pool[index])
      if (search(index + 1, remaining - pool[index].amount)) return true
      pick.pop()
    }
    return false
  }
  return search(0, target) ? [...pick] : undefined
}

export function autoMatch(bank: BankLine[], ledger: LedgerEntry[], options: MatchOptions = DEFAULT_MATCH_OPTIONS): MatchResult {
  const window = Math.max(0, options.dateWindowDays)
  const freeBank = new Map(bank.map((line) => [line.id, line]))
  const freeLedger = new Map(ledger.map((entry) => [entry.id, entry]))
  const matches: Match[] = []
  const take = (match: Match) => {
    match.bankIds.forEach((id) => freeBank.delete(id))
    match.ledgerIds.forEach((id) => freeLedger.delete(id))
    matches.push(match)
  }

  // 1. Reference and amount.
  for (const line of bank) {
    const reference = normalizeReference(line.reference)
    if (!reference) continue
    const entry = [...freeLedger.values()].find((candidate) => candidate.amount === line.amount && normalizeReference(candidate.docNo) === reference)
    if (entry) take(createMatch('reference', [line], [entry], 1))
  }

  // 2. Amount and date, only when the pairing is unambiguous from both sides.
  const within = (a: string, b: string) => Math.abs(daysBetween(a, b)) <= window
  for (const line of [...freeBank.values()]) {
    const candidates = [...freeLedger.values()].filter((entry) => entry.amount === line.amount && within(entry.date, line.date))
    if (candidates.length !== 1) continue
    const [entry] = candidates
    const rivals = [...freeBank.values()].filter((other) => other.amount === entry.amount && within(entry.date, other.date))
    if (rivals.length !== 1) continue
    take(createMatch('amount-date', [line], [entry], 0.95 - 0.05 * Math.abs(daysBetween(line.date, entry.date))))
  }

  // 3. One bank line for several ledger entries of the same counterparty.
  for (const line of [...freeBank.values()]) {
    if (!line.counterparty) continue
    const candidates = [...freeLedger.values()].filter(
      (entry) => entry.counterparty === line.counterparty && Math.sign(entry.amount) === Math.sign(line.amount) && within(entry.date, line.date),
    )
    const subset = findSubset(candidates, line.amount)
    if (subset) take(createMatch('split', [line], subset, 0.85))
  }

  // What is left over and shares a reference is a discrepancy, not a match.
  const discrepancies: Discrepancy[] = []
  const flagged = new Set<string>()
  for (const line of freeBank.values()) {
    const reference = normalizeReference(line.reference)
    if (!reference) continue
    const entry = [...freeLedger.values()].find(
      (candidate) => !flagged.has(candidate.id) && Math.sign(candidate.amount) === Math.sign(line.amount) && normalizeReference(candidate.docNo) === reference,
    )
    if (!entry) continue
    flagged.add(entry.id)
    discrepancies.push({ bankId: line.id, ledgerId: entry.id, difference: line.amount - entry.amount })
  }

  return { matches, discrepancies, unmatchedBank: [...freeBank.keys()], unmatchedLedger: [...freeLedger.keys()] }
}

export interface ManualMatchCheck {
  ok: boolean
  bankTotal: number
  ledgerTotal: number
  difference: number
  reason?: string
}

/** Whether a selection can be matched by hand: at least one line on each side, and equal totals. */
export function checkManualMatch(bank: BankLine[], ledger: LedgerEntry[]): ManualMatchCheck {
  const bankTotal = sum(bank.map((line) => line.amount))
  const ledgerTotal = sum(ledger.map((entry) => entry.amount))
  const difference = bankTotal - ledgerTotal
  if (!bank.length || !ledger.length) return { ok: false, bankTotal, ledgerTotal, difference, reason: 'Select at least one line on each side.' }
  if (difference !== 0) return { ok: false, bankTotal, ledgerTotal, difference, reason: 'The two sides must add up to the same amount.' }
  return { ok: true, bankTotal, ledgerTotal, difference }
}

export function manualMatch(bank: BankLine[], ledger: LedgerEntry[]): Match {
  return createMatch('manual', bank, ledger, 1)
}

/** Takes matches back out of a result (a person disagreed with the engine): their lines are unmatched again. */
export function withoutMatches(result: MatchResult, ids: string[]): MatchResult {
  if (!ids.length) return result
  const rejected = result.matches.filter((match) => ids.includes(match.id))
  return {
    ...result,
    matches: result.matches.filter((match) => !ids.includes(match.id)),
    unmatchedBank: [...result.unmatchedBank, ...rejected.flatMap((match) => match.bankIds)],
    unmatchedLedger: [...result.unmatchedLedger, ...rejected.flatMap((match) => match.ledgerIds)],
  }
}

/**
 * Folds manual matches into an automatic result: their lines leave the unmatched lists, and a discrepancy that
 * involves one of them disappears.
 */
export function applyManualMatches(result: MatchResult, manual: Match[]): MatchResult {
  if (!manual.length) return result
  const bankTaken = new Set(manual.flatMap((match) => match.bankIds))
  const ledgerTaken = new Set(manual.flatMap((match) => match.ledgerIds))
  return {
    matches: [...result.matches, ...manual],
    discrepancies: result.discrepancies.filter((item) => !bankTaken.has(item.bankId) && !ledgerTaken.has(item.ledgerId)),
    unmatchedBank: result.unmatchedBank.filter((id) => !bankTaken.has(id)),
    unmatchedLedger: result.unmatchedLedger.filter((id) => !ledgerTaken.has(id)),
  }
}
