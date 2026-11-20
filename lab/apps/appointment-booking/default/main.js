// appointment-booking, default direction: built from lab/specs/scenarios/appointment-booking.md with c2n components only.
// Build report: lab/reports/appointment-booking/default.md.
import '@c2n/components/theme.css'
import './style.css'

import '@c2n/components/button'
import '@c2n/components/card'
import '@c2n/components/date-strip'
import '@c2n/components/description-list'
import '@c2n/components/form'
import '@c2n/components/form-field'
import '@c2n/components/format-date'
import '@c2n/components/format-number'
import '@c2n/components/phone-input'
import '@c2n/components/radio'
import '@c2n/components/text-field'
import '@c2n/components/textarea'
import '@c2n/components/time-slot-picker'

import { CLOSED, CURRENCY, SERVICES, book, freeSlots } from './data.js'

const $ = (id) => document.getElementById(id)
const el = {
  booking: $('booking'),
  service: $('service'),
  day: $('day'),
  time: $('time'),
  timeField: $('time-field'),
  timeMessage: $('time-message'),
  phone: $('phone'),
  confirm: $('confirm'),
  confirmation: $('confirmation'),
  reference: $('reference'),
  summaryService: $('summary-service'),
  summaryWhen: $('summary-when'),
  summaryPrice: $('summary-price'),
}

// The services, each a card-style radio with its duration and price.
for (const service of SERVICES) {
  const radio = document.createElement('c2-radio')
  radio.value = service.id
  radio.className = 'service'
  const name = document.createElement('span')
  name.className = 'service__name'
  name.textContent = service.name
  const description = document.createElement('span')
  description.slot = 'description'
  const price = document.createElement('c2-format-number')
  price.setAttribute('type', 'currency')
  price.setAttribute('currency', CURRENCY)
  price.value = service.price
  description.append(`${service.minutes} min · `, price)
  radio.append(name, description)
  el.service.append(radio)
}

// Closed days cannot be picked. A disabled day has no way to say why, so each closed day also gets a marker whose label
// a screen reader hears with the day; the dot itself is hidden in style.css (c2n-workaround: no reason for disabled-dates).
el.day.disabledDates = Object.keys(CLOSED)
el.day.markers = Object.entries(CLOSED).map(([date, label]) => ({ date, label }))

const currentService = () => SERVICES.find((service) => service.id === el.service.value) ?? SERVICES[0]

function dayLabel(day) {
  return new Intl.DateTimeFormat(document.documentElement.lang || undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  )
}

/** Shows the free starts of the chosen day for the chosen service, keeping the picked time when it is still free. */
function updateTimes() {
  const day = el.day.value
  const service = currentService()
  if (!day) {
    el.time.slots = []
    el.timeField.hidden = true
    el.timeMessage.textContent = 'Pick a day to see the free times.'
    return
  }
  const slots = freeSlots(day, service)
  el.time.date = day
  el.time.slots = slots
  if (!slots.some((slot) => slot.start === el.time.value)) el.time.value = ''
  el.timeField.hidden = slots.length === 0
  el.timeMessage.textContent = slots.length === 0 ? `${dayLabel(day)} is full for ${service.name.toLowerCase()}: pick another day.` : ''
}

function updateSummary() {
  const service = currentService()
  el.summaryService.textContent = service.name
  el.summaryPrice.value = service.price
  el.summaryWhen.date = el.time.value || undefined
}

el.service.addEventListener('change', () => {
  updateTimes()
  updateSummary()
})
el.day.addEventListener('change', () => {
  updateTimes()
  updateSummary()
})
el.time.addEventListener('change', updateSummary)

el.booking.addEventListener('valid-submit', (event) => {
  const { values, waitUntil } = event.detail
  const request = { service: values.service, start: values.time, name: values.name, phone: values.phone, note: values.note }
  el.confirm.running = true
  const saving = book(request)
  waitUntil(saving)
  saving
    .then(({ reference }) => {
      el.reference.textContent = reference
      el.confirmation.hidden = false
      el.confirm.hidden = true
      el.booking.querySelectorAll('c2-radio-group, c2-date-strip, c2-time-slot-picker, c2-text-field, c2-phone-input, c2-textarea').forEach((control) => {
        control.disabled = true
      })
      el.confirmation.focus()
    })
    .catch(() => {
      /* c2-form shows the refused number on the phone field */
    })
    .finally(() => {
      el.confirm.running = false
    })
})

updateTimes()
updateSummary()
