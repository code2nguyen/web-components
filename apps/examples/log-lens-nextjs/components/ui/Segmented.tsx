'use client'

import { useRef } from 'react'
import { useElementProperties } from '../c2n/element-bindings'
import { useCustomEvent } from '../c2n/useCustomEvent'

/** A single-choice c2-button-group in its segmented appearance, driven by React state. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: Readonly<{ label: string; value: T; options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>; onChange: (value: T) => void }>) {
  const ref = useRef<HTMLElementTagNameMap['c2-button-group']>(null)
  useElementProperties(ref, 'c2-button-group', { value }, [value])
  useCustomEvent(ref, 'change', (event) => {
    const next = options.find((option) => option.value === event.detail.value)
    if (next) onChange(next.value)
  })
  return (
    <c2-button-group ref={ref} className="ll-segmented" selection="single" appearance="segmented" size="s" value={value} aria-label={label}>
      {options.map((option) => (
        <c2-button key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </c2-button>
      ))}
    </c2-button-group>
  )
}
