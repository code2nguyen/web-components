<script lang="ts">
  import { html } from '@c2n/core/lit-helper.js'
  import type { Kanban, KanbanEventMap, KanbanRenderContext } from '@c2n/components/kanban'
  import type { SelectEventMap } from '@c2n/components/select'

  import { formatDay } from '#lib/close/dates.ts'
  import { accountLabel, proposeEntry } from '#lib/close/journal.ts'
  import { formatMoney, formatSigned } from '#lib/close/money.ts'
  import type { ExceptionKind, ExceptionStage, ReconException } from '#lib/close/types.ts'
  import { data } from '#lib/ssr.ts'
  import { getWorkbench, OWNERS } from '#lib/workbench.svelte.ts'

  const workbench = getWorkbench()

  const COLUMNS: { id: ExceptionStage; label: string; hint: string }[] = [
    { id: 'new', label: 'Unreviewed', hint: 'Straight from the matcher' },
    { id: 'investigating', label: 'Investigating', hint: 'Someone is on it' },
    { id: 'adjust', label: 'Needs adjustment', hint: 'Goes into the journal' },
    { id: 'resolved', label: 'Resolved', hint: 'Posted or explained' },
  ]

  const KINDS: Record<ExceptionKind, { label: string; tone: string }> = {
    unrecorded: { label: 'Not in books', tone: 'danger' },
    'amount-mismatch': { label: 'Amount mismatch', tone: 'warning' },
    duplicate: { label: 'Duplicate', tone: 'warning' },
    timing: { label: 'Timing', tone: 'info' },
    unmatched: { label: 'Not on statement', tone: 'neutral' },
  }

  const items = $derived(
    workbench.exceptions.map((item) => ({
      id: item.id,
      column: workbench.stageOf(item),
      title: item.title,
      kind: item.kind,
      amount: item.amount,
      cashEffect: item.cashEffect,
      date: item.date,
      owner: workbench.owners[item.id] ?? '',
      noted: !!workbench.notes[item.id],
    })),
  )
  type Card = (typeof items)[number]

  const totals = $derived(
    COLUMNS.map((column) => {
      const cards = items.filter((item) => item.column === column.id)
      return { ...column, count: cards.length, effect: cards.reduce((total, card) => total + card.cashEffect, 0) }
    }),
  )

  let openId = $state<string | null>(null)
  const open = $derived(workbench.exceptions.find((item) => item.id === openId) ?? null)

  // Cards are drawn by the board inside its own shadow root, from a Lit template: `renderItem` is a function, so it
  // is handed over in the browser through an attachment. The template uses `html` from @c2n/core, the same Lit
  // instance the components render with, and colours through the app's inherited custom properties.
  const cardRenderer = (element: Element) => {
    ;(element as Kanban).renderItem = ({ item }: KanbanRenderContext) => {
      const card = item as Card
      const kind = KINDS[card.kind]
      return html`<div style="display: grid; gap: 6px; min-width: 0">
        <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between">
          <c2-badge tone=${kind.tone}>${kind.label}</c2-badge>
          <span style="font-family: var(--cw-mono); font-size: 12px; font-variant-numeric: tabular-nums">${formatMoney(card.amount)}</span>
        </div>
        <strong style="font-size: 13px; font-weight: 600; overflow-wrap: anywhere">${card.title}</strong>
        <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between; color: var(--cw-muted); font-size: 12px">
          <span>${formatDay(card.date)}${card.owner ? ` · ${card.owner}` : ''}${card.noted ? ' · note' : ''}</span>
          <c2-link-button @click=${() => (openId = card.id)} aria-label=${`Open ${card.title}`}>Details</c2-link-button>
        </div>
      </div>`
    }
  }

  /** The board's rules: an entry for what changes cash, an explanation for what does not. */
  function moveProblem(exception: ReconException, to: ExceptionStage): string | null {
    if (to === 'adjust' && exception.cashEffect === 0) return 'This one changes nothing in the books: explain it and move it to Resolved.'
    if (to === 'resolved' && exception.cashEffect !== 0 && workbench.stageOf(exception) !== 'resolved')
      return `It changes cash by ${formatSigned(exception.cashEffect)}: move it to Needs adjustment and post the entry.`
    return null
  }

  function onCardMove(event: KanbanEventMap['card-move']) {
    const exception = workbench.exceptions.find((item) => item.id === event.detail.key)
    if (!exception) return
    const problem = moveProblem(exception, event.detail.toColumn as ExceptionStage)
    if (problem) {
      event.preventDefault()
      workbench.notify({ variant: 'warning', heading: 'Card not moved', message: problem })
      return
    }
    workbench.setStage(exception.id, event.detail.toColumn as ExceptionStage)
  }

  function moveOpen(to: ExceptionStage) {
    if (!open) return
    const problem = moveProblem(open, to)
    if (problem) return workbench.notify({ variant: 'warning', heading: 'Not moved', message: problem })
    workbench.setStage(open.id, to)
  }

  const proposal = $derived(open ? proposeEntry(open, 'ADJ', workbench.bankById, workbench.ledgerById) : [])
</script>

<main class="page">
  <div class="page-head">
    <div>
      <h1>Exceptions</h1>
      <p class="muted">Everything the matcher could not pair. Drag a card, or pick it up with Space and move it with the arrow keys.</p>
    </div>
  </div>

  <section class="totals" aria-label="Board totals">
    {#each totals as column (column.id)}
      <div class="total">
        <span class="muted">{column.label}</span>
        <strong>{column.count}</strong>
        <span class="amount muted">{formatSigned(column.effect)} cash</span>
      </div>
    {/each}
  </section>

  <c2-kanban class="board" aria-label="Reconciliation exceptions" editable items={data(items)} oncard-move={onCardMove} {@attach cardRenderer}>
    {#each COLUMNS as column (column.id)}
      <c2-kanban-column column-id={column.id} label={column.label}>
        <span slot="empty" class="muted empty">{column.hint}</span>
      </c2-kanban-column>
    {/each}
  </c2-kanban>
</main>

<c2-sheet open={!!open} label="Exception" onclose={() => (openId = null)} class="detail">
  {#if open}
    <span slot="title">{open.title}</span>
    <div class="detail-body">
      <div class="detail-badges">
        <c2-badge tone={KINDS[open.kind].tone}>{KINDS[open.kind].label}</c2-badge>
        <c2-badge tone="neutral">{COLUMNS.find((column) => column.id === workbench.stageOf(open!))?.label}</c2-badge>
      </div>
      <p>{open.hint}</p>

      <c2-description-list aria-label="Lines involved" class="lines">
        {#each open.bankIds as id (id)}
          {@const line = workbench.bankById.get(id)!}
          <c2-description-item label={`Bank · ${formatDay(line.date)}`}
            >{line.description} <span class="amount">{formatMoney(line.amount)}</span></c2-description-item
          >
        {/each}
        {#each open.ledgerIds as id (id)}
          {@const entry = workbench.ledgerById.get(id)!}
          <c2-description-item label={`Ledger · ${formatDay(entry.date)}`}>
            {entry.docNo} · {entry.description} <span class="amount">{formatMoney(entry.amount)}</span>
          </c2-description-item>
        {/each}
        <c2-description-item label="Effect on cash"><span class="amount">{formatSigned(open.cashEffect)}</span></c2-description-item>
      </c2-description-list>

      {#if proposal.length}
        <div>
          <h3>Proposed entry</h3>
          <table class="entry">
            <thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead>
            <tbody>
              {#each proposal as line, index (index)}
                <tr>
                  <td>{accountLabel(line.account)}</td>
                  <td class="amount">{line.debit ? formatMoney(line.debit) : ''}</td>
                  <td class="amount">{line.credit ? formatMoney(line.credit) : ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <div class="field">
        <span class="muted">Owner</span>
        <c2-select
          aria-label="Owner"
          placeholder="Unassigned"
          value={workbench.owners[open.id] ? [workbench.owners[open.id]] : []}
          onselection-change={(event: SelectEventMap['selection-change']) =>
            (workbench.owners = { ...workbench.owners, [open!.id]: String(event.detail.value[0] ?? '') })}
        >
          {#each OWNERS as owner (owner)}
            <c2-list-item value={owner}>{owner}</c2-list-item>
          {/each}
        </c2-select>
      </div>

      <div class="field">
        <span class="muted">Note</span>
        <c2-inline-edit
          label="Note"
          multiline
          placeholder="What did you find? Click to write a note."
          value={workbench.notes[open.id] ?? ''}
          onchange={(event: Event) => (workbench.notes = { ...workbench.notes, [open!.id]: (event.currentTarget as HTMLInputElement).value })}
        ></c2-inline-edit>
      </div>
    </div>
    <div slot="footer" class="detail-actions">
      {#each COLUMNS.filter((column) => column.id !== workbench.stageOf(open!)) as column (column.id)}
        <c2-button class="button-quiet" onclick={() => moveOpen(column.id)}>Move to {column.label}</c2-button>
      {/each}
    </div>
  {/if}
</c2-sheet>

<style>
  .totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }

  .total {
    display: grid;
    gap: 2px;
    padding: 12px 14px;
    border: 1px solid var(--cw-border);
    border-radius: var(--cw-radius);
    background: var(--cw-surface);
  }

  .total strong {
    font-size: 20px;
  }

  .total .amount {
    font-size: 12px;
  }

  .board {
    display: block;
  }

  .empty {
    font-size: 12px;
  }

  .detail-body {
    display: grid;
    gap: 16px;
  }

  .detail-badges {
    display: flex;
    gap: 8px;
  }

  .lines {
    --c2-description-list__grid--columns: 1;
  }

  h3 {
    margin-bottom: 6px;
    font-size: 13px;
  }

  .entry {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .entry th,
  .entry td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--cw-border);
    text-align: left;
  }

  .entry th:not(:first-child),
  .entry td:not(:first-child) {
    text-align: right;
  }

  .field {
    display: grid;
    gap: 6px;
  }

  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
