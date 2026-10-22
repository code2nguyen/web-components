/**
 * September 2026 for Fernhill Coffee Roasters, a wholesale roaster with one operating account. Deterministic: a seeded
 * generator writes the routine traffic (customer receipts, vendor payments, cleared checks, card settlements) and the
 * planted cases are written out by hand below, each one a classic reconciliation problem.
 *
 * | Planted case                                   | What the workbench should find                                         |
 * | ---------------------------------------------- | ---------------------------------------------------------------------- |
 * | Wire to Roastmaster plus a separate $15 fee    | The wire matches by reference; the fee is unrecorded                   |
 * | Monthly service charge, interest paid          | Unrecorded                                                             |
 * | Bluebird Cafe deposit returned NSF, $35 fee    | The deposit matches; the return and its fee are unrecorded             |
 * | Harbor Grocers pays three invoices in one ACH  | A split match, one bank line to three receipts                         |
 * | Maple & Oak short-pays INV-1066 by $125        | An amount mismatch (an early-payment discount)                         |
 * | Check 10244 cleared at $1,352, booked $1,532   | An amount mismatch whose difference is divisible by 9: transposition   |
 * | PAY-7748 to Cascade Dairy booked twice         | One entry matches, the other is a duplicate                            |
 * | Office supplies paid by debit card             | Unrecorded                                                             |
 * | Checks 10251/10252, card deposit on Sep 30     | Timing: outstanding checks and a deposit in transit                    |
 * | Lindqvist mobile deposit, 9 days after booking | Unmatched at the default 3-day window; widening it or a manual match   |
 */
import { addDays } from './dates.ts'
import type { BankLine, Channel, Day, LedgerEntry, LedgerSource } from './types.ts'

export const COMPANY = 'Fernhill Coffee Roasters'
export const ACCOUNT_NAME = 'Operating · First Harbor Bank ••4821'
export const PERIOD = { label: 'September 2026', start: '2026-09-01', end: '2026-09-30' } as const
/** Statement and book balance on September 1, agreed at the August close. */
export const OPENING_BALANCE = 148_602_55

/** A small, fast PRNG with a fixed seed, so every run writes the same month. */
function mulberry32(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SampleMonth {
  bank: BankLine[]
  ledger: LedgerEntry[]
}

export function createSampleMonth(): SampleMonth {
  const random = mulberry32(20260930)
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
  /** An amount in cents with non-round cents, so routine lines never collide with each other or a planted case. */
  const amount = (minDollars: number, maxDollars: number) => between(minDollars, maxDollars) * 100 + between(1, 99)
  const day = (date: number) => `2026-09-${String(date).padStart(2, '0')}`

  const bank: BankLine[] = []
  const ledger: LedgerEntry[] = []
  const pushBank = (line: Omit<BankLine, 'id'>) => bank.push({ id: `B-${String(bank.length + 1).padStart(3, '0')}`, ...line })
  const pushLedger = (entry: Omit<LedgerEntry, 'id'>) => ledger.push({ id: `L-${String(ledger.length + 1).padStart(3, '0')}`, ...entry })
  const pair = (
    bankDate: Day,
    ledgerDate: Day,
    cents: number,
    channel: Channel,
    source: LedgerSource,
    bankText: string,
    ledgerText: string,
    reference: string,
    docNo: string,
    counterparty: string,
  ) => {
    pushLedger({ date: ledgerDate, description: ledgerText, amount: cents, channel, source, docNo, counterparty })
    pushBank({ date: bankDate, description: bankText, amount: cents, channel, reference, counterparty })
  }

  // --- Routine traffic --------------------------------------------------------------------------------------------

  const customers = ['Copper Kettle', 'Union Street Deli', 'Northside Market', 'Fig & Fennel', 'Tidewater Hotel', 'Larkspur Bakery']
  const routineInvoices = [1040, 1041, 1043, 1044, 1046, 1047, 1049, 1051, 1052, 1054, 1056, 1058, 1062, 1064]
  routineInvoices.forEach((invoice, index) => {
    const customer = customers[index % customers.length]
    const booked = day(2 + Math.floor((index * 26) / routineInvoices.length))
    const cents = amount(600, 4800)
    pair(
      addDays(booked, between(0, 1)),
      booked,
      cents,
      'ach',
      'AR',
      `ACH CREDIT ${customer.toUpperCase()} INV-${invoice}`,
      `Receipt ${customer} · INV-${invoice}`,
      `INV-${invoice}`,
      `INV-${invoice}`,
      customer,
    )
  })

  const vendors = ['Pacific Packaging', 'Cascade Dairy', 'Summit Logistics', 'Greenline Mills', 'Pacific Packaging', 'Summit Logistics']
  ;[7724, 7729, 7735, 7740, 7752, 7757].forEach((payment, index) => {
    const vendor = vendors[index]
    const booked = day(3 + index * 4)
    const cents = -amount(450, 6800)
    pair(
      addDays(booked, between(0, 1)),
      booked,
      cents,
      'ach',
      'AP',
      `ACH DEBIT ${vendor.toUpperCase()} PAY-${payment}`,
      `Payment ${vendor} · PAY-${payment}`,
      `PAY-${payment}`,
      `PAY-${payment}`,
      vendor,
    )
  })

  const payees = ['Alder Electric', 'Westside Plumbing', 'Coastal Signs', 'Kim Ortega (contractor)', 'Rivera Cleaning', 'Hollis Equipment']
  ;[10231, 10234, 10236, 10239, 10241, 10243].forEach((check, index) => {
    const written = day(2 + index * 4)
    const cents = -amount(180, 2400)
    // Checks clear days after they are written, often past the date window: only the check number pairs them.
    pair(
      addDays(written, between(3, 6)),
      written,
      cents,
      'check',
      'AP',
      `CHECK ${check}`,
      `Check ${check} · ${payees[index]}`,
      String(check),
      `CHK-${check}`,
      payees[index],
    )
  })

  ;[4, 8, 11, 15, 18, 22, 25, 28].forEach((settled, index) => {
    const cents = amount(900, 2600)
    pair(
      day(settled),
      addDays(day(settled), -between(1, 2)),
      cents,
      'card',
      'AR',
      'CARD SETTLEMENT MERCHANT 448210',
      `Card sales deposit ${String(index + 1).padStart(2, '0')}`,
      '',
      `DEP-09${String(index + 1).padStart(2, '0')}`,
      '',
    )
  })

  pair(day(1), day(1), -8_500_00, 'ach', 'GL', 'ACH DEBIT PIONEER PROPERTY MGMT', 'September rent · Pioneer Property', '', 'JE-0901', 'Pioneer Property')
  pair(day(15), day(15), -21_480_33, 'ach', 'Payroll', 'BRIGHTLINE PAYROLL FUNDING', 'Payroll funding · Sep 1–15', '', 'PR-0915', 'Brightline Payroll')
  pair(day(30), day(30), -21_912_07, 'ach', 'Payroll', 'BRIGHTLINE PAYROLL FUNDING', 'Payroll funding · Sep 16–30', '', 'PR-0930', 'Brightline Payroll')
  pair(day(21), day(19), -1_184_22, 'ach', 'AP', 'ACH DEBIT EVERGREEN UTILITIES', 'Electricity & gas · Evergreen', '', 'UT-0919', 'Evergreen Utilities')

  // --- Planted cases ----------------------------------------------------------------------------------------------

  // A wire matches by reference; its fee arrives as a line of its own that nobody booked.
  pair(
    day(9),
    day(9),
    -12_500_00,
    'wire',
    'AP',
    'WIRE OUT ROASTMASTER GMBH PAY-7731',
    'Green coffee · Roastmaster GmbH · PAY-7731',
    'PAY-7731',
    'PAY-7731',
    'Roastmaster GmbH',
  )
  pushBank({ date: day(9), description: 'OUTGOING WIRE TRANSFER FEE', amount: -15_00, channel: 'fee', reference: '', counterparty: '' })

  pushBank({ date: day(30), description: 'MONTHLY SERVICE CHARGE', amount: -45_00, channel: 'fee', reference: '', counterparty: '' })
  pushBank({ date: day(30), description: 'INTEREST PAID', amount: 18_37, channel: 'interest', reference: '', counterparty: '' })

  // A deposit that bounced: the deposit matches its receipt, the return and its fee are not in the books.
  pair(
    day(10),
    day(10),
    2_340_00,
    'ach',
    'AR',
    'ACH CREDIT BLUEBIRD CAFE INV-1061',
    'Receipt Bluebird Cafe · INV-1061',
    'INV-1061',
    'INV-1061',
    'Bluebird Cafe',
  )
  pushBank({
    date: day(16),
    description: 'RETURNED ITEM NSF BLUEBIRD CAFE INV-1061',
    amount: -2_340_00,
    channel: 'ach',
    reference: 'INV-1061',
    counterparty: 'Bluebird Cafe',
  })
  pushBank({ date: day(16), description: 'RETURN ITEM FEE', amount: -35_00, channel: 'fee', reference: '', counterparty: '' })

  // One remittance for three invoices.
  pushBank({
    date: day(18),
    description: 'ACH CREDIT HARBOR GROCERS REMIT 3 INV',
    amount: 8_420_50,
    channel: 'ach',
    reference: '',
    counterparty: 'Harbor Grocers',
  })
  for (const [invoice, cents, date] of [
    [1050, 3_100_00, 17],
    [1053, 2_870_50, 17],
    [1057, 2_450_00, 18],
  ] as const) {
    pushLedger({
      date: day(date),
      description: `Receipt Harbor Grocers · INV-${invoice}`,
      amount: cents,
      channel: 'ach',
      source: 'AR',
      docNo: `INV-${invoice}`,
      counterparty: 'Harbor Grocers',
    })
  }

  // Short payment: the customer took a 2.5% early-payment discount the books never saw.
  pushBank({
    date: day(22),
    description: 'ACH CREDIT MAPLE & OAK BISTRO INV-1066',
    amount: 4_875_00,
    channel: 'ach',
    reference: 'INV-1066',
    counterparty: 'Maple & Oak Bistro',
  })
  pushLedger({
    date: day(22),
    description: 'Receipt Maple & Oak Bistro · INV-1066',
    amount: 5_000_00,
    channel: 'ach',
    source: 'AR',
    docNo: 'INV-1066',
    counterparty: 'Maple & Oak Bistro',
  })

  // Transposed digits: the check cleared at 1,352.00, the books say 1,532.00.
  pushBank({ date: day(24), description: 'CHECK 10244', amount: -1_352_00, channel: 'check', reference: '10244', counterparty: 'Hollis Equipment' })
  pushLedger({
    date: day(21),
    description: 'Check 10244 · Hollis Equipment',
    amount: -1_532_00,
    channel: 'check',
    source: 'AP',
    docNo: 'CHK-10244',
    counterparty: 'Hollis Equipment',
  })

  // A payment posted twice.
  pair(
    day(14),
    day(14),
    -3_200_00,
    'ach',
    'AP',
    'ACH DEBIT CASCADE DAIRY PAY-7748',
    'Payment Cascade Dairy · PAY-7748',
    'PAY-7748',
    'PAY-7748',
    'Cascade Dairy',
  )
  pushLedger({
    date: day(15),
    description: 'Payment Cascade Dairy · PAY-7748',
    amount: -3_200_00,
    channel: 'ach',
    source: 'AP',
    docNo: 'PAY-7748',
    counterparty: 'Cascade Dairy',
  })

  // A debit card purchase nobody expensed.
  pushBank({ date: day(19), description: 'POS PURCHASE OFFICE DEPOT #2291', amount: -214_63, channel: 'pos', reference: '', counterparty: 'Office Depot' })

  // Written at month end, not cleared yet.
  pushLedger({
    date: day(28),
    description: 'Check 10251 · Alder Electric',
    amount: -740_00,
    channel: 'check',
    source: 'AP',
    docNo: 'CHK-10251',
    counterparty: 'Alder Electric',
  })
  pushLedger({
    date: day(30),
    description: 'Check 10252 · Coastal Signs',
    amount: -1_265_80,
    channel: 'check',
    source: 'AP',
    docNo: 'CHK-10252',
    counterparty: 'Coastal Signs',
  })
  pushLedger({ date: day(30), description: 'Card sales deposit 09', amount: 1_912_40, channel: 'card', source: 'AR', docNo: 'DEP-0909', counterparty: '' })

  // Booked on the invoice date, deposited by phone nine days later with no reference.
  pushLedger({
    date: day(3),
    description: 'Receipt Lindqvist Catering · INV-1059',
    amount: 1_250_00,
    channel: 'deposit',
    source: 'AR',
    docNo: 'INV-1059',
    counterparty: 'Lindqvist Catering',
  })
  pushBank({ date: day(12), description: 'MOBILE DEPOSIT', amount: 1_250_00, channel: 'deposit', reference: '', counterparty: '' })

  const byDate = <T extends { date: Day; id: string }>(a: T, b: T) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  return { bank: bank.sort(byDate), ledger: ledger.sort(byDate) }
}
