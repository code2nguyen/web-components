type Billing = 'monthly' | 'yearly'

const notes: Record<Billing, string> = {
  monthly: 'Billed monthly. Cancel at any time.',
  yearly: 'Billed yearly: prices shown per month. Cancel at any time.',
}

/** Switches every plan's price between its monthly and yearly figure when the billing toggle changes. */
export function setUpPricing(): void {
  const toggle = document.querySelector('c2-button-group.billing')
  if (!toggle) return
  toggle.addEventListener('change', (event) => {
    const value = (event as CustomEvent<{ value: string }>).detail.value
    const billing: Billing = value === 'yearly' ? 'yearly' : 'monthly'
    for (const amount of document.querySelectorAll<HTMLElement>('.plan__amount')) {
      amount.textContent = amount.dataset[billing] ?? amount.textContent
    }
    const note = document.querySelector<HTMLElement>('[data-billing-note]')
    if (note) note.textContent = notes[billing]
  })
}
