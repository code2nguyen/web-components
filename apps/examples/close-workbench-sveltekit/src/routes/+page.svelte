<script lang="ts">
  import { resolve } from '$app/paths'

  import {
    ACCOUNT_STATES,
    accountBands,
    CLOSE_DEADLINE,
    CLOSE_DAYS,
    CLOSE_MARKERS,
    CLOSE_TODAY,
    closeTasks,
    TIMELINE_END,
    TIMELINE_START,
  } from '#lib/close/close-plan.ts'
  import { formatDay } from '#lib/close/dates.ts'
  import { formatMoney, formatSigned } from '#lib/close/money.ts'
  import { dailyBalances } from '#lib/close/reconciliation.ts'
  import { OPENING_BALANCE, PERIOD } from '#lib/close/sample.ts'
  import { data } from '#lib/ssr.ts'
  import { getWorkbench, OWNERS } from '#lib/workbench.svelte.ts'

  const workbench = getWorkbench()
  const recon = $derived(workbench.recon)
  const preparer = OWNERS[0]

  const progress = $derived({ reconciled: workbench.reconciledShare, posted: workbench.posted.length > 0, signedOff: !!workbench.signOff })
  const tasks = $derived(closeTasks(progress))
  const bands = $derived(accountBands(progress))

  const balances = dailyBalances(OPENING_BALANCE, workbench.month.bank, workbench.month.ledger, PERIOD.start, PERIOD.end).map((point) => ({
    t: Date.parse(`${point.day}T12:00:00Z`),
    // In thousands, so the axis reads 150 rather than a clipped 150,000.
    bank: point.bank / 100_000,
    book: point.book / 100_000,
  }))

  const closeDay = CLOSE_DAYS.indexOf(CLOSE_TODAY) + 1
  const pendingAdjustments = $derived(workbench.toAdjust.length)
  const openCount = $derived(workbench.openExceptions.length)

  type StepStatus = 'success' | 'current' | 'pending' | 'warning'
  const steps = $derived.by(() => {
    const matched = workbench.matchedLineCount
    const posted = workbench.posted.length > 0 && pendingAdjustments === 0
    const status = (done: boolean, active: boolean): StepStatus => (done ? 'success' : active ? 'current' : 'pending')
    return [
      { id: 'import', label: 'Statement imported', trailing: `${workbench.month.bank.length} bank lines`, status: 'success' as StepStatus },
      { id: 'match', label: 'Lines matched', trailing: `${matched} of ${workbench.lineCount}`, status: 'success' as StepStatus },
      {
        id: 'exceptions',
        label: 'Exceptions worked',
        trailing: openCount ? `${openCount} open` : 'all resolved',
        status: status(openCount === 0, true),
      },
      {
        id: 'post',
        label: 'Adjustments posted',
        trailing: workbench.posted.length ? `${formatSigned(recon.adjustmentsPosted)} to cash` : 'none yet',
        status: status(posted, pendingAdjustments > 0),
      },
      {
        id: 'difference',
        label: 'Difference is zero',
        trailing: recon.difference === 0 ? 'adjusted bank = adjusted book' : `${formatMoney(recon.difference)} unexplained`,
        status: recon.difference === 0 ? ('success' as StepStatus) : ('warning' as StepStatus),
      },
      {
        id: 'sign',
        label: 'Preparer sign-off',
        trailing: workbench.signOff ? `${workbench.signOff.by}` : 'waiting',
        status: status(!!workbench.signOff, workbench.readyToSignOff),
      },
    ]
  })
</script>

<main class="page">
  <div class="page-head">
    <div>
      <h1>Operating account · {PERIOD.label}</h1>
      <p class="muted">Close day {closeDay} of {CLOSE_DAYS.length} · due {formatDay(CLOSE_DEADLINE)}</p>
    </div>
    <div class="toolbar">
      <c2-link-button href={resolve('/reconcile')}>Open the matcher →</c2-link-button>
    </div>
  </div>

  <section class="stats" aria-label="Reconciliation at a glance">
    <c2-stat class="stat-accent" label="Lines reconciled" value={`${Math.round(workbench.reconciledShare * 100)}%`}>
      <c2-feather-git-merge slot="icon"></c2-feather-git-merge>
      <span slot="description">{workbench.matchedLineCount} of {workbench.lineCount} matched, the rest explained</span>
    </c2-stat>
    <c2-stat label="Unreconciled difference" tone={recon.difference === 0 ? 'positive' : 'negative'}>
      <c2-feather-dollar-sign slot="icon"></c2-feather-dollar-sign>
      <span slot="value" class="amount">{formatMoney(recon.difference)}</span>
      <span slot="description">adjusted bank minus adjusted book</span>
    </c2-stat>
    <c2-stat label="Open exceptions" value={String(openCount)} tone={openCount ? 'warning' : 'positive'}>
      <c2-feather-alert-triangle slot="icon"></c2-feather-alert-triangle>
      <span slot="description">{pendingAdjustments} waiting for an adjusting entry</span>
    </c2-stat>
    <c2-stat label="Adjustments posted">
      <c2-feather-layers slot="icon"></c2-feather-layers>
      <span slot="value" class="amount">{formatSigned(recon.adjustmentsPosted)}</span>
      <span slot="description">{workbench.posted.length} journal lines</span>
    </c2-stat>
  </section>

  <div class="grid-2">
    <c2-card>
      <div slot="header" class="card-head">
        <h2>Bank reconciliation</h2>
        <c2-badge tone={recon.difference === 0 ? 'success' : 'danger'}>{recon.difference === 0 ? 'Reconciled' : 'Not reconciled'}</c2-badge>
      </div>
      <c2-description-list class="recon" aria-label="Bank reconciliation">
        <c2-description-item label="Balance per bank statement"><span class="figure">{formatMoney(recon.statementBalance)}</span></c2-description-item>
        <c2-description-item label="+ Deposits in transit"><span class="figure">{formatMoney(recon.depositsInTransit)}</span></c2-description-item>
        <c2-description-item label="− Outstanding checks" class="rule"><span class="figure">{formatMoney(recon.outstandingChecks)}</span></c2-description-item>
        <c2-description-item label="Adjusted bank balance" class="subtotal gap"
          ><span class="figure">{formatMoney(recon.adjustedBank)}</span></c2-description-item
        >
        <c2-description-item label="Balance per books"><span class="figure">{formatMoney(recon.bookBalance)}</span></c2-description-item>
        <c2-description-item label="± Adjustments posted" class="rule"><span class="figure">{formatSigned(recon.adjustmentsPosted)}</span></c2-description-item>
        <c2-description-item label="Adjusted book balance" class="subtotal"><span class="figure">{formatMoney(recon.adjustedBook)}</span></c2-description-item>
        <c2-description-item label="Difference" class="subtotal">
          <span class="figure" class:bad={recon.difference !== 0}>{formatMoney(recon.difference)}</span>
        </c2-description-item>
      </c2-description-list>
    </c2-card>

    <c2-card>
      <div slot="header" class="card-head">
        <h2>Sign-off</h2>
        {#if workbench.signOff}
          <c2-badge tone="success">Signed {new Date(workbench.signOff.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</c2-badge>
        {/if}
      </div>
      <c2-steps class="checklist" aria-label="Sign-off checklist" steps={data(steps)}></c2-steps>
      <div slot="footer" class="sign-footer">
        {#if workbench.signOff}
          <p class="muted">Signed off by {workbench.signOff.by}. Any change to the reconciliation clears the sign-off.</p>
        {:else}
          <p class="muted">
            {workbench.readyToSignOff ? 'Everything ties out.' : 'Sign-off opens once every exception is resolved and the difference is zero.'}
          </p>
          <c2-popconfirm heading="Sign off the September reconciliation?" confirm-label="Sign off" onconfirm={() => workbench.sign(preparer)}>
            <c2-button slot="trigger" disabled={!workbench.readyToSignOff}>
              <c2-feather-check-circle slot="prefix-icon"></c2-feather-check-circle>
              Sign off as {preparer}
            </c2-button>
            The reviewer is notified and the operating account is marked reconciled on the close calendar.
          </c2-popconfirm>
        {/if}
      </div>
    </c2-card>
  </div>

  <c2-card>
    <div slot="header" class="card-head">
      <h2>Close calendar</h2>
      <p class="muted">The operating account's rec and its adjustments are live from this workbench.</p>
    </div>
    <c2-gantt class="calendar" aria-label="September close calendar" tasks={data(tasks)} scale="day" today={CLOSE_TODAY} start="2026-09-30" end="2026-10-08"
    ></c2-gantt>
  </c2-card>

  <div class="grid-2">
    <c2-card>
      <div slot="header" class="card-head">
        <h2>Balance-sheet accounts</h2>
        <p class="muted">Status through the close so far</p>
      </div>
      <c2-state-timeline
        aria-label="Account reconciliation status"
        series={data(bands)}
        states={data(ACCOUNT_STATES)}
        markers={data(CLOSE_MARKERS)}
        start={TIMELINE_START}
        end={TIMELINE_END}
      ></c2-state-timeline>
    </c2-card>

    <c2-card>
      <div slot="header" class="card-head">
        <h2>Bank vs book balance</h2>
        <p class="muted">Daily closing balance in September</p>
      </div>
      <c2-line-chart class="balances" x-type="time" x-field="t" data={data(balances)} legend="bottom" points="never">
        <c2-chart-series field="bank" label="Bank statement ($k)"></c2-chart-series>
        <c2-chart-series field="book" label="Books ($k)"></c2-chart-series>
      </c2-line-chart>
    </c2-card>
  </div>
</main>

<style>
  /* The reconciliation as an accountant writes it: amounts right-aligned, a rule above each subtotal. */
  .recon {
    --c2-description-list__grid--columns: 1;
    --c2-description-list__grid--row-gap: 0px;
    --c2-description-item__label--width: 240px;
    --c2-description-item__label--color: var(--cw-muted);
    --c2-description-item__label--font-weight: 400;
    --c2-description-item__container--padding: 5px 0;
  }

  .recon .rule {
    --c2-description-item__container--border-bottom: 1px solid var(--cw-border);
  }

  .recon .subtotal {
    --c2-description-item__label--color: var(--cw-text);
    --c2-description-item__label--font-weight: 600;
    --c2-description-item__value--font-weight: 600;
  }

  .recon .gap {
    --c2-description-item__container--padding: 5px 0 14px;
  }

  .figure {
    display: block;
    font-family: var(--cw-mono);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .checklist {
    --c2-step__label--font-family: var(--cw-sans);
    --c2-step__trailing--color: var(--cw-muted);
    --c2-step__trailing--font-size: 13px;
    --c2-step__row--padding-block: 6px;
  }

  .bad {
    color: var(--cw-danger);
  }

  .sign-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .sign-footer p {
    flex: 1 1 240px;
    font-size: 13px;
  }

  /* The close is nine days wide: give each day room so the bars, and the labels beside them, fit the card. */
  .calendar {
    --c2-gantt__column-day--width: 104px;
    --c2-gantt__today--color: var(--cw-accent);
    --c2-gantt__header__today--color: var(--cw-surface);
  }

  /* The host is a flex column whose plot grows to fill it: size it through the variable, never `display`. */
  .balances {
    --c2-chart--height: 260px;
  }
</style>
