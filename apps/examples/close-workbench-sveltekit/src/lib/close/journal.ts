/**
 * Adjusting journal entries: proposed from the exceptions marked for adjustment, edited by hand in a spreadsheet,
 * checked, and posted. The spreadsheet's raw inputs are the draft; this module reads them back into lines.
 */
import { looksTransposed, unrecordedCategory, type UnrecordedCategory } from './exceptions.ts'
import { sum, toCents, toDollars } from './money.ts'
import type { BankLine, Cents, JournalLine, LedgerEntry, ReconException } from './types.ts'

export const CASH_ACCOUNT = '1010'

export const ACCOUNTS: Record<string, string> = {
  '1010': 'Cash – Operating',
  '1200': 'Accounts receivable',
  '1300': 'Inventory – green coffee',
  '1999': 'Suspense',
  '2000': 'Accounts payable',
  '2100': 'Accrued liabilities',
  '3000': 'Retained earnings',
  '4000': 'Wholesale revenue',
  '4910': 'Sales discounts',
  '5000': 'Cost of goods sold',
  '6100': 'Payroll',
  '6200': 'Rent & utilities',
  '6420': 'Office supplies',
  '6810': 'Bank charges',
  '7010': 'Interest income',
}

export const accountLabel = (code: string) => `${code} ${ACCOUNTS[code] ?? 'Unknown account'}`

const contraForUnrecorded: Record<UnrecordedCategory, string> = {
  'bank-fee': '6810',
  interest: '7010',
  'returned-item': '1200',
  'card-purchase': '6420',
  other: '1999',
}

function cashPair(ref: string, memo: string, cashEffect: Cents, contra: string): JournalLine[] {
  const amount = Math.abs(cashEffect)
  const cash: JournalLine = { ref, account: CASH_ACCOUNT, memo, debit: cashEffect > 0 ? amount : 0, credit: cashEffect < 0 ? amount : 0 }
  const other: JournalLine = { ref, account: contra, memo, debit: cash.credit, credit: cash.debit }
  // Debits first, as a journal is read.
  return cash.debit ? [cash, other] : [other, cash]
}

/** The entry that resolves one exception, or none when it needs no entry (timing, unexplained). */
export function proposeEntry(exception: ReconException, ref: string, bank: Map<string, BankLine>, ledger: Map<string, LedgerEntry>): JournalLine[] {
  if (exception.cashEffect === 0) return []
  switch (exception.kind) {
    case 'unrecorded': {
      const line = bank.get(exception.bankIds[0])!
      return cashPair(ref, line.description, exception.cashEffect, contraForUnrecorded[unrecordedCategory(line)])
    }
    case 'amount-mismatch': {
      const entry = ledger.get(exception.ledgerIds[0])!
      const transposed = looksTransposed(exception.cashEffect)
      const contra = entry.amount > 0 ? (transposed ? '1200' : '4910') : transposed ? '2000' : '6810'
      return cashPair(ref, `${entry.docNo} correct to bank amount`, exception.cashEffect, contra)
    }
    case 'duplicate': {
      const entry = ledger.get(exception.ledgerIds[0])!
      return cashPair(ref, `Reverse duplicate ${entry.docNo}`, exception.cashEffect, entry.amount < 0 ? '2000' : '1200')
    }
    case 'unmatched': {
      const entry = ledger.get(exception.ledgerIds[0])!
      return cashPair(ref, `Reverse ${entry.docNo || entry.description}: not on the statement`, exception.cashEffect, entry.amount < 0 ? '2000' : '1200')
    }
    default:
      return []
  }
}

export interface ProposedJournal {
  lines: JournalLine[]
  /** Which exception each entry's ref resolves, so posting resolves only the exceptions whose entry was posted. */
  refs: Map<string, string>
}

export function proposeJournal(exceptions: ReconException[], bank: BankLine[], ledger: LedgerEntry[]): ProposedJournal {
  const bankById = new Map(bank.map((line) => [line.id, line]))
  const ledgerById = new Map(ledger.map((entry) => [entry.id, entry]))
  const refs = new Map<string, string>()
  const lines = exceptions.flatMap((exception) => {
    const ref = `ADJ-${String(refs.size + 1).padStart(2, '0')}`
    const entry = proposeEntry(exception, ref, bankById, ledgerById)
    if (entry.length) refs.set(ref, exception.id)
    return entry
  })
  return { lines, refs }
}

/** What posting the lines does to the cash account. */
export function cashEffectOf(lines: JournalLine[]): Cents {
  return sum(lines.filter((line) => line.account === CASH_ACCOUNT).map((line) => line.debit - line.credit))
}

// --- The spreadsheet draft ---------------------------------------------------------------------------------------

export type SheetCell = string | number | boolean | null
export type SheetData = SheetCell[][]

export const SHEET_COLUMNS = [
  { label: 'Ref', width: 84 },
  { label: 'Account', width: 220 },
  { label: 'Memo', width: 300 },
  { label: 'Debit', width: 120, format: 'currency', align: 'end' },
  { label: 'Credit', width: 120, format: 'currency', align: 'end' },
] as const

const TOTAL_LABEL = 'Total'

/** Blank rows left between the proposed lines and the totals, for lines the reader adds by hand. */
export const SPARE_ROWS = 2

/**
 * Lines to spreadsheet rows, then {@link SPARE_ROWS} blank rows, then a totals row of formulas the reader can watch
 * recalculate. The sums cover the blank rows too, so a line typed into them is counted, and never their own row.
 */
export function toSheet(lines: JournalLine[]): SheetData {
  const rows: SheetData = lines.map((line) => [
    line.ref,
    accountLabel(line.account),
    line.memo,
    line.debit ? toDollars(line.debit) : null,
    line.credit ? toDollars(line.credit) : null,
  ])
  for (let spare = 0; spare < SPARE_ROWS; spare++) rows.push([null, null, null, null, null])
  const last = rows.length
  rows.push(['', '', TOTAL_LABEL, `=SUM(D1:D${last})`, `=SUM(E1:E${last})`])
  return rows
}

function readAmount(cell: SheetCell): { cents: Cents; error?: string } {
  if (cell === null || cell === '' || cell === undefined) return { cents: 0 }
  const value = typeof cell === 'number' ? cell : Number(String(cell).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(value)) return { cents: 0, error: `"${cell}" is not an amount` }
  if (value < 0) return { cents: 0, error: 'Amounts are positive; use the other column instead of a minus sign' }
  return { cents: toCents(value) }
}

export interface ParsedJournal {
  lines: JournalLine[]
  errors: string[]
  debits: Cents
  credits: Cents
  balanced: boolean
  /** What posting the draft does to the cash account. */
  cashEffect: Cents
}

/** Reads the spreadsheet's raw inputs back into journal lines. Formula rows (the totals) are skipped. */
export function parseSheet(data: SheetData): ParsedJournal {
  const lines: JournalLine[] = []
  const errors: string[] = []
  data.forEach((row, index) => {
    const [ref, account, memo, debitCell, creditCell] = row
    if (String(memo ?? '') === TOTAL_LABEL) return
    if (row.every((cell) => cell === null || cell === '' || cell === undefined)) return
    const where = `Row ${index + 1}`
    // The draft holds raw inputs, so a formula's result is not known here: say so rather than drop the line.
    if ([debitCell, creditCell].some((cell) => typeof cell === 'string' && cell.startsWith('='))) {
      errors.push(`${where}: type the amount; a formula in a journal line is not posted`)
      return
    }
    const code = /^\s*(\d{4})/.exec(String(account ?? ''))?.[1]
    const debit = readAmount(debitCell)
    const credit = readAmount(creditCell)
    if (!code || !(code in ACCOUNTS)) errors.push(`${where}: "${account ?? ''}" is not an account in the chart`)
    for (const error of [debit.error, credit.error]) if (error) errors.push(`${where}: ${error}`)
    if (debit.cents && credit.cents) errors.push(`${where}: a line is either a debit or a credit`)
    if (!debit.cents && !credit.cents) errors.push(`${where}: no amount`)
    lines.push({ ref: String(ref ?? ''), account: code ?? '', memo: String(memo ?? ''), debit: debit.cents, credit: credit.cents })
  })
  const debits = sum(lines.map((line) => line.debit))
  const credits = sum(lines.map((line) => line.credit))
  const balanced = debits === credits
  if (lines.length && !balanced) errors.push(`Debits and credits differ by ${((debits - credits) / 100).toFixed(2)}`)
  return { lines, errors, debits, credits, balanced, cashEffect: cashEffectOf(lines) }
}
