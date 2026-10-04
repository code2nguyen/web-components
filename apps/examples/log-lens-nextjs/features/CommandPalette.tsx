'use client'

import type { ShortcutBinding } from '@c2n/components/shortcut'
import { useEffect, useMemo, useRef } from 'react'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'
import type { Analysis } from '@/lib/analysis'
import { formatClock, formatNumber, shorten } from '@/lib/format'
import { SEVERITY_LABEL } from '@/lib/insights'
import type { LensActions, View } from './types'

export const VIEW_ORDER: Array<{ id: View; label: string }> = [
  { id: 'story', label: 'Story' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'journeys', label: 'Journeys' },
  { id: 'differences', label: 'Differences' },
  { id: 'explore', label: 'Raw logs' },
]

/** Every keyboard shortcut of the app, in one place: c2-shortcut turns them into `shortcut` events. */
export const BINDINGS: ShortcutBinding[] = [
  { keys: 'mod+k', action: 'palette', description: 'Search patterns, chapters, services and views' },
  ...VIEW_ORDER.map((view, index) => ({ keys: `alt+${index + 1}`, action: `view:${view.id}`, description: `Go to ${view.label}` })),
  { keys: 'alt+backspace', action: 'clear', description: 'Clear the lens' },
]

interface Props {
  analysis: Analysis
  open: boolean
  actions: LensActions
  onClose: () => void
  onOpenFile: () => void
}

/** ⌘K: one search box over everything the analysis found, so nothing is more than a few keystrokes away. */
export function CommandPalette({ analysis, open, actions, onClose, onOpenFile }: Readonly<Props>) {
  const modalRef = useRef<HTMLElementTagNameMap['c2-modal']>(null)
  const commandRef = useRef<HTMLElementTagNameMap['c2-command']>(null)
  useElementProperties(modalRef, 'c2-modal', { open }, [open])
  useCustomEvent(modalRef, 'close', onClose)

  // A fresh query each time it opens.
  useEffect(() => {
    if (open) void customElements.whenDefined('c2-command').then(() => commandRef.current?.clear())
  }, [open])

  useCustomEvent(commandRef, 'command-select', (event) => {
    const [kind, ...rest] = event.detail.value.split(':')
    const value = rest.join(':')
    if (kind === 'view') actions.goTo(value as View)
    else if (kind === 'pattern') actions.openPattern(value)
    else if (kind === 'service') actions.setLens({ services: [value] })
    else if (kind === 'chapter') {
      actions.goTo('story')
      requestAnimationFrame(() => document.getElementById(`chapter-${value}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    } else if (kind === 'action' && value === 'clear') actions.clearLens()
    else if (kind === 'action' && value === 'file') onOpenFile()
    onClose()
  })

  const patterns = useMemo(() => analysis.patterns.slice(0, 300), [analysis])

  return (
    <c2-modal ref={modalRef} className="ll-palette" label="Search Log Lens" hide-close>
      <c2-command ref={commandRef} className="ll-palette__command" placeholder="Search patterns, chapters, services or views…" label="Search Log Lens" loop>
        <c2-feather-search slot="prefix-icon" />
        <c2-command-group heading="Views">
          {VIEW_ORDER.map((view, index) => (
            <c2-command-item key={view.id} value={`view:${view.id}`}>
              {view.label}
              <span slot="shortcut">Alt {index + 1}</span>
            </c2-command-item>
          ))}
        </c2-command-group>
        <c2-command-group heading="Story">
          {analysis.chapters.map((chapter) => (
            <c2-command-item key={chapter.id} value={`chapter:${chapter.id}`} keywords={chapter.kind}>
              {chapter.title}
              <span slot="description">{chapter.kind === 'opening' || chapter.kind === 'closing' ? chapter.kind : formatClock(chapter.start)}</span>
            </c2-command-item>
          ))}
        </c2-command-group>
        <c2-command-group heading="Patterns">
          {patterns.map((pattern) => (
            <c2-command-item key={pattern.id} value={`pattern:${pattern.id}`} keywords={`${pattern.id} ${pattern.services.join(' ')} ${pattern.severity}`}>
              {shorten(pattern.template, 90)}
              <span slot="description">
                {pattern.id} · {SEVERITY_LABEL[pattern.severity]} · {formatNumber(pattern.count)}× · {pattern.services.join(', ')}
              </span>
            </c2-command-item>
          ))}
        </c2-command-group>
        <c2-command-group heading="Services">
          {analysis.services.map((service) => (
            <c2-command-item key={service.name} value={`service:${service.name}`} keywords="service lens">
              {service.name}
              <span slot="description">
                Put in the lens · {formatNumber(service.count)} records{service.problems ? `, ${formatNumber(service.problems)} errors` : ''}
              </span>
            </c2-command-item>
          ))}
        </c2-command-group>
        <c2-command-separator />
        <c2-command-group heading="Actions">
          <c2-command-item value="action:clear" keywords="reset filter lens">
            Clear the lens
            <span slot="shortcut">Alt ⌫</span>
          </c2-command-item>
          <c2-command-item value="action:file" keywords="upload new open another">
            Open another file
          </c2-command-item>
        </c2-command-group>
        <span slot="empty">Nothing matches. Try a service name, a word from a message, or a pattern id like P07.</span>
      </c2-command>
    </c2-modal>
  )
}
