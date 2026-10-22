import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyExceptions, looksTransposed, unrecordedCategory } from '../../src/lib/close/exceptions.ts'
import { CASH_ACCOUNT, parseSheet, proposeJournal, SPARE_ROWS, toSheet } from '../../src/lib/close/journal.ts'
import { applyManualMatches, autoMatch, manualMatch } from '../../src/lib/close/matching.ts'
import { formatTrialBalance, reconcile, trialBalance } from '../../src/lib/close/reconciliation.ts'
import { createSampleMonth, OPENING_BALANCE, PERIOD } from '../../src/lib/close/sample.ts'

const { bank, ledger } = createSampleMonth()
const auto = autoMatch(bank, ledger)
const exceptions = classifyExceptions(bank, ledger, auto, PERIOD.end)
const kinds = (kind: string) => exceptions.filter((item) => item.kind === kind)

test('the leftovers are classified the way an accountant would', () => {
  assert.deepEqual(
    kinds('unrecorded')
      .map((item) => item.title)
      .toSorted(),
    [
      'INTEREST PAID',
      'MOBILE DEPOSIT',
      'MONTHLY SERVICE CHARGE',
      'OUTGOING WIRE TRANSFER FEE',
      'POS PURCHASE OFFICE DEPOT #2291',
      'RETURN ITEM FEE',
      'RETURNED ITEM NSF BLUEBIRD CAFE INV-1061',
    ],
  )
  assert.equal(kinds('amount-mismatch').length, 2)
  assert.equal(kinds('duplicate').length, 1)
  assert.deepEqual(
    kinds('timing')
      .map((item) => item.title)
      .toSorted(),
    ['Card sales deposit 09', 'Check 10251 · Alder Electric', 'Check 10252 · Coastal Signs'],
  )
  assert.deepEqual(
    kinds('unmatched').map((item) => item.title),
    ['Receipt Lindqvist Catering · INV-1059'],
  )
})

test('unrecorded lines are told apart by what the bank wrote', () => {
  const category = (text: string) => unrecordedCategory(bank.find((line) => line.description === text)!)
  assert.equal(category('OUTGOING WIRE TRANSFER FEE'), 'bank-fee')
  assert.equal(category('RETURNED ITEM NSF BLUEBIRD CAFE INV-1061'), 'returned-item')
  assert.equal(category('INTEREST PAID'), 'interest')
  assert.equal(category('POS PURCHASE OFFICE DEPOT #2291'), 'card-purchase')
  assert.equal(category('MOBILE DEPOSIT'), 'other')
})

test('a difference divisible by 9 is flagged as transposed digits', () => {
  assert.equal(looksTransposed(180_00), true)
  assert.equal(looksTransposed(-125_00), false)
  assert.equal(looksTransposed(0), false)
  const transposed = kinds('amount-mismatch').find((item) => item.cashEffect === 180_00)
  assert.match(transposed!.hint, /divisible by 9/)
})

test('the mobile deposit points at its twin instead of a suspense entry', () => {
  assert.match(kinds('unrecorded').find((item) => item.title === 'MOBILE DEPOSIT')!.hint, /INV-1059.*9 days apart/)
})

test('the proposed journal balances, entry by entry', () => {
  const { lines, refs } = proposeJournal(exceptions, bank, ledger)
  const byRef = Map.groupBy(lines, (line) => line.ref)
  assert.equal(byRef.size, exceptions.filter((item) => item.cashEffect !== 0).length)
  assert.deepEqual([...refs.keys()], [...byRef.keys()])
  for (const [ref, entry] of byRef) {
    const debits = entry.reduce((total, line) => total + line.debit, 0)
    const credits = entry.reduce((total, line) => total + line.credit, 0)
    assert.equal(debits, credits, ref)
    assert.equal(entry.filter((line) => line.account === CASH_ACCOUNT).length, 1, ref)
  }
})

test('posting every adjustment and matching the late deposit reconciles to zero', () => {
  const before = reconcile(OPENING_BALANCE, bank, ledger, exceptions, [])
  assert.notEqual(before.difference, 0)
  assert.equal(before.adjustedBank, before.statementBalance + before.depositsInTransit + before.outstandingChecks)

  // Every exception has an entry that squares the books, the unexplained receipt included (as a reversal)...
  const everything = proposeJournal(exceptions, bank, ledger).lines
  assert.equal(reconcile(OPENING_BALANCE, bank, ledger, exceptions, everything).difference, 0)
  assert.ok(everything.some((line) => line.memo === 'Reverse INV-1059: not on the statement'))

  // ...but the receipt and the mobile deposit are one payment: matching them by hand is the right fix, and needs
  // neither the reversal nor a suspense entry.
  const deposit = bank.find((line) => line.description === 'MOBILE DEPOSIT')!
  const receipt = ledger.find((entry) => entry.docNo === 'INV-1059')!
  const merged = applyManualMatches(auto, [manualMatch([deposit], [receipt])])
  const remaining = classifyExceptions(bank, ledger, merged, PERIOD.end)
  assert.ok(!remaining.some((item) => item.title === 'MOBILE DEPOSIT' || item.kind === 'unmatched'))
  const after = reconcile(OPENING_BALANCE, bank, ledger, remaining, proposeJournal(remaining, bank, ledger).lines)
  assert.equal(after.difference, 0)
  assert.equal(after.adjustedBank, after.adjustedBook)
})

test('the spreadsheet draft round-trips and reports what is wrong with an edit', () => {
  const { lines } = proposeJournal(exceptions, bank, ledger)
  const sheet = toSheet(lines)
  // The totals cover the spare rows above them, so a line typed there counts.
  assert.equal(sheet.length, lines.length + SPARE_ROWS + 1)
  assert.equal(sheet.at(-1)![3], `=SUM(D1:D${lines.length + SPARE_ROWS})`)
  assert.equal(toSheet([]).at(-1)![3], `=SUM(D1:D${SPARE_ROWS})`, 'an empty draft never sums its own row')
  const parsed = parseSheet(sheet)
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.balanced, true)
  assert.deepEqual(
    parsed.lines.map((line) => [line.account, line.debit, line.credit]),
    lines.map((line) => [line.account, line.debit, line.credit]),
  )

  const edited = sheet.map((row) => [...row])
  edited[0][3] = 20
  edited[1][1] = '9999 Nowhere'
  edited.splice(2, 0, ['ADJ-99', '6810 Bank charges', 'Both sides', 5, 5])
  const broken = parseSheet(edited)
  assert.equal(broken.balanced, false)
  assert.ok(broken.errors.some((error) => /Row 2: "9999 Nowhere" is not an account/.test(error)))
  assert.ok(broken.errors.some((error) => /Row 3: a line is either a debit or a credit/.test(error)))
  assert.ok(broken.errors.some((error) => /Debits and credits differ/.test(error)))

  // A formula in a line is reported, not silently dropped.
  const formula = sheet.map((row) => [...row])
  formula[0][3] = '=10+5'
  assert.ok(parseSheet(formula).errors.some((error) => /Row 1: type the amount/.test(error)))
})

test('the trial balance foots before and after the adjustments', () => {
  const book = reconcile(OPENING_BALANCE, bank, ledger, exceptions, []).bookBalance
  const footing = (balances: Map<string, number>) => [...balances.values()].reduce((total, value) => total + value, 0)
  const before = trialBalance(book)
  assert.equal(footing(before), 0)
  const after = trialBalance(book, proposeJournal(exceptions, bank, ledger).lines)
  assert.equal(footing(after), 0)
  const text = formatTrialBalance(before).trimEnd().split('\n')
  assert.equal(text.length, before.size + 4)
  assert.equal(new Set(text.map((line) => line.length)).size, 1, 'every line has the same width')
})

test('a mismatch hint reads the direction of the difference', () => {
  const pair = (bankAmount: number, bookAmount: number) => {
    const line = { ...bank[0], id: 'B-X', amount: bankAmount, reference: 'INV-9999' }
    const entry = { ...ledger[0], id: 'L-X', amount: bookAmount, docNo: 'INV-9999', counterparty: 'Acme' }
    const [mismatch] = classifyExceptions([line], [entry], autoMatch([line], [entry]), PERIOD.end)
    return mismatch.hint
  }
  assert.match(pair(4_950_00, 5_000_00), /paid \$50\.00 less than invoiced/)
  assert.match(pair(5_050_00, 5_000_00), /paid \$50\.00 more than invoiced/)
  assert.match(pair(-5_050_00, -5_000_00), /paid out \$50\.00 more/)
  assert.match(pair(-4_950_00, -5_000_00), /paid out \$50\.00 less/)
})

test('a deposit booked at month end is in transit, and an unexplained entry can be reversed', () => {
  const entry = (id: string, date: string, channel: 'deposit' | 'ach') => ({ ...ledger[0], id, date, channel, amount: 2_000_00, docNo: id })
  const late = entry('L-LATE', '2026-09-30', 'deposit')
  const stray = entry('L-STRAY', '2026-09-10', 'ach')
  const result = autoMatch([], [late, stray])
  const [first, second] = classifyExceptions([], [late, stray], result, PERIOD.end)
  assert.equal(second.kind, 'timing')
  assert.equal(second.cashEffect, 0)
  assert.equal(first.kind, 'unmatched')
  assert.equal(first.cashEffect, -2_000_00)
  const recon = reconcile(0, [], [late, stray], [first, second], proposeJournal([first], [], [late, stray]).lines)
  assert.equal(recon.difference, 0)
})
