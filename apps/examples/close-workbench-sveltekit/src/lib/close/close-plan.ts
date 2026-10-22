/**
 * The September close calendar: five business days, October 1 to 7, with the workbench's own account reconciliation
 * and adjusting entries as live tasks among the rest of the checklist.
 */
export const CLOSE_TODAY = '2026-10-05'
export const CLOSE_DEADLINE = '2026-10-07'
export const CLOSE_DAYS = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07']

/** Structurally a `GanttTaskConfig`. */
export interface CloseTask {
  [key: string]: unknown
  id: string
  label: string
  start?: string
  end?: string
  progress?: number
  parent?: string
  dependencies?: string[]
  milestone?: boolean
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral'
}

export interface CloseProgress {
  /** Share of statement and ledger lines matched or explained, 0 to 1. */
  reconciled: number
  posted: boolean
  signedOff: boolean
}

export function closeTasks({ reconciled, posted, signedOff }: CloseProgress): CloseTask[] {
  const done = (progress: number) => (progress >= 1 ? 'success' : 'primary')
  const rec = signedOff ? 1 : Math.min(reconciled, 0.95)
  return [
    { id: 'cash', label: 'Cash & bank' },
    { id: 'rec-operating', parent: 'cash', label: 'Bank rec · Operating ••4821', start: '2026-10-01', end: '2026-10-05', progress: rec, tone: done(rec) },
    { id: 'rec-payroll', parent: 'cash', label: 'Bank rec · Payroll ••5530', start: '2026-10-01', end: '2026-10-02', progress: 1, tone: 'success' },
    { id: 'rec-card', parent: 'cash', label: 'Corporate card statement', start: '2026-10-02', end: '2026-10-05', progress: 0.6, tone: 'primary' },
    { id: 'subledgers', label: 'Subledgers' },
    { id: 'ap-cutoff', parent: 'subledgers', label: 'AP cut-off & accruals', start: '2026-10-01', end: '2026-10-02', progress: 1, tone: 'success' },
    { id: 'ar-aging', parent: 'subledgers', label: 'AR aging review', start: '2026-10-02', end: '2026-10-05', progress: 0.5, tone: 'primary' },
    { id: 'inventory', parent: 'subledgers', label: 'Inventory count true-up', start: '2026-10-01', end: '2026-10-05', progress: 0.8, tone: 'primary' },
    { id: 'adjustments', label: 'Adjustments' },
    { id: 'prepaids', parent: 'adjustments', label: 'Prepaid amortization', start: '2026-10-02', end: '2026-10-02', progress: 1, tone: 'success' },
    {
      id: 'adj-post',
      parent: 'adjustments',
      label: 'Post cash adjusting entries',
      start: '2026-10-05',
      end: '2026-10-06',
      progress: posted ? 1 : 0,
      tone: posted ? 'success' : 'warning',
      dependencies: ['rec-operating'],
    },
    { id: 'reporting', label: 'Reporting' },
    {
      id: 'tb-review',
      parent: 'reporting',
      label: 'Trial balance review',
      start: '2026-10-06',
      end: '2026-10-06',
      progress: 0,
      tone: 'neutral',
      dependencies: ['adj-post', 'ar-aging'],
    },
    {
      id: 'flux',
      parent: 'reporting',
      label: 'Flux analysis',
      start: '2026-10-06',
      end: '2026-10-07',
      progress: 0,
      tone: 'neutral',
      dependencies: ['tb-review'],
    },
    {
      id: 'statements',
      parent: 'reporting',
      label: 'Financial statements',
      start: '2026-10-07',
      end: '2026-10-07',
      progress: 0,
      tone: 'neutral',
      dependencies: ['flux'],
    },
    {
      id: 'controller',
      parent: 'reporting',
      label: 'Controller sign-off',
      start: '2026-10-07',
      milestone: true,
      tone: 'neutral',
      dependencies: ['statements'],
    },
  ]
}

/** Structurally a `StateTimelineSeries`. */
export interface AccountBand {
  [key: string]: unknown
  id: string
  label: string
  segments: { start: string; state: string }[]
}

export const ACCOUNT_STATES = [
  { value: 'not-started', label: 'Not started', tone: 'neutral' as const },
  { value: 'in-progress', label: 'In progress', tone: 'primary' as const },
  { value: 'review', label: 'In review', tone: 'warning' as const },
  { value: 'reconciled', label: 'Reconciled', tone: 'success' as const, baseline: true },
]

export const TIMELINE_START = '2026-10-01T08:00:00'
export const TIMELINE_END = '2026-10-05T17:00:00'

/** How each balance-sheet account moved through the close so far; the operating account's last state is live. */
export function accountBands({ posted, signedOff }: CloseProgress): AccountBand[] {
  const operatingNow = signedOff ? 'reconciled' : posted ? 'review' : 'in-progress'
  return [
    {
      id: 'operating',
      label: 'Cash · Operating',
      segments: [
        { start: '2026-10-01T08:00:00', state: 'not-started' },
        { start: '2026-10-01T10:30:00', state: 'in-progress' },
        { start: '2026-10-05T09:00:00', state: operatingNow },
      ],
    },
    {
      id: 'payroll',
      label: 'Cash · Payroll',
      segments: [
        { start: '2026-10-01T08:00:00', state: 'in-progress' },
        { start: '2026-10-01T15:00:00', state: 'review' },
        { start: '2026-10-02T11:00:00', state: 'reconciled' },
      ],
    },
    {
      id: 'ar',
      label: 'Accounts receivable',
      segments: [
        { start: '2026-10-01T08:00:00', state: 'not-started' },
        { start: '2026-10-02T09:00:00', state: 'in-progress' },
      ],
    },
    {
      id: 'inventory',
      label: 'Inventory',
      segments: [
        { start: '2026-10-01T08:00:00', state: 'in-progress' },
        { start: '2026-10-02T16:00:00', state: 'review' },
      ],
    },
    {
      id: 'ap',
      label: 'Accounts payable',
      segments: [
        { start: '2026-10-01T08:00:00', state: 'in-progress' },
        { start: '2026-10-02T12:00:00', state: 'reconciled' },
      ],
    },
    {
      id: 'accruals',
      label: 'Accrued liabilities',
      segments: [
        { start: '2026-10-01T08:00:00', state: 'not-started' },
        { start: '2026-10-02T10:00:00', state: 'in-progress' },
        { start: '2026-10-05T08:30:00', state: 'reconciled' },
      ],
    },
  ]
}

export const CLOSE_MARKERS = [
  { time: '2026-10-01T09:00:00', label: 'Statements received' },
  { time: '2026-10-02T12:00:00', label: 'AP cut-off' },
]
