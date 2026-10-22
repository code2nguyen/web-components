<script lang="ts">
  import { resolve } from '$app/paths'
  import { html } from '@c2n/core/lit-helper.js'
  import type { Kanban, KanbanEventMap, KanbanRenderContext } from '@c2n/components/kanban'
  import type { SelectEventMap } from '@c2n/components/select'
  import type { TableColumnConfig } from '@c2n/components/table'

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

  const KINDS: Record<ExceptionKind, { label: string; tone: 'danger' | 'warning' | 'info' | 'neutral' }> = {
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
    if (workbench.isPosted(exception) && to !== 'resolved')
      return 'Its entry is already posted. Moving it back would propose and post the same entry a second time.'
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
  const proposalRows = $derived(
    proposal.map((line, index) => ({
      id: index,
      account: accountLabel(line.account),
      debit: line.debit ? line.debit / 100 : null,
      credit: line.credit ? line.credit / 100 : null,
    })),
  )
  const ENTRY_COLUMNS: TableColumnConfig[] = [
    { field: 'account', header: 'Account', width: '1fr' },
    { field: 'debit', header: 'Debit', width: '110px', align: 'end', format: 'currency' },
    { field: 'credit', header: 'Credit', width: '110px', align: 'end', format: 'currency' },
  ]

  /** The one move that resolves the open card: an entry for what changes cash, an explanation for what does not. */
  const next = $derived.by((): ExceptionStage | 'journal' | null => {
    if (!open) return null
    const stage = workbench.stageOf(open)
    if (stage === 'resolved' || workbench.isPosted(open)) return null
    if (open.cashEffect === 0) return 'resolved'
    return stage === 'adjust' ? 'journal' : 'adjust'
  })
</script>

<main class="page">
  <div class="page-head">
    <div>
      <h1>Exceptions</h1>
      <p class="muted">Everything the matcher could not pair. Drag a card, or pick it up with Space and move it with the arrow keys.</p>
    </div>
  </div>

  <c2-kanban class="board" aria-label="Reconciliation exceptions" editable items={data(items)} oncard-move={onCardMove} {@attach cardRenderer}>
    {#each totals as column (column.id)}
      <c2-kanban-column column-id={column.id} label={column.label}>
        <div slot="header" class="column-head">
          <h2>{column.label} <span class="muted">{column.count}</span></h2>
          <span class="amount muted" title="Effect on cash">{formatSigned(column.effect)}</span>
        </div>
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
      <p class="callout callout-{KINDS[open.kind].tone}">{open.hint}</p>

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
          <c2-table class="entry" aria-label="Proposed entry" rows={data(proposalRows)} columns={data(ENTRY_COLUMNS)} resizable={false} virtual="never"
          ></c2-table>
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
      {#if next === 'journal'}
        <c2-link-button href={resolve('/journal')}>Post it from the journal →</c2-link-button>
      {:else if next}
        <c2-button onclick={() => moveOpen(next)}>Move to {COLUMNS.find((column) => column.id === next)?.label}</c2-button>
      {/if}
      {#if workbench.isPosted(open)}
        <span class="muted">Its entry is posted.</span>
      {:else if workbench.stageOf(open) === 'new'}
        <c2-button class="button-quiet" onclick={() => moveOpen('investigating')}>Mark as investigating</c2-button>
      {:else}
        <c2-button class="button-quiet" onclick={() => moveOpen('new')}>Back to Unreviewed</c2-button>
      {/if}
    </div>
  {/if}
</c2-sheet>

<style>
  .board {
    display: block;
  }

  /* Columns are tinted lanes, cards white tiles on them; the drop gap is a dashed tint of the accent. */
  .board c2-kanban-column {
    /* Four lanes share the page (the board scrolls sideways below ~1000px), and a long lane scrolls its own cards. */
    --c2-kanban-column--width: max(240px, calc(25% - 9px));
    --c2-kanban-column--max-height: 720px;
    --c2-kanban-column--background-color: var(--cw-surface-2);
    --c2-kanban-column--border: 0;
    --c2-kanban-column--border-radius: var(--cw-radius);
    --c2-kanban-column--padding: 12px;
    --c2-kanban-column--gap: 10px;
    --c2-kanban-column__cards--gap: 10px;
    --c2-kanban-column__card--background-color: var(--cw-surface);
    --c2-kanban-column__card--border: 1px solid var(--cw-border);
    --c2-kanban-column__card--border-radius: 10px;
    --c2-kanban-column__card--padding: 12px;
    --c2-kanban-column__card--box-shadow: none;
    --c2-kanban-column__card__hover--border-color: var(--cw-border-strong);
    --c2-kanban-column__card__picked--box-shadow: 0 6px 18px color-mix(in srgb, var(--cw-accent) 16%, transparent);
    --c2-kanban-column__placeholder--border: 2px dashed color-mix(in srgb, var(--cw-accent) 45%, transparent);
    --c2-kanban-column__placeholder--background-color: var(--cw-accent-soft);
    --c2-kanban-column__target--background-color: var(--cw-accent-soft);
    --c2-kanban-column__empty--border: 1px dashed var(--cw-border-strong);
    --c2-kanban-column__empty--background-color: transparent;
  }

  .column-head {
    display: flex;
    gap: 8px;
    align-items: baseline;
    justify-content: space-between;
    width: 100%;
  }

  .column-head h2 {
    font-size: 14px;
  }

  .column-head h2 .muted {
    font-weight: 500;
  }

  .column-head .amount {
    font-size: 12px;
  }

  .callout {
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--cw-neutral-soft);
  }

  .callout-danger {
    background: var(--cw-danger-soft);
  }

  .callout-warning {
    background: var(--cw-warning-soft);
  }

  .callout-info {
    background: var(--cw-info-soft);
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
    --c2-table__row--height: 34px;
    --c2-table--max-height: 160px;
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
