'use client'

import { useRef, useState } from 'react'
import { useAppContext } from '../../providers/AppProviders'
import { useElementProperties } from '../../components/c2n/element-bindings'
import { useCustomEvent } from '../../components/c2n/useCustomEvent'
import styles from './alerts.module.css'

interface AlertActionsProps {
  onReset: () => boolean
  onDelivery?: () => void
}

export function AlertActions({ onReset, onDelivery }: Readonly<AlertActionsProps>) {
  const modalRef = useRef<HTMLElementTagNameMap['c2-modal']>(null)
  const resetButtonRef = useRef<HTMLElementTagNameMap['c2-button']>(null)
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const { announce } = useAppContext()

  useElementProperties(modalRef, 'c2-modal', { open }, [open])
  useCustomEvent(modalRef, 'close', () => {
    setOpen(false)
    resetButtonRef.current?.focus()
  })

  const confirmReset = () => {
    const persisted = onReset()
    const message = persisted
      ? 'Demo alert data reset to the deterministic baseline. Theme and dashboard layout were preserved.'
      : 'Alert data reset for this session. Browser storage was unavailable; theme and dashboard layout were not changed.'
    setFeedback(message)
    announce(message)
    setOpen(false)
  }

  const simulateDelivery = () => {
    onDelivery?.()
    const message = 'Synthetic notification delivery simulated locally. No address, endpoint, or credential was used.'
    setFeedback(message)
    announce(message)
  }

  return (
    <div>
      <div className={styles.actions}>
        <c2-button onClick={simulateDelivery}>Simulate selected delivery</c2-button>
        <c2-button ref={resetButtonRef} onClick={() => setOpen(true)}>
          Reset demo data
        </c2-button>
      </div>
      {feedback && <c2-toast className={styles.toast} variant="success" heading="Local demonstration" message={feedback} dismissible />}
      <c2-modal ref={modalRef} label="Reset demo alert data">
        <span slot="title">Reset demo alert data?</span>
        <p>This removes locally created and edited alert rules. It does not clear your theme or dashboard layout.</p>
        <c2-button slot="footer" onClick={() => setOpen(false)}>
          Cancel
        </c2-button>
        <c2-button slot="footer" onClick={confirmReset}>
          Reset alerts
        </c2-button>
      </c2-modal>
    </div>
  )
}
