'use client'

import type { SideNav } from '@c2n/side-nav'
import Link from 'next/link'
import { useRef, useState, type ReactNode } from 'react'
import { GlobalScopeControls } from '@/components/scope/GlobalScopeControls'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'
import { useAppContext } from '@/providers/AppProviders'
import { AppNavigation } from './AppNavigation'
import { BuiltWithC2n } from '../built-with/BuiltWithC2n'
import { useScope } from '@/providers/ScopeProvider'
import { buildScopedHref } from '@/lib/query/navigation-state'

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const sideNavRef = useRef<SideNav>(null)
  const [navigationOpen, setNavigationOpen] = useState(true)
  const { announcement } = useAppContext()
  const { scope } = useScope()

  useElementProperties(sideNavRef, 'c2-side-nav', { opened: navigationOpen }, [navigationOpen])
  useCustomEvent(sideNavRef, 'opened-change', (event) => setNavigationOpen(event.detail.opened))

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <c2-header sticky blurred navigation-label="Product">
        <Link slot="brand" className="product-brand" href={buildScopedHref('/', scope)} aria-label="Signal Forge overview">
          <span className="product-mark" aria-hidden="true">
            <c2-feather-activity />
          </span>
          <span>
            <strong>Signal Forge</strong>
            <small>Observability lab</small>
          </span>
        </Link>
        <span className="header-context">Deterministic operations workspace</span>
        <div slot="actions" className="header-actions">
          <c2-badge tone="success">
            <span className="status-dot" aria-hidden="true" /> Local dataset
          </c2-badge>
          <a className="source-link" href="https://github.com/code2nguyen/web-components/tree/develop/apps/examples/observability-nextjs">
            View source
          </a>
        </div>
      </c2-header>

      <GlobalScopeControls navigationOpen={navigationOpen} onNavigationToggle={() => setNavigationOpen((open) => !open)} />

      <c2-side-nav ref={sideNavRef} opened desktop-mode="side" tablet-mode="over" responsive-tablet>
        <div slot="side-nav-content" className="navigation-panel">
          <AppNavigation />
        </div>
        <main id="main-content" className="page-content" tabIndex={-1}>
          {children}
          <BuiltWithC2n />
        </main>
      </c2-side-nav>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </>
  )
}
