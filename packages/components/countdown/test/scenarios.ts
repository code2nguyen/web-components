import '../src/countdown'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
// Offsets from the (fake) clock in the spec; a positive offset is in the future.
const at = (offset: number) => new Date(Date.now() + offset).toISOString()
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const markup: Record<string, string> = {
  default: `<c2-countdown id="subject" locale="en-US" date="${at(2 * DAY + 14 * HOUR + 5 * MINUTE + 31 * SECOND)}"></c2-countdown>`,
  units: `
    <c2-countdown id="subject" locale="en-US" units="hours minutes" date="${at(2 * DAY + 3 * HOUR + 30 * SECOND)}"></c2-countdown>
    <c2-countdown id="trim" locale="en-US" trim display="inline" format="narrow" date="${at(3 * HOUR + 12 * MINUTE + 5 * SECOND)}"></c2-countdown>`,
  clock: `<c2-countdown id="subject" locale="en-US" display="clock" units="minutes seconds" duration="65"></c2-countdown>`,
  inline: `<c2-countdown id="subject" locale="en-US" display="inline" date="${at(DAY + 2 * HOUR + MINUTE + 4 * SECOND)}"></c2-countdown>`,
  warning: `<c2-countdown id="subject" locale="en-US" display="clock" units="minutes seconds" warn-at="10" duration="12"></c2-countdown>`,
  paused: `
    <c2-countdown id="subject" locale="en-US" display="clock" units="minutes seconds" duration="90" paused></c2-countdown>
    <button id="start" type="button">Start</button>
    <button id="pause" type="button">Pause</button>
    <button id="reset" type="button">Reset</button>`,
  ended: `
    <c2-countdown id="subject" locale="en-US" display="clock" units="minutes seconds" date="${at(3 * SECOND)}"><strong slot="ended">We are live!</strong></c2-countdown>
    <c2-countdown id="past" locale="en-US" display="clock" units="minutes seconds" date="${at(-MINUTE)}"></c2-countdown>`,
  lang: `<p lang="fr"><c2-countdown id="subject" display="inline" units="days hours" date="${at(2 * DAY + 3 * HOUR)}"></c2-countdown></p>`,
}
main.innerHTML = markup[scenario] ?? markup.default

const subject = document.querySelector('c2-countdown')!
const events: { type: string; remaining?: number }[] = []
subject.addEventListener('tick', (event) => events.push({ type: 'tick', remaining: event.detail.remaining }))
subject.addEventListener('complete', () => events.push({ type: 'complete' }))
Object.assign(window, { countdownEvents: events })
document.querySelector('#start')?.addEventListener('click', () => subject.start())
document.querySelector('#pause')?.addEventListener('click', () => subject.pause())
document.querySelector('#reset')?.addEventListener('click', () => subject.reset())

await Promise.all([...main.querySelectorAll('c2-countdown')].map((element) => element.updateComplete))
main.dataset.ready = 'true'
