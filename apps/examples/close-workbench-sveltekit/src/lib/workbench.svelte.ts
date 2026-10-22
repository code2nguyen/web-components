/**
 * The workbench's state: what the accountant decided (manual matches, rejected matches, where each exception sits on
 * the board, the journal draft, what was posted, the sign-off) as runes, and everything else derived from it with the
 * plain functions in `close/`. One instance per app, created by the root layout and handed down through context.
 *
 * Decisions are saved to `localStorage` so a reload keeps the work; the prerendered HTML always shows the untouched
 * month, and the browser restores the saved state right after hydration.
 */
import { createContext } from 'svelte'

import type { ToastOptions } from '@c2n/components/toast'

import { classifyExceptions } from './close/exceptions.ts'
import { CASH_ACCOUNT, parseSheet, proposeJournal, toSheet, type SheetData } from './close/journal.ts'
import { applyManualMatches, autoMatch, DEFAULT_MATCH_OPTIONS, manualMatch, withoutMatches } from './close/matching.ts'
import { reconcile } from './close/reconciliation.ts'
import type { ReconRow } from './close/filter.ts'
import { createSampleMonth, OPENING_BALANCE, PERIOD } from './close/sample.ts'
import type { ExceptionStage, JournalLine, Match, ReconException } from './close/types.ts'

const STORAGE_KEY = 'c2n-close-workbench:v1'

interface SignOff {
  by: string
  at: string
}

interface Saved {
  dateWindowDays: number
  manual: Match[]
  rejected: string[]
  stages: Record<string, ExceptionStage>
  notes: Record<string, string>
  owners: Record<string, string>
  draft: SheetData | null
  draftBase: string | null
  posted: JournalLine[]
  postedIds: string[]
  signOff: SignOff | null
}

export const OWNERS = ['Priya Raman', 'Tom Becker', 'Ana Lima'] as const

export class Workbench {
  readonly month = createSampleMonth()
  readonly bankById = new Map(this.month.bank.map((line) => [line.id, line]))
  readonly ledgerById = new Map(this.month.ledger.map((entry) => [entry.id, entry]))

  // --- Decisions -------------------------------------------------------------------------------------------------

  dateWindowDays = $state(DEFAULT_MATCH_OPTIONS.dateWindowDays)
  manual = $state<Match[]>([])
  rejected = $state<string[]>([])
  stages = $state<Record<string, ExceptionStage>>({})
  notes = $state<Record<string, string>>({})
  owners = $state<Record<string, string>>({})
  /** The journal spreadsheet's raw inputs once someone edited them; `null` follows the proposals. */
  draft = $state<SheetData | null>(null)
  /** The proposals the draft was started from, to tell when the board has moved on since. */
  draftBase = $state<string | null>(null)
  posted = $state<JournalLine[]>([])
  /** Exceptions whose adjusting entry has been posted. Their cards stay resolved: a second entry would double it. */
  postedIds = $state<string[]>([])
  signOff = $state<SignOff | null>(null)
  /** Saving starts once the saved state has been read back, or the first save would overwrite it with the defaults. */
  private restored = $state(false)

  /** Set by the layout once its toast region exists. */
  notify: (options: ToastOptions) => void = () => {}

  // --- Derived ---------------------------------------------------------------------------------------------------

  readonly auto = $derived(autoMatch(this.month.bank, this.month.ledger, { dateWindowDays: this.dateWindowDays }))
  readonly result = $derived(applyManualMatches(withoutMatches(this.auto, this.rejected), this.manual))
  readonly exceptions = $derived(classifyExceptions(this.month.bank, this.month.ledger, this.result, PERIOD.end))
  readonly recon = $derived(reconcile(OPENING_BALANCE, this.month.bank, this.month.ledger, this.exceptions, this.posted))

  readonly toAdjust = $derived(this.exceptions.filter((item) => this.stageOf(item) === 'adjust'))
  readonly proposed = $derived(proposeJournal(this.toAdjust, this.month.bank, this.month.ledger))
  readonly proposedSheet = $derived(toSheet(this.proposed.lines))
  /** An edited draft written before the cards in Needs adjustment changed: posting it would miss or repeat entries. */
  readonly draftStale = $derived(this.draft !== null && this.draftBase !== JSON.stringify(this.proposedSheet))
  readonly sheet = $derived(this.draft ?? this.proposedSheet)
  readonly journal = $derived(parseSheet(this.sheet))

  readonly openExceptions = $derived(this.exceptions.filter((item) => this.stageOf(item) !== 'resolved'))
  readonly matchedLineCount = $derived(this.result.matches.reduce((total, match) => total + match.bankIds.length + match.ledgerIds.length, 0))
  readonly lineCount = this.month.bank.length + this.month.ledger.length
  /** Lines matched, or explained by a resolved exception. */
  readonly reconciledShare = $derived.by(() => {
    const explained = this.exceptions
      .filter((item) => this.stageOf(item) === 'resolved')
      .reduce((total, item) => total + item.bankIds.length + item.ledgerIds.length, 0)
    return (this.matchedLineCount + explained) / this.lineCount
  })
  readonly readyToSignOff = $derived(this.recon.difference === 0 && this.openExceptions.length === 0)

  readonly rows = $derived.by(() => {
    const matched = new Set(this.result.matches.flatMap((match) => [...match.bankIds, ...match.ledgerIds]))
    const status = (id: string) => (matched.has(id) ? ('matched' as const) : ('unmatched' as const))
    const bank: ReconRow[] = this.month.bank.map((line) => ({
      ...line,
      side: 'bank',
      day: line.date.slice(5),
      amount: line.amount / 100,
      status: status(line.id),
    }))
    const ledger: ReconRow[] = this.month.ledger.map((entry) => ({
      ...entry,
      side: 'ledger',
      day: entry.date.slice(5),
      amount: entry.amount / 100,
      reference: entry.docNo,
      status: status(entry.id),
    }))
    return { bank, ledger }
  })

  constructor() {
    // Save every decision. Reading them all here is what subscribes the effect to them.
    $effect(() => {
      if (!this.restored) return
      const saved: Saved = {
        dateWindowDays: this.dateWindowDays,
        manual: this.manual,
        rejected: this.rejected,
        stages: this.stages,
        notes: this.notes,
        owners: this.owners,
        draft: this.draft,
        draftBase: this.draftBase,
        posted: this.posted,
        postedIds: this.postedIds,
        signOff: this.signOff,
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
      } catch {
        // Private mode or storage disabled: the work lasts until the tab closes.
      }
    })
  }

  /** Brings back the decisions of an earlier visit. Called once, after hydration. */
  restore() {
    let saved: Partial<Saved> | null = null
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    } catch {
      // Unreadable or blocked storage: start from the untouched month.
    }
    this.restored = true
    if (!saved) return
    this.dateWindowDays = saved.dateWindowDays ?? this.dateWindowDays
    this.manual = saved.manual ?? []
    this.rejected = saved.rejected ?? []
    this.stages = saved.stages ?? {}
    this.notes = saved.notes ?? {}
    this.owners = saved.owners ?? {}
    this.draft = saved.draft ?? null
    this.draftBase = saved.draftBase ?? null
    this.posted = saved.posted ?? []
    this.postedIds = saved.postedIds ?? []
    this.signOff = saved.signOff ?? null
  }

  reset() {
    this.dateWindowDays = DEFAULT_MATCH_OPTIONS.dateWindowDays
    this.manual = []
    this.rejected = []
    this.stages = {}
    this.notes = {}
    this.owners = {}
    this.draft = null
    this.draftBase = null
    this.posted = []
    this.postedIds = []
    this.signOff = null
  }

  // --- Actions ---------------------------------------------------------------------------------------------------

  stageOf(exception: ReconException): ExceptionStage {
    return this.stages[exception.id] ?? 'new'
  }

  isPosted(exception: ReconException): boolean {
    return this.postedIds.includes(exception.id)
  }

  /** Re-runs auto-match with another date window; the matches change, so a sign-off no longer holds. */
  setDateWindow(days: number) {
    this.dateWindowDays = days
    this.signOff = null
  }

  /** Records the reader's edit of the journal spreadsheet, remembering which proposals it started from. */
  editDraft(data: SheetData) {
    if (this.draft === null) this.draftBase = JSON.stringify(this.proposedSheet)
    this.draft = data
  }

  discardDraft() {
    this.draft = null
    this.draftBase = null
  }

  setStage(id: string, stage: ExceptionStage) {
    this.stages = { ...this.stages, [id]: stage }
    this.signOff = null
  }

  matchByHand(bankIds: string[], ledgerIds: string[]) {
    const match = manualMatch(
      bankIds.map((id) => this.bankById.get(id)!),
      ledgerIds.map((id) => this.ledgerById.get(id)!),
    )
    this.manual = [...this.manual, match]
    this.signOff = null
    return match
  }

  unmatch(ids: string[]) {
    const manual = this.manual.filter((match) => ids.includes(match.id))
    this.manual = this.manual.filter((match) => !ids.includes(match.id))
    const automatic = ids.filter((id) => !manual.some((match) => match.id === id))
    this.rejected = [...new Set([...this.rejected, ...automatic])]
    this.signOff = null
  }

  /**
   * Posts the journal as it stands and resolves the exceptions whose entry it carries (by ref). A card whose entry the
   * reader deleted stays in Needs adjustment, and a stale draft is not posted at all.
   */
  post(): { lines: JournalLine[]; resolved: string[]; unresolved: string[] } {
    if (this.draftStale || this.journal.errors.length) return { lines: [], resolved: [], unresolved: [] }
    const { lines } = this.journal
    const refs = new Set(lines.filter((line) => line.account === CASH_ACCOUNT).map((line) => line.ref))
    const resolved = [...this.proposed.refs].filter(([ref]) => refs.has(ref)).map(([, id]) => id)
    const unresolved = this.toAdjust.map((item) => item.id).filter((id) => !resolved.includes(id))
    this.posted = [...this.posted, ...lines]
    this.postedIds = [...this.postedIds, ...resolved]
    const stages = { ...this.stages }
    for (const id of resolved) stages[id] = 'resolved'
    this.stages = stages
    this.discardDraft()
    this.signOff = null
    return { lines, resolved, unresolved }
  }

  sign(by: string) {
    this.signOff = { by, at: new Date().toISOString() }
  }
}

export const [getWorkbench, setWorkbench] = createContext<Workbench>()
