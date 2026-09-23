'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { buildScopedHref } from '../../lib/query/navigation-state'
import { useScope } from '../../providers/ScopeProvider'

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: 'home' },
  { href: '/services/', label: 'Services', icon: 'server' },
  { href: '/traces/', label: 'Traces', icon: 'activity' },
  { href: '/logs/', label: 'Logs', icon: 'file-text' },
  { href: '/dashboards/', label: 'Dashboards', icon: 'bar-chart' },
  { href: '/alerts/', label: 'Alerts', icon: 'bell' },
] as const

function NavigationIcon({ icon }: Readonly<{ icon: (typeof NAV_ITEMS)[number]['icon'] }>) {
  if (icon === 'home') return <c2-feather-home aria-hidden="true" />
  if (icon === 'server') return <c2-feather-server aria-hidden="true" />
  if (icon === 'activity') return <c2-feather-activity aria-hidden="true" />
  if (icon === 'file-text') return <c2-feather-file-text aria-hidden="true" />
  if (icon === 'bar-chart') return <c2-feather-bar-chart-2 aria-hidden="true" />
  return <c2-feather-bell aria-hidden="true" />
}

function routeIsCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href.slice(0, -1) || pathname.startsWith(href)
}

export function AppNavigation() {
  const pathname = usePathname()
  const { scope } = useScope()

  return (
    <nav className="app-navigation" aria-label="Observability workspace">
      <p className="navigation-eyebrow">Workspace</p>
      <ul>
        {NAV_ITEMS.map((item) => {
          const current = routeIsCurrent(pathname, item.href)
          return (
            <li key={item.href}>
              <Link href={buildScopedHref(item.href, scope)} className="navigation-link" aria-current={current ? 'page' : undefined}>
                <NavigationIcon icon={item.icon} />
                <span>{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="navigation-note">
        <c2-feather-clock aria-hidden="true" />
        <span>Dataset baseline</span>
        <strong>17 Aug 2026 · 14:00 UTC</strong>
      </div>
    </nav>
  )
}
