<script lang="ts">
  import type { QueryInputEventMap } from '@c2n/components/query-input'
  import type { Table, TableColumnConfig, TableEventMap, TableRowContext } from '@c2n/components/table'

  import { FILTER_FIELDS, filterRowsAny, orGroups, type FilterTerm } from '#lib/close/filter.ts'
  import { daysBetween } from '#lib/close/dates.ts'
  import { checkManualMatch, normalizeReference } from '#lib/close/matching.ts'
  import { formatMoney } from '#lib/close/money.ts'
  import { data } from '#lib/ssr.ts'
  import { getWorkbench } from '#lib/workbench.svelte.ts'

  const workbench = getWorkbench()

  const INITIAL_QUERY = 'status:unmatched'
  // The query's terms, in its `OR` alternatives (a query without `OR` is one group whose terms must all hold).
  let groups = $state<FilterTerm[][]>([[{ key: 'status', value: 'unmatched', negated: false }]])
  let tab = $state('open')
  let selectedBank = $state<string[]>([])
  let selectedLedger = $state<string[]>([])
  let selectedMatches = $state<string[]>([])
  // Side by side on a wide screen, stacked on a phone. The prerendered page assumes a wide one.
  let viewportWidth = $state(1280)
  const stacked = $derived(viewportWidth < 760)

  const bankRows = $derived(filterRowsAny(workbench.rows.bank, groups))
  const ledgerRows = $derived(filterRowsAny(workbench.rows.ledger, groups))

  // One month on screen, so the day is enough: `09-12` sorts like the full date.
  const lineColumns = (text: string): TableColumnConfig[] => [
    { field: 'day', header: 'Date', width: '84px' },
    { field: 'description', header: text, width: 'minmax(200px, 1fr)' },
    { field: 'amount', header: 'Amount', width: '124px', align: 'end', format: 'currency' },
  ]
  const bankColumns = lineColumns('Description')
  const ledgerColumns = lineColumns('Entry')

  // Matched lines fade so the open ones stand out. `rowPart` is a function, so it is set on the element in the
  // browser (an attachment) rather than written into the prerendered HTML as an attribute.
  const fadeMatched = (table: Element) => {
    ;(table as Table).rowPart = ({ row }: TableRowContext) => (row.status === 'matched' ? 'row-matched' : undefined)
  }

  const check = $derived(
    checkManualMatch(
      selectedBank.map((id) => workbench.bankById.get(id)!).filter(Boolean),
      selectedLedger.map((id) => workbench.ledgerById.get(id)!).filter(Boolean),
    ),
  )
  /** Why the selection agrees, in the reader's terms: how far apart the lines are, and whether they share a reference. */
  const agreement = $derived.by(() => {
    const bank = selectedBank.map((id) => workbench.bankById.get(id)).filter((line) => line !== undefined)
    const ledger = selectedLedger.map((id) => workbench.ledgerById.get(id)).filter((entry) => entry !== undefined)
    const days = [...bank, ...ledger].map((line) => line.date).sort()
    const gap = days.length ? daysBetween(days[0], days[days.length - 1]) : 0
    const references = new Set([...bank.map((line) => line.reference), ...ledger.map((entry) => entry.docNo)].map(normalizeReference).filter(Boolean))
    const shared = references.size === 1 && bank.every((line) => line.reference) && ledger.every((entry) => entry.docNo)
    return `${gap === 0 ? 'same day' : `${gap} day${gap === 1 ? '' : 's'} apart`}, ${shared ? 'same reference' : 'no shared reference'}`
  })
  const alreadyMatched = $derived(
    [...selectedBank, ...selectedLedger].some((id) => workbench.result.matches.some((match) => [...match.bankIds, ...match.ledgerIds].includes(id))),
  )

  function matchSelected() {
    workbench.matchByHand(selectedBank, selectedLedger)
    workbench.notify({
      variant: 'success',
      heading: 'Matched by hand',
      message: `${selectedBank.length} bank and ${selectedLedger.length} ledger lines, ${formatMoney(check.bankTotal)}.`,
    })
    selectedBank = []
    selectedLedger = []
  }

  const RULE_LABELS = { reference: 'Reference', 'amount-date': 'Amount + date', split: 'Split', manual: 'Manual' }
  const matchRows = $derived(
    workbench.result.matches.map((match) => ({
      id: match.id,
      rule: RULE_LABELS[match.rule],
      confidence: match.confidence,
      bank: match.bankIds.map((id) => workbench.bankById.get(id)!.description).join(' + '),
      ledger: match.ledgerIds.map((id) => workbench.ledgerById.get(id)!.docNo || workbench.ledgerById.get(id)!.description).join(' + '),
      amount: match.amount / 100,
      gap: match.dateGap,
    })),
  )
  const matchColumns: TableColumnConfig[] = [
    { field: 'rule', header: 'Rule', width: '130px' },
    { field: 'confidence', header: 'Confidence', width: '110px', align: 'end', format: 'percent' },
    { field: 'bank', header: 'Bank', width: 'minmax(200px, 2fr)' },
    { field: 'ledger', header: 'Ledger', width: 'minmax(160px, 1.4fr)' },
    { field: 'amount', header: 'Amount', width: '124px', align: 'end', format: 'currency' },
    { field: 'gap', header: 'Days apart', width: '104px', align: 'end', format: 'number' },
  ]
  const ruleCounts = $derived(
    Object.entries(Object.groupBy(workbench.result.matches, (match) => match.rule)).map(
      ([rule, list]) => `${list?.length} ${RULE_LABELS[rule as keyof typeof RULE_LABELS].toLowerCase()}`,
    ),
  )

  function unmatchSelected() {
    const count = selectedMatches.length
    workbench.unmatch(selectedMatches)
    selectedMatches = []
    workbench.notify({ variant: 'info', message: `${count} match${count === 1 ? '' : 'es'} undone; the lines are open again.` })
  }

  function setWindow(event: Event) {
    const days = Number((event.currentTarget as HTMLInputElement).value)
    if (!Number.isInteger(days) || days < 0 || days === workbench.dateWindowDays) return
    const before = workbench.result.matches.length
    workbench.setDateWindow(days)
    const delta = workbench.result.matches.length - before
    workbench.notify({
      variant: delta > 0 ? 'success' : 'neutral',
      heading: `Auto-match re-ran with a ${days}-day window`,
      message: delta === 0 ? 'No change in the matches.' : `${Math.abs(delta)} ${delta > 0 ? 'more' : 'fewer'} match${Math.abs(delta) === 1 ? '' : 'es'}.`,
    })
  }
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<main class="page">
  <div class="page-head">
    <div>
      <h1>Reconcile</h1>
      <p class="muted">
        {workbench.result.matches.length} matches ({ruleCounts.join(', ')}) · {workbench.result.unmatchedBank.length} bank and
        {workbench.result.unmatchedLedger.length} ledger lines open
      </p>
    </div>
    <div class="window-field">
      <span class="window-label" aria-hidden="true">Date window (days)</span>
      <c2-number-input class="window" aria-label="Date window in days" min="0" max="31" value={String(workbench.dateWindowDays)} onchange={setWindow}
      ></c2-number-input>
    </div>
  </div>

  <c2-query-input
    class="query"
    aria-label="Filter lines"
    placeholder="Filter: status:unmatched amount:>1000 channel:check, or any text"
    value={INITIAL_QUERY}
    fields={data(FILTER_FIELDS)}
    onsearch={(event: QueryInputEventMap['search']) => (groups = orGroups(event.detail.value, event.detail.terms))}
  ></c2-query-input>

  <c2-tabs aria-label="Lines and matches" selected-tab={tab} onselection-change={(event: CustomEvent<{ value: string }>) => (tab = event.detail.value)}>
    <c2-tab for="open">Lines</c2-tab>
    <c2-tab for="matches">Matches ({workbench.result.matches.length})</c2-tab>

    <section id="open" class="panel">
      <!-- Numbers in braces: `position="50"` would make Svelte assign the string "50" to the Number property, which
           Lit converts only when it comes in as an attribute. -->
      <c2-card class="split-card">
        <c2-split-panel
          class="split"
          class:stacked
          orientation={stacked ? 'vertical' : 'horizontal'}
          position={50}
          min={25}
          max={75}
          label="Resize bank and ledger"
        >
          <div slot="start" class="side">
            <div class="side-head">
              <h2>Bank statement</h2>
              <span class="muted">{bankRows.length} of {workbench.rows.bank.length}</span>
            </div>
            <c2-table
              class="lines"
              aria-label="Bank statement lines"
              row-key="id"
              selection="multiple"
              checkbox-selection
              sortable
              rows={data(bankRows)}
              columns={data(bankColumns)}
              value={data(selectedBank)}
              onselection-change={(event: TableEventMap['selection-change']) => (selectedBank = event.detail.value)}
              {@attach fadeMatched}
            ></c2-table>
          </div>
          <div slot="end" class="side">
            <div class="side-head">
              <h2>General ledger · 1010 Cash</h2>
              <span class="muted">{ledgerRows.length} of {workbench.rows.ledger.length}</span>
            </div>
            <c2-table
              class="lines"
              aria-label="Ledger entries"
              row-key="id"
              selection="multiple"
              checkbox-selection
              sortable
              rows={data(ledgerRows)}
              columns={data(ledgerColumns)}
              value={data(selectedLedger)}
              onselection-change={(event: TableEventMap['selection-change']) => (selectedLedger = event.detail.value)}
              {@attach fadeMatched}
            ></c2-table>
          </div>
        </c2-split-panel>
      </c2-card>

      <c2-card class="selection" aria-live="polite">
        <div class="selection-body">
          <div class="selection-totals">
            <span><span class="muted">Bank</span> <strong class="amount">{formatMoney(check.bankTotal)}</strong> ({selectedBank.length})</span>
            <span><span class="muted">Ledger</span> <strong class="amount">{formatMoney(check.ledgerTotal)}</strong> ({selectedLedger.length})</span>
            <span><span class="muted">Difference</span> <strong class="amount" class:bad={check.difference !== 0}>{formatMoney(check.difference)}</strong></span
            >
          </div>
          <c2-comparison-bar
            class="balance-bar"
            start-label="Bank"
            end-label="Ledger"
            start-value={Math.abs(check.bankTotal)}
            end-value={Math.abs(check.ledgerTotal)}
            show-value
            precision={0}
          ></c2-comparison-bar>
          <div class="selection-actions">
            {#if alreadyMatched}
              <span class="muted">Some selected lines are already matched. Undo their match on the Matches tab first.</span>
            {:else if !check.ok}
              <span class="muted">{check.reason}</span>
            {:else}
              <span class="agree">The two sides agree: {agreement}.</span>
            {/if}
            <c2-button disabled={!check.ok || alreadyMatched} onclick={matchSelected}>
              <c2-feather-link slot="prefix-icon"></c2-feather-link>
              Match selected
            </c2-button>
          </div>
        </div>
      </c2-card>
    </section>

    <section id="matches" class="panel">
      <div class="toolbar matches-toolbar">
        <span class="muted">Select matches the engine got wrong and undo them; their lines go back to the open list.</span>
        <c2-popconfirm
          heading={`Undo ${selectedMatches.length} match${selectedMatches.length === 1 ? '' : 'es'}?`}
          confirm-label="Undo"
          disabled={!selectedMatches.length}
          onconfirm={unmatchSelected}
        >
          <c2-button slot="trigger" class="button-quiet" disabled={!selectedMatches.length}>
            <c2-feather-rotate-ccw slot="prefix-icon"></c2-feather-rotate-ccw>
            Undo selected
          </c2-button>
          The lines become open items again and may turn into exceptions.
        </c2-popconfirm>
      </div>
      <c2-table
        class="matches"
        aria-label="Matches"
        row-key="id"
        selection="multiple"
        checkbox-selection
        sortable
        rows={data(matchRows)}
        columns={data(matchColumns)}
        value={data(selectedMatches)}
        onselection-change={(event: TableEventMap['selection-change']) => (selectedMatches = event.detail.value)}
      ></c2-table>
    </section>
  </c2-tabs>
</main>

<style>
  .window-field {
    display: grid;
    gap: 4px;
  }

  .window-label {
    color: var(--cw-muted);
    font-size: 12px;
  }

  .window {
    width: 150px;
  }

  .split-card {
    --c2-card--padding-top: 14px;
    --c2-card--padding-right: 10px;
    --c2-card--padding-bottom: 10px;
    --c2-card--padding-left: 10px;
  }

  .query {
    display: block;
  }

  .panel {
    display: grid;
    gap: 16px;
    padding-top: 16px;
  }

  .split {
    height: 520px;
  }

  .split.stacked {
    height: 900px;
  }

  .side {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 8px;
    height: 100%;
    min-width: 0;
    padding: 0 6px;
  }

  .side-head {
    display: flex;
    gap: 8px;
    align-items: baseline;
    justify-content: space-between;
  }

  .lines {
    height: 100%;
    min-height: 0;
  }

  .lines::part(row-matched) {
    opacity: 0.55;
  }

  /* Pinned to the bottom of the viewport while the tables scroll, so the totals stay in sight. */
  .selection {
    position: sticky;
    bottom: 16px;
    --c2-card--border-top: 1px solid var(--cw-border-strong);
    --c2-card--border-right: 1px solid var(--cw-border-strong);
    --c2-card--border-bottom: 1px solid var(--cw-border-strong);
    --c2-card--border-left: 1px solid var(--cw-border-strong);
    --c2-card--box-shadow: var(--cw-shadow);
  }

  .selection-body {
    display: grid;
    gap: 12px;
  }

  .selection-totals {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
  }

  .balance-bar {
    display: block;
    --c2-comparison-bar__start-segment--background-color: var(--cw-accent);
    --c2-comparison-bar__end-segment--background-color: var(--cw-warning);
    --c2-comparison-bar--height: 8px;
    --c2-comparison-bar__start-value--color: var(--cw-accent);
    --c2-comparison-bar__end-value--color: var(--cw-warning);
  }

  .agree {
    color: var(--cw-success);
    font-weight: 500;
  }

  .selection-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  .bad {
    color: var(--cw-danger);
  }

  .matches-toolbar {
    justify-content: space-between;
  }

  .matches {
    height: 520px;
  }
</style>
