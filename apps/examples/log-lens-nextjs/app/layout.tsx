import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { C2Registry } from '@/components/c2n/C2Registry'
import './globals.css'

export const metadata: Metadata = {
  title: 'Log Lens · OpenTelemetry log analyzer',
  description: 'Read an OpenTelemetry log file as a story: patterns, incidents, diverging requests and the attributes behind the errors.',
}

// Runs before first paint. `?theme=` is how the docs site hands its theme to the embedded demo; otherwise the choice
// c2-theme-select remembered under `log-lens-theme` wins, then the OS preference.
const themeBootstrap = `(function(){var key='log-lens-theme';try{var q=new URLSearchParams(location.search).get('theme');if(q==='light'||q==='dark')localStorage.setItem(key,q);var mode=localStorage.getItem(key)||'system';var dark=mode==='dark'||(mode!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})()`

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <C2Registry />
        {children}
      </body>
    </html>
  )
}
