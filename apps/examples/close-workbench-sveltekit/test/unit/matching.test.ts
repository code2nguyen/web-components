import assert from 'node:assert/strict'
import test from 'node:test'

import { applyManualMatches, autoMatch, checkManualMatch, manualMatch, normalizeReference, withoutMatches } from '../../src/lib/close/matching.ts'
import { createSampleMonth } from '../../src/lib/close/sample.ts'
import type { BankLine, LedgerEntry } from '../../src/lib/close/types.ts'

const { bank, ledger } = createSampleMonth()
const result = autoMatch(bank, ledger)
const bankBy = (text: string) => bank.find((line) => line.description.includes(text))!
const ledgerBy = (docNo: string) => ledger.filter((entry) => entry.docNo === docNo)
const matchOf = (bankId: string) => result.matches.find((match) => match.bankIds.includes(bankId))

test('the sample month is deterministic', () => {
  assert.deepEqual(createSampleMonth(), createSampleMonth())
  assert.equal(new Set(bank.map((line) => line.id)).size, bank.length)
  assert.equal(new Set(ledger.map((entry) => entry.id)).size, ledger.length)
})

test('references are compared without punctuation, and a check number stands for itself', () => {
  assert.equal(normalizeReference('CHK-10244'), '10244')
  assert.equal(normalizeReference('10244'), '10244')
  assert.equal(normalizeReference('inv-1061'), 'INV1061')
  assert.equal(normalizeReference(''), '')
})

test('every line is accounted for exactly once', () => {
  const bankIds = [...result.matches.flatMap((match) => match.bankIds), ...result.unmatchedBank]
  const ledgerIds = [...result.matches.flatMap((match) => match.ledgerIds), ...result.unmatchedLedger]
  assert.deepEqual(bankIds.toSorted(), bank.map((line) => line.id).toSorted())
  assert.deepEqual(ledgerIds.toSorted(), ledger.map((entry) => entry.id).toSorted())
})

test('a matched group always nets to zero', () => {
  const amount = new Map<string, number>([...bank, ...ledger].map((line) => [line.id, line.amount]))
  for (const match of result.matches) {
    const bankTotal = match.bankIds.reduce((total, id) => total + amount.get(id)!, 0)
    const ledgerTotal = match.ledgerIds.reduce((total, id) => total + amount.get(id)!, 0)
    assert.equal(bankTotal, ledgerTotal, match.id)
  }
})

test('checks that clear days later still match on the check number', () => {
  const check = bankBy('CHECK 10231')
  const match = matchOf(check.id)
  assert.equal(match?.rule, 'reference')
  assert.ok(match.dateGap >= 3)
})

test('card settlements with no reference match on amount and date', () => {
  const settlements = bank.filter((line) => line.channel === 'card')
  assert.equal(settlements.length, 8)
  for (const line of settlements) assert.equal(matchOf(line.id)?.rule, 'amount-date', line.description)
})

test('one remittance for three invoices is a split match', () => {
  const match = matchOf(bankBy('HARBOR GROCERS').id)
  assert.equal(match?.rule, 'split')
  const docNos = match.ledgerIds.map((id) => ledger.find((entry) => entry.id === id)!.docNo).toSorted()
  assert.deepEqual(docNos, ['INV-1050', 'INV-1053', 'INV-1057'])
})

test('same reference, different amount is a discrepancy, not a match', () => {
  const short = result.discrepancies.find((item) => item.bankId === bankBy('MAPLE & OAK').id)
  assert.equal(short?.difference, -125_00)
  const transposed = result.discrepancies.find((item) => item.bankId === bankBy('CHECK 10244').id)
  assert.equal(transposed?.difference, 180_00)
  assert.equal(result.discrepancies.length, 2)
})

test('the NSF return does not steal the deposit it reverses', () => {
  const deposit = matchOf(bankBy('ACH CREDIT BLUEBIRD').id)
  assert.equal(deposit?.rule, 'reference')
  assert.ok(result.unmatchedBank.includes(bankBy('RETURNED ITEM NSF').id))
})

test('a duplicate posting leaves exactly one entry matched', () => {
  const entries = ledgerBy('PAY-7748')
  assert.equal(entries.length, 2)
  assert.equal(entries.filter((entry) => result.unmatchedLedger.includes(entry.id)).length, 1)
})

test('the late mobile deposit needs a wider window or a person', () => {
  const deposit = bankBy('MOBILE DEPOSIT')
  assert.ok(result.unmatchedBank.includes(deposit.id))
  const wide = autoMatch(bank, ledger, { dateWindowDays: 10 })
  const match = wide.matches.find((item) => item.bankIds.includes(deposit.id))
  assert.equal(match?.rule, 'amount-date')
  assert.deepEqual(match.ledgerIds, [ledgerBy('INV-1059')[0].id])
})

test('an amount with two candidates is left for a person', () => {
  const line = (id: string, date: string): BankLine => ({ id, date, description: 'X', amount: 100_00, channel: 'ach', reference: '', counterparty: '' })
  const entry = (id: string, date: string): LedgerEntry => ({
    id,
    date,
    description: 'Y',
    amount: 100_00,
    channel: 'ach',
    source: 'GL',
    docNo: '',
    counterparty: '',
  })
  const ambiguous = autoMatch([line('B1', '2026-09-10')], [entry('L1', '2026-09-09'), entry('L2', '2026-09-11')])
  assert.equal(ambiguous.matches.length, 0)
  const rivals = autoMatch([line('B1', '2026-09-10'), line('B2', '2026-09-11')], [entry('L1', '2026-09-10')])
  assert.equal(rivals.matches.length, 0)
})

test('a manual match needs equal totals and folds into the result', () => {
  const deposit = bankBy('MOBILE DEPOSIT')
  const [receipt] = ledgerBy('INV-1059')
  assert.equal(checkManualMatch([deposit], []).ok, false)
  assert.equal(checkManualMatch([deposit], [ledgerBy('INV-1066')[0]]).difference, 1_250_00 - 5_000_00)
  assert.equal(checkManualMatch([deposit], [receipt]).ok, true)

  const merged = applyManualMatches(result, [manualMatch([deposit], [receipt])])
  assert.equal(merged.matches.length, result.matches.length + 1)
  assert.ok(!merged.unmatchedBank.includes(deposit.id))
  assert.ok(!merged.unmatchedLedger.includes(receipt.id))
})

test('an automatic match can be taken back', () => {
  const split = matchOf(bankBy('HARBOR GROCERS').id)!
  const undone = withoutMatches(result, [split.id])
  assert.equal(undone.matches.length, result.matches.length - 1)
  assert.ok(undone.unmatchedBank.includes(split.bankIds[0]))
  for (const id of split.ledgerIds) assert.ok(undone.unmatchedLedger.includes(id))
})
