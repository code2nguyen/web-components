<script lang="ts">
  import '../app.css'

  import { onMount, type Snippet } from 'svelte'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { ToastRegion } from '@c2n/components/toast'

  import { formatMoney } from '#lib/close/money.ts'
  import { ACCOUNT_NAME, COMPANY, PERIOD } from '#lib/close/sample.ts'
  import { setWorkbench, Workbench } from '#lib/workbench.svelte.ts'

  let { children }: { children: Snippet } = $props()

  const workbench = new Workbench()
  setWorkbench(workbench)

  let toasts = $state<ToastRegion>()
  workbench.notify = (options) => toasts?.show({ duration: 5000, ...options })

  // The prerendered page is the untouched month; the saved decisions come back once the browser has hydrated it.
  // `data-hydrated` then says the page is interactive: until now the prerendered markup shows, but no handler is
  // attached yet, so a click or a typed value would be lost (the browser tests wait for it).
  onMount(() => {
    workbench.restore()
    document.documentElement.dataset.hydrated = ''
  })

  const nav = [
    { route: '/', label: 'Overview' },
    { route: '/reconcile', label: 'Reconcile' },
    { route: '/exceptions', label: 'Exceptions' },
    { route: '/journal', label: 'Journal' },
  ] as const

  const counts = $derived<Record<string, number>>({
    '/reconcile': workbench.result.unmatchedBank.length + workbench.result.unmatchedLedger.length,
    '/exceptions': workbench.openExceptions.length,
    '/journal': workbench.toAdjust.length,
  })
</script>

<svelte:head>
  <title>{COMPANY} · {PERIOD.label} close</title>
</svelte:head>

<c2-header sticky navigation-label="Workbench" class="app-header">
  <a slot="brand" class="brand" href={resolve('/')}>
    <span class="brand-mark" aria-hidden="true">F</span>
    <span class="brand-text">
      <strong>{COMPANY}</strong>
      <span class="muted">{PERIOD.label} close · {ACCOUNT_NAME}</span>
    </span>
  </a>

  <c2-navigation-menu aria-label="Workbench" mobile-breakpoint="760">
    {#each nav as item (item.route)}
      <c2-navigation-menu-item href={resolve(item.route)} current={page.route.id === item.route}>
        {item.label}
        {#if counts[item.route]}
          <c2-badge slot="suffix-icon" tone="neutral" count={counts[item.route]}></c2-badge>
        {/if}
      </c2-navigation-menu-item>
    {/each}
  </c2-navigation-menu>

  <div slot="actions" class="header-actions">
    <c2-badge tone={workbench.recon.difference === 0 ? 'success' : 'danger'} class="difference" title="Adjusted bank minus adjusted book">
      {workbench.recon.difference === 0 ? 'Balanced' : `Off by ${formatMoney(Math.abs(workbench.recon.difference))}`}
    </c2-badge>
    <c2-theme-select storage-key="close-workbench-theme" aria-label="Colour theme"></c2-theme-select>
  </div>
</c2-header>

{@render children()}

<c2-toast-region bind:this={toasts} position="bottom-right"></c2-toast-region>

<style>
  .app-header {
    --c2-header--background: color-mix(in srgb, var(--cw-surface) 92%, transparent);
    --c2-header--border-bottom: 1px solid var(--cw-border);
  }

  /* The current section is a tinted pill rather than an underline. */
  .app-header c2-navigation-menu-item {
    --c2-navigation-menu-item--padding-top: 8px;
    --c2-navigation-menu-item--padding-right: 12px;
    --c2-navigation-menu-item--padding-bottom: 8px;
    --c2-navigation-menu-item--padding-left: 12px;
    --c2-navigation-menu-item--border-top-left-radius: 8px;
    --c2-navigation-menu-item--border-top-right-radius: 8px;
    --c2-navigation-menu-item--border-bottom-left-radius: 8px;
    --c2-navigation-menu-item--border-bottom-right-radius: 8px;
    --c2-navigation-menu-item--color: var(--cw-text);
    --c2-navigation-menu-item__hover--background: var(--cw-surface-2);
    --c2-navigation-menu-item__current--background: var(--cw-accent-soft);
    --c2-navigation-menu-item__current--color: var(--cw-accent);
    --c2-navigation-menu-item__current--font-weight: 600;
    --c2-navigation-menu-item__indicator--height: 0px;
  }

  .brand {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }

  .brand-mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--cw-accent);
    color: var(--cw-surface);
    font-weight: 700;
  }

  .brand-text {
    display: grid;
    min-width: 0;
    line-height: 1.25;
  }

  .brand-text span {
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .difference {
    font-family: var(--cw-mono);
    white-space: nowrap;
  }
</style>
