// A plain-HTML consumer of the published packages: no framework, no bundler magic beyond Vite's dev server.
// `theme.css` is `tokens.css` + `base.css` — the design tokens (light, dark and a prefers-color-scheme
// fallback) plus the mapping of every component variable onto them.
import '@c2n/theme/theme.css'
import './style.css'

import '@c2n/card'
import '@c2n/label'
import '@c2n/list-item'
import { type TextField } from '@c2n/text-field'
import '@c2n/select'
import { type Checkbox } from '@c2n/checkbox'
import { type Switch } from '@c2n/switch'
import '@c2n/button'
import { toast } from '@c2n/toast'

const fullName = document.querySelector<TextField>('#full-name')!
const email = document.querySelector<TextField>('#email')!
const digest = document.querySelector<Switch>('#digest')!
const terms = document.querySelector<Checkbox>('#terms')!
const form = document.querySelector<HTMLFormElement>('#account-form')!

// Text fields, selects and checkboxes are form-associated custom elements, so FormData, reset, disabled fieldsets
// and native constraint validation work exactly where a plain-HTML consumer expects them.

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

  const data = new FormData(form)

  toast.show({
    variant: 'success',
    heading: 'Saved',
    message: `${data.get('fullName')} · ${data.get('country') || 'no country'} · weekly digest ${digest.checked ? 'on' : 'off'}`,
  })
})

document.querySelector('#reset')!.addEventListener('click', () => {
  clearErrors()
  form.reset()
  digest.checked = true
  toast.show({ message: 'Form reset.' })
})
