'use client'

import { formatShortcut } from '@c2n/core/shortcut-helper.js'
import { useCallback, useEffect, useState } from 'react'
import { createSampleJsonl } from '@/lib/sample'

interface Props {
  fileName?: string
  onReset: () => void
  onSample: () => void
  /** Present once a file is loaded: opens the command palette. */
  onSearch?: () => void
}

export function AppHeader({ fileName, onReset, onSample, onSearch }: Readonly<Props>) {
  // The platform-aware label (⌘K or Ctrl K) is only known in the browser.
  const [shortcutLabel, setShortcutLabel] = useState('Ctrl K')
  useEffect(() => setShortcutLabel(formatShortcut('mod+k')[0] ?? 'Ctrl K'), [])

  const download = useCallback(() => {
    const url = URL.createObjectURL(new Blob([createSampleJsonl()], { type: 'application/x-ndjson' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: 'shop-checkout.otlp.jsonl' })
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [])

  return (
    <c2-header className="ll-header" sticky blurred navigation-label="Log Lens">
      <div slot="brand" className="ll-brand">
        <span className="ll-brand__mark" aria-hidden="true">
          <c2-feather-layers />
        </span>
        <span className="ll-brand__name">Log Lens</span>
        <span className="ll-brand__tag">OpenTelemetry log analyzer</span>
      </div>
      {fileName && (
        <div className="ll-header__file">
          <c2-feather-file-text aria-hidden="true" />
          <span title={fileName}>{fileName}</span>
        </div>
      )}
      <div slot="actions" className="ll-header__actions">
        {onSearch && (
          <c2-button className="ll-button--quiet ll-search-button" onClick={onSearch} aria-keyshortcuts="Control+K Meta+K">
            <c2-feather-search slot="prefix-icon" />
            Search
            <span slot="suffix-icon" className="ll-search-button__keys">
              {shortcutLabel}
            </span>
          </c2-button>
        )}
        {fileName ? (
          <c2-button className="ll-button--quiet" onClick={onReset}>
            <c2-feather-upload slot="prefix-icon" />
            Open another file
          </c2-button>
        ) : (
          <c2-button className="ll-button--quiet" onClick={onSample}>
            <c2-feather-zap slot="prefix-icon" />
            Try the sample
          </c2-button>
        )}
        <c2-icon-button aria-label="Download the sample OTLP file" tooltip="Download the sample OTLP file" onClick={download}>
          <c2-feather-download />
        </c2-icon-button>
        <c2-theme-select storage-key="log-lens-theme" aria-label="Colour theme" />
      </div>
    </c2-header>
  )
}
