'use client'

import type { Select } from '@c2n/select'
import type { Sheet } from '@c2n/sheet'
import { usePathname } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { useElementProperties } from '../c2n/element-bindings'
import { useCustomEvent } from '../c2n/useCustomEvent'
import { useDemoState, type DemoState } from '../../providers/DemoStateProvider'
import { componentGroupsForPathname, componentSourcePathForRegions } from './component-map'
import { componentDocsUrl, componentSourceUrl } from './component-links'

const DEMO_STATES: readonly DemoState[] = ['normal', 'loading', 'empty', 'error']

export function BuiltWithC2n() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLElementTagNameMap['c2-button']>(null)
  const sheetRef = useRef<Sheet>(null)
  const stateRef = useRef<Select>(null)
  const { demoState, setDemoState } = useDemoState()
  const groups = useMemo(() => componentGroupsForPathname(pathname), [pathname])
  useElementProperties(sheetRef, 'c2-sheet', { open }, [open])
  useElementProperties(stateRef, 'c2-select', { value: [demoState] }, [demoState])
  useCustomEvent(sheetRef, 'close', () => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  })
  useCustomEvent(sheetRef, 'cancel', () => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  })
  useCustomEvent(stateRef, 'selection-change', (event) => {
    const state = event.detail.value[0]
    if (DEMO_STATES.includes(state as DemoState)) setDemoState(state as DemoState)
  })

  return (
    <div className="built-with">
      <c2-button ref={triggerRef} onClick={() => setOpen(true)} aria-haspopup="dialog">
        Built with c2n
      </c2-button>
      <c2-sheet ref={sheetRef} side="right" label="Built with c2n">
        <div slot="title">
          <strong>Built with c2n</strong>
          <small>{pathname}</small>
        </div>
        <div className="built-with-content">
          <p>Inspect the public components composing this page and exercise deterministic states without changing its URL or saved preferences.</p>
          <label className="scope-field">
            <span className="scope-label">Demo state</span>
            <c2-select ref={stateRef} aria-label="Demo state">
              {DEMO_STATES.map((state) => (
                <c2-list-item key={state} value={state}>
                  {state[0].toUpperCase() + state.slice(1)}
                </c2-list-item>
              ))}
            </c2-select>
          </label>
          <div className="component-map">
            {groups.map((group) => (
              <section className="component-map-group" aria-labelledby={`component-group-${group.id}`} key={group.id}>
                <h3 id={`component-group-${group.id}`}>
                  {group.label} <span>{group.records.length}</span>
                </h3>
                <div className="component-map-list">
                  {group.records.map((record) => (
                    <c2-details key={record.tag} label={`${record.tag} · ${record.packageName}`}>
                      <p>{record.purpose}</p>
                      <p>
                        <strong>Regions:</strong> {record.regions.filter((region) => group.regions.includes(region)).join(', ')}
                      </p>
                      <div className="page-actions">
                        <c2-link-button href={componentDocsUrl(record.docsPath)} target="_blank" rel="noreferrer">
                          Documentation
                        </c2-link-button>
                        <c2-link-button href={componentSourceUrl(componentSourcePathForRegions(record, group.regions))} target="_blank" rel="noreferrer">
                          Example source
                        </c2-link-button>
                      </div>
                    </c2-details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </c2-sheet>
    </div>
  )
}
