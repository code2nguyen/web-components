// A plain-HTML consumer of the published packages: no framework, no bundler magic beyond Vite's dev server.
// `theme.css` is `tokens.css` + `base.css` — the design tokens (light, dark and a prefers-color-scheme
// fallback) plus the mapping of every component variable onto them.
import '@c2n/components/theme.css'
import './style.css'

import '@c2n/components/card'
import '@c2n/components/form-field'
import '@c2n/components/list-item'
import '@c2n/components/text-field'
import '@c2n/components/checkbox'
import '@c2n/components/switch'
import '@c2n/components/button'
import { type Form } from '@c2n/components/form'
import { type Select } from '@c2n/components/select'
import { type MaskInput } from '@c2n/components/mask-input'
import { toast } from '@c2n/components/toast'

const account = document.querySelector<Form>('#account')!
const country = document.querySelector<Select>('#country')!
const postcode = document.querySelector<MaskInput>('#postcode')!
const unsaved = document.querySelector<HTMLElement>('#unsaved')!

// Each country's postcode shape. The UK's varies in length in the middle (SW1A 1AA, M1 1AE): its optional groups
// are filled or skipped by what is typed.
const postcodeMasks: Record<string, { mask: string; placeholder: string }> = {
  US: { mask: '99999?-9999', placeholder: '94103' },
  GB: { mask: 'A[A]9[X] 9AA', placeholder: 'SW1A 1AA' },
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
account.form?.addEventListener('reset', () => setTimeout(syncPostcode))

// The form validates every field on submit and only fires `valid-submit` once they all pass. Validation messages,
// the error summary and focus are its job; the app only saves. A rejected promise with `{ name: message }` shows
// those errors on their fields, the way a server response would.
const save = (values: Record<string, unknown>) =>
  new Promise<void>((resolve, reject) =>
    setTimeout(() => (String(values.email).endsWith('@example.org') ? reject({ email: 'That email is already registered.' }) : resolve()), 700),
  )

account.addEventListener('valid-submit', (event) => {
  const { values } = event.detail
  const saving = save(values)
  event.detail.waitUntil(saving)
  saving.then(
    () =>
      toast.show({
        variant: 'success',
        heading: 'Saved',
        message: `${values.fullName} · ${values.country || 'no country'} · weekly digest ${values.digest ? 'on' : 'off'}`,
      }),
    () => {},
  )
})

account.addEventListener('dirty-change', (event) => {
  unsaved.hidden = !event.detail.dirty
})
