// A plain-HTML consumer of the published packages: no framework, no bundler magic beyond Vite's dev server.
// `theme.css` is `tokens.css` + `base.css` — the design tokens (light, dark and a prefers-color-scheme
// fallback) plus the mapping of every component variable onto them.
import '@c2n/theme/theme.css'
import './style.css'

import '@c2n/card'
import '@c2n/label'
import '@c2n/list-item'
import { type TextField } from '@c2n/text-field'
import { type Select } from '@c2n/select'
import { type Checkbox } from '@c2n/checkbox'
import { type Switch } from '@c2n/switch'
import '@c2n/button'
import { toast } from '@c2n/toast'

const fullName = document.querySelector<TextField>('#full-name')!
const email = document.querySelector<TextField>('#email')!
const country = document.querySelector<Select>('#country')!
const digest = document.querySelector<Switch>('#digest')!
const terms = document.querySelector<Checkbox>('#terms')!

// The c2 inputs are not form-associated elements (no `ElementInternals`), so a native <form> would not collect
// them: a plain-HTML consumer reads the properties directly, as below. `c2-label` is the exception — it reaches
// into the target's shadow root and clicks the inner input, so the consent label needs no wiring of its own.

const initial = {
  fullName: fullName.value,
  email: email.value,
  country: country.value,
  digest: digest.checked,
  terms: terms.checked,
}

const clearErrors = () => {
  for (const field of [fullName, email]) {
    field.error = false
    field.errorText = ''
  }
}

const fail = (field: TextField, message: string) => {
  field.error = true
  field.errorText = message
  field.focus()
  toast.show({ variant: 'error', heading: 'Check the form', message })
}

document.querySelector('#save')!.addEventListener('click', () => {
  clearErrors()

  if (!fullName.value.trim()) return fail(fullName, 'Enter your full name.')
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email.value)) return fail(email, 'Enter a valid email address.')
  if (!terms.checked) return toast.show({ variant: 'warning', message: 'Please accept the terms of service.' })

  toast.show({
    variant: 'success',
    heading: 'Saved',
    message: `${fullName.value} · ${country.value || 'no country'} · weekly digest ${digest.checked ? 'on' : 'off'}`,
  })
})

document.querySelector('#reset')!.addEventListener('click', () => {
  clearErrors()
  fullName.value = initial.fullName
  email.value = initial.email
  country.value = initial.country
  digest.checked = initial.digest
  terms.checked = initial.terms
  toast.show({ message: 'Form reset.' })
})
