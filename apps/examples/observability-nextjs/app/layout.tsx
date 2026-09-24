import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { C2Registry } from '@/components/c2n/C2Registry'
import { AppShell } from '@/components/app-shell/AppShell'
import { AppProviders } from '@/providers/AppProviders'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Signal Forge Observability', template: '%s · Signal Forge' },
  description: 'A deterministic Next.js observability example built with c2n web components.',
}

const themeBootstrap = `(function(){try{var raw=localStorage.getItem('c2n-observability:v1:theme');var value=raw?JSON.parse(raw):null;var theme=value&&value.schemaVersion===1&&value.data&&value.data.theme;var dark=theme==='dark'||(theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})()`

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <C2Registry />
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  )
}
