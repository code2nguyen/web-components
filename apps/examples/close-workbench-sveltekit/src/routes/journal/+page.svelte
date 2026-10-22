<script lang="ts">
  import { resolve } from '$app/paths'
  import type { Spreadsheet, SpreadsheetEventMap } from '@c2n/components/spreadsheet'

  import { ACCOUNTS, accountLabel, SHEET_COLUMNS } from '#lib/close/journal.ts'
  import { formatMoney, formatSigned } from '#lib/close/money.ts'
  import { formatTrialBalance, trialBalance } from '#lib/close/reconciliation.ts'
  import { data } from '#lib/ssr.ts'
  import { getWorkbench } from '#lib/workbench.svelte.ts'

  const workbench = getWorkbench()
  const journal = $derived(workbench.journal)

  // The trial balance before and after the draft, as text the diff viewer compares line by line: the accounts the
  // draft touches are the lines that change.
  const current = $derived(trialBalance(workbench.recon.bookBalance, workbench.posted))
  const preview = $derived(trialBalance(workbench.recon.bookBalance, [...workbench.posted, ...journal.lines]))
  const before = $derived(formatTrialBalance(current))
  const after = $derived(formatTrialBalance(preview))

  const differenceAfter = $derived(workbench.recon.difference - journal.cashEffect)
  const edited = $derived(workbench.draft !== null && JSON.stringify(workbench.draft) !== JSON.stringify(workbench.proposedSheet))
  const canPost = $derived(journal.lines.length > 0 && journal.errors.length === 0)

  // What the spreadsheet is given. It follows the workbench (proposals, a rebuild, a restored draft) but not the
  // reader's own edits: those are already in the element, and handing them back would reset its selection and undo.
  let source = $state(workbench.sheet)
  let ownEdit = false
  $effect.pre(() => {
    const next = workbench.sheet
    if (ownEdit) ownEdit = false
    else source = next
  })

  function onCellChange(event: SpreadsheetEventMap['cell-change']) {
    // The element keeps `data` current with every edit; the draft is a copy of it.
    ownEdit = true
    workbench.draft = structuredClone((event.currentTarget as Spreadsheet).data)
  }

  function post() {
    const lines = workbench.post()
    workbench.notify({
      variant: 'success',
      heading: 'Journal posted',
      message: `${lines.length} lines, ${formatSigned(lines.filter((line) => line.account === '1010').reduce((total, line) => total + line.debit - line.credit, 0))} to cash.`,
    })
  }
</script>

<main class="page">
  <div class="page-head">
    <div>
      <h1>Adjusting journal</h1>
      <p class="muted">Proposed from the cards in Needs adjustment. Edit any cell: accounts, memos and amounts are yours to change before posting.</p>
    </div>
    <div class="toolbar">
      {#if edited}
        <c2-button class="button-quiet" onclick={() => (workbench.draft = null)}>
          <c2-feather-refresh-cw slot="prefix-icon"></c2-feather-refresh-cw>
          Rebuild from the board
        </c2-button>
      {/if}
      <c2-popconfirm heading={`Post ${journal.lines.length} lines to the general ledger?`} confirm-label="Post" disabled={!canPost} onconfirm={post}>
        <c2-button slot="trigger" disabled={!canPost}>
          <c2-feather-check-circle slot="prefix-icon"></c2-feather-check-circle>
          Post journal
        </c2-button>
        Cash moves by {formatSigned(journal.cashEffect)}; the difference becomes {formatMoney(differenceAfter)}.
      </c2-popconfirm>
    </div>
  </div>

  {#if !journal.lines.length && !edited}
    <c2-status-panel
      heading="Nothing to post yet"
      description="Move exceptions that change cash to Needs adjustment on the board, and their entries appear here."
    >
      <c2-link-button slot="actions" href={resolve('/exceptions')}>Go to the exceptions board →</c2-link-button>
    </c2-status-panel>
  {:else}
    <c2-card>
      <div slot="header" class="card-head">
        <h2>Draft entries</h2>
        <div class="checks">
          <c2-badge tone={journal.balanced ? 'success' : 'danger'}>
            {journal.balanced ? 'Balanced' : 'Out of balance'} · {formatMoney(journal.debits)} / {formatMoney(journal.credits)}
          </c2-badge>
          <c2-badge tone={differenceAfter === 0 ? 'success' : 'warning'}>Difference after posting {formatMoney(differenceAfter)}</c2-badge>
        </div>
      </div>
      <c2-spreadsheet
        class="sheet"
        label="Adjusting journal entries"
        formula-bar
        summary
        currency="USD"
        locale="en-US"
        columns={data(SHEET_COLUMNS)}
        data={data(source)}
        oncell-change={onCellChange}
      ></c2-spreadsheet>
      {#if journal.errors.length}
        <c2-banner variant="error" heading="Fix before posting" class="errors">
          <ul>
            {#each journal.errors as error (error)}
              <li>{error}</li>
            {/each}
          </ul>
        </c2-banner>
      {/if}
      <p slot="footer" class="muted hint">
        Accounts are read from the leading code: {Object.keys(ACCOUNTS)
          .map((code) => accountLabel(code))
          .slice(0, 4)
          .join(', ')}, …
      </p>
    </c2-card>
  {/if}

  <c2-card>
    <div slot="header" class="card-head">
      <h2>Trial balance</h2>
      <p class="muted">Before and after posting the draft</p>
    </div>
    <c2-diff-viewer
      class="diff"
      mode="split"
      original-label="Current"
      modified-label="After posting"
      label="Trial balance before and after posting"
      original={before}
      modified={after}
    ></c2-diff-viewer>
  </c2-card>

  {#if workbench.posted.length}
    <c2-card>
      <div slot="header" class="card-head">
        <h2>Posted this close</h2>
        <span class="amount muted">{formatSigned(workbench.recon.adjustmentsPosted)} to cash</span>
      </div>
      <c2-table
        class="posted"
        aria-label="Posted journal lines"
        rows={data(
          workbench.posted.map((line, index) => ({
            ...line,
            id: index,
            account: accountLabel(line.account),
            debit: line.debit ? line.debit / 100 : null,
            credit: line.credit ? line.credit / 100 : null,
          })),
        )}
        columns={data([
          { field: 'ref', header: 'Ref', width: '90px' },
          { field: 'account', header: 'Account', width: '1fr' },
          { field: 'memo', header: 'Memo', width: '2fr' },
          { field: 'debit', header: 'Debit', width: '120px', align: 'end', format: 'currency', summary: 'sum' },
          { field: 'credit', header: 'Credit', width: '120px', align: 'end', format: 'currency', summary: 'sum' },
        ])}
      ></c2-table>
    </c2-card>
  {/if}
</main>

<style>
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .sheet {
    display: block;
  }

  .errors {
    display: block;
    margin-top: 12px;
  }

  .errors ul {
    margin: 0;
    padding-left: 18px;
  }

  .hint {
    font-size: 12px;
  }

  .diff {
    display: block;
    font-size: 12px;
  }

  .posted {
    height: 280px;
  }
</style>
