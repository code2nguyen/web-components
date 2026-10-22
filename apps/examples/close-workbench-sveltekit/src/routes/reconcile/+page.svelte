<script lang="ts">
  import type { QueryInputEventMap } from '@c2n/components/query-input'
  import type { Table, TableColumnConfig, TableEventMap, TableRowContext } from '@c2n/components/table'

  import { FILTER_FIELDS, filterRows, type FilterTerm } from '#lib/close/filter.ts'
  import { checkManualMatch } from '#lib/close/matching.ts'
  import { formatMoney } from '#lib/close/money.ts'
  import { data } from '#lib/ssr.ts'
  import { getWorkbench } from '#lib/workbench.svelte.ts'

  const workbench = getWorkbench()

  const INITIAL_QUERY = 'status:unmatched'
  let terms = $state<FilterTerm[]>([{ key: 'status', value: 'unmatched', negated: false }])
  let tab = $state('open')
  let selectedBank = $state<string[]>([])
  let selectedLedger = $state<string[]>([])
  let selectedMatches = $state<string[]>([])
  // Side by side on a wide screen, stacked on a phone. The prerendered page assumes a wide one.
  let viewportWidth = $state(1280)
  const stacked = $derived(viewportWidth < 760)

  const bankRows = $derived(filterRows(workbench.rows.bank, terms))
  const ledgerRows = $derived(filterRows(workbench.rows.ledger, terms))

  const lineColumns: TableColumnConfig[] = [
    { field: 'date', header: 'Date', width: '104px' },
    { field: 'description', header: 'Description', width: 'minmax(200px, 2fr)' },
    { field: 'reference', header: 'Ref', width: '96px' },
    { field: 'amount', header: 'Amount', width: '124px', align: 'end', format: 'currency' },
    { field: 'status', header: 'Status', width: '96px' },
  ]

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
    workbench.dateWindowDays = days
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
    <div class="toolbar">
      <c2-number-input
        class="window"
        aria-label="Date window in days"
        help="Date window (days)"
        min="0"
        max="31"
        value={String(workbench.dateWindowDays)}
        onchange={setWindow}
      ></c2-number-input>
    </div>
  </div>

  <c2-query-input
    class="query"
    aria-label="Filter lines"
    placeholder="Filter: status:unmatched amount:>1000 channel:check, or any text"
    value={INITIAL_QUERY}
    fields={data(FILTER_FIELDS)}
    onsearch={(event: QueryInputEventMap['search']) => (terms = event.detail.terms)}
  ></c2-query-input>

  <c2-tabs aria-label="Lines and matches" selected-tab={tab} onselection-change={(event: CustomEvent<{ value: string }>) => (tab = event.detail.value)}>
    <c2-tab for="open">Lines</c2-tab>
    <c2-tab for="matches">Matches ({workbench.result.matches.length})</c2-tab>

    <section id="open" class="panel">
      <c2-split-panel
        class="split"
        class:stacked
        orientation={stacked ? 'vertical' : 'horizontal'}
        position="50"
        min="25"
        max="75"
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
            columns={data(lineColumns)}
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
            columns={data(lineColumns)}
            value={data(selectedLedger)}
            onselection-change={(event: TableEventMap['selection-change']) => (selectedLedger = event.detail.value)}
            {@attach fadeMatched}
          ></c2-table>
        </div>
      </c2-split-panel>

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
            precision="0"
          ></c2-comparison-bar>
          <div class="selection-actions">
            <span class="muted">
              {#if alreadyMatched}
                Some selected lines are already matched. Undo their match on the Matches tab first.
              {:else if !check.ok}
                {check.reason}
              {:else}
                The two sides agree.
              {/if}
            </span>
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
  .window {
    width: 180px;
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
    --c2-table__cell--font-size: 13px;
  }

  .lines::part(row-matched) {
    opacity: 0.55;
  }

  .selection {
    position: sticky;
    bottom: 12px;
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
