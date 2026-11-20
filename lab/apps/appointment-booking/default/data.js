// The sample data of lab/specs/scenarios/appointment-booking.md, exactly as written there.

/** "Now" is fixed by the spec: Monday 2 March 2026, 10:15, Europe/Paris (UTC+1 until 29 March). */
export const NOW = { date: '2026-03-02', minutes: 10 * 60 + 15 }
export const TIME_ZONE = 'Europe/Paris'
export const OFFSET = '+01:00'
export const CURRENCY = 'USD'

export const SERVICES = [
  { id: 'haircut', name: 'Haircut', minutes: 30, price: 35 },
  { id: 'cut-colour', name: 'Cut & colour', minutes: 90, price: 120 },
  { id: 'beard', name: 'Beard trim', minutes: 30, price: 20 },
]

export const FIRST_DAY = '2026-03-02'
export const LAST_DAY = '2026-03-15'
/** Sundays, and Friday 13 March (staff training). */
export const CLOSED = { '2026-03-08': 'Closed on Sundays', '2026-03-13': 'Closed for staff training', '2026-03-15': 'Closed on Sundays' }

/** Opening hours by weekday (0 = Sunday), in minutes from midnight. */
const HOURS = { 1: [540, 1050], 2: [540, 1050], 3: [540, 1050], 4: [540, 1050], 5: [540, 1050], 6: [540, 780] }

const SATURDAY_FREE = '12:30'
const BOOKED = new Set(['2026-03-03 09:00', '2026-03-03 10:00', '2026-03-03 14:30'])

const pad = (n) => String(n).padStart(2, '0')
const hhmm = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`

function isBooked(day, minutes) {
  const time = hhmm(minutes)
  if (day === '2026-03-07') return time !== SATURDAY_FREE
  return BOOKED.has(`${day} ${time}`)
}

const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay()

/** Every day from FIRST_DAY to LAST_DAY. */
export function bookableDays() {
  const days = []
  for (let d = new Date(`${FIRST_DAY}T12:00:00Z`); d.toISOString().slice(0, 10) <= LAST_DAY; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

/** The free starts of `day` for `service`, as time-slot-picker slots (ISO start and end with the shop's offset). */
export function freeSlots(day, service) {
  const hours = HOURS[weekday(day)]
  if (!hours || CLOSED[day]) return []
  const [open, close] = hours
  const earliest = day === NOW.date ? NOW.minutes + 60 : open
  const slots = []
  for (let start = open; start + service.minutes <= close; start += 30) {
    if (start < earliest) continue
    let free = true
    for (let t = start; t < start + service.minutes; t += 30) if (isBooked(day, t)) free = false
    if (free) slots.push({ start: `${day}T${hhmm(start)}:00${OFFSET}`, end: `${day}T${hhmm(start + service.minutes)}:00${OFFSET}` })
  }
  return slots
}

/** The simulated server: answers after 500ms; a number ending in 0000 cannot receive text messages. */
export function book(request) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (request.phone.endsWith('0000')) reject({ phone: 'This number cannot receive text messages' })
      else resolve({ reference: 'BK-3021' })
    }, 500)
  })
}
