// pricing-page, default direction: built from lab/specs/scenarios/pricing-page.md with c2n components only.
// Build report: lab/reports/pricing-page/default.md.
import '@c2n/components/theme.css'
import './style.css'

import '@c2n/components/badge'
import '@c2n/components/button'
import '@c2n/components/button-group'
import '@c2n/components/card'
import '@c2n/components/details'
import '@c2n/components/format-number'
import '@c2n/components/table'
import '@c2n/feather-icons/icons/check.js'
import '@c2n/feather-icons/icons/minus.js'

import { COMPARISON, PLANS } from './data.js'

const plansEl = document.getElementById('plans')
const billing = document.getElementById('billing')

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  node.append(...children)
  return node
}

// R2: the reader's locale. c2-format-number follows the nearest `lang` first, which is the page's (en), so the
// browser's language has to be passed explicitly.
const locale = navigator.language
function money(value) {
  return el('c2-format-number', { type: 'currency', currency: 'USD', 'maximum-fraction-digits': '0', locale, value: String(value) })
}

// R4: on a phone Team comes first, in DOM order too, so a screen reader reads the cards in the order they are seen.
const phone = matchMedia('(max-width: 720px)')
const ordered = () => (phone.matches ? [...PLANS].sort((a, b) => Number(Boolean(b.popular)) - Number(Boolean(a.popular))) : PLANS)

function renderPlans() {
  const yearly = billing.value === 'yearly'
  plansEl.replaceChildren(
    ...ordered().map((plan) => {
      const header = el('div', { slot: 'header', class: 'plan__head' }, el('h2', { id: `plan-${plan.id}` }, plan.name))
      if (plan.popular) header.append(el('c2-badge', { tone: 'primary' }, 'Most popular'))

      const note = yearly ? el('span', {}, 'per user / month, billed ', money(plan.billedYearly), ' yearly') : el('span', {}, 'per user / month')
      const price = el('p', { class: 'plan__price', 'data-plan': plan.id }, money(yearly ? plan.yearly : plan.monthly))
      const features = el('ul', { class: 'plan__features' }, ...plan.features.map((f) => el('li', {}, el('c2-feather-check', { class: 'plan__check' }), f)))
      const cta = el('c2-button', { slot: 'footer', class: plan.popular ? 'plan__cta plan__cta--primary' : 'plan__cta' }, plan.cta)

      return el(
        'c2-card',
        { class: plan.popular ? 'plan plan--popular' : 'plan', 'data-plan': plan.id, role: 'group', 'aria-labelledby': `plan-${plan.id}` },
        header,
        el('p', { class: 'plan__pitch' }, plan.pitch),
        price,
        el('p', { class: 'plan__note', 'data-plan-note': plan.id }, note),
        features,
        cta,
      )
    }),
  )
}

billing.addEventListener('change', renderPlans)
phone.addEventListener('change', renderPlans)
renderPlans()

// Comparison: true / false read as "Included" / "Not included"; the icon is decorative.
const table = document.getElementById('comparison')
const mark = (value) => {
  if (typeof value !== 'boolean') return value
  const span = el('span', { part: 'mark' }, el(value ? 'c2-feather-check' : 'c2-feather-minus'))
  span.append(el('span', { part: 'sr-only' }, value ? 'Included' : 'Not included'))
  return span
}
for (const column of table.querySelectorAll('c2-table-column:not([field="feature"])')) {
  column.renderCell = ({ value }) => mark(value)
}
table.rows = COMPARISON
