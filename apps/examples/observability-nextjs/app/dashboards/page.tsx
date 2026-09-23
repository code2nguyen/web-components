import type { Metadata } from 'next'
import { OperationalDashboard } from '@/features/dashboards/OperationalDashboard'

export const metadata: Metadata = {
  title: 'Operational dashboard',
  description: 'A persistent, keyboard-editable synthetic operations dashboard built with c2n charts and layout components.',
}

export default function DashboardPage() {
  return <OperationalDashboard />
}
