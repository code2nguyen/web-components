// A plain-HTML consumer of the published packages: no framework, no bundler magic beyond Vite's dev server.
// `theme.css` is `tokens.css` + `base.css` — the design tokens (light, dark and a prefers-color-scheme
// fallback) plus the mapping of every component variable onto them.
import '@c2n/components/theme.css'
import './style.css'

import '@c2n/components/card'
import '@c2n/components/label'
import '@c2n/components/list-item'
import { type TextField } from '@c2n/components/text-field'
import { type Select } from '@c2n/components/select'
import { type MaskInput } from '@c2n/components/mask-input'
import { type Checkbox } from '@c2n/components/checkbox'
import { type Switch } from '@c2n/components/switch'
import '@c2n/components/button'
import { toast } from '@c2n/components/toast'

const fullName = document.querySelector<TextField>('#full-name')!
const email = document.querySelector<TextField>('#email')!
const digest = document.querySelector<Switch>('#digest')!
const terms = document.querySelector<Checkbox>('#terms')!
const form = document.querySelector<HTMLFormElement>('#account-form')!
const country = document.querySelector<Select>('#country')!
const postcode = document.querySelector<MaskInput>('#postcode')!

// Each country's postcode shape. The UK's varies in length in the middle (SW1A 1AA, M1 1AE), which one mask cannot
// say, so it stays free text.
const postcodeMasks: Record<string, { mask: string; placeholder: string }> = {
  US: { mask: '99999?-9999', placeholder: '94103' },
  GB: { mask: '', placeholder: 'SW1A 1AA' },
  FR: { mask: '99999', placeholder: '75008' },
  DE: { mask: '99999', placeholder: '10115' },
  VN: { mask: '999999', placeholder: '700000' },
}

const syncPostcode = () => {
  const shape = postcodeMasks[country.value[0] ?? ''] ?? { mask: '', placeholder: '' }
  postcode.mask = shape.mask
  postcode.placeholder = shape.placeholder
}
syncPostcode()
country.addEventListener('change', () => {
  postcode.value = ''
  syncPostcode()
})

// Text fields, selects and checkboxes are form-associated custom elements, so FormData, reset, disabled fieldsets
// and native constraint validation work exactly where a plain-HTML consumer expects them.

const clearErrors = () => {
  for (const field of [fullName, email, postcode]) {
    field.error = false
    field.errorText = ''
  }
}

const fail = (field: TextField | MaskInput, message: string) => {
  field.error = true
  field.errorText = message
  field.focus()
  toast.show({ variant: 'error', heading: 'Check the form', message })
}

document.querySelector('#save')!.addEventListener('click', () => {
  clearErrors()

  if (!fullName.value.trim()) return fail(fullName, 'Enter your full name.')
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email.value)) return fail(email, 'Enter a valid email address.')
  if (!postcode.checkValidity()) return fail(postcode, `Enter a postcode like ${postcode.placeholder}.`)
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
  syncPostcode()
  digest.checked = true
  toast.show({ message: 'Form reset.' })
})
