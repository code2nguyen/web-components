import '../src/relative-time'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
// Offsets from the (fake) clock in the spec; a positive offset is in the future.
const at = (offset: number) => new Date(Date.now() + offset).toISOString()
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const markup: Record<string, string> = {
  default: `<c2-relative-time id="subject" locale="en-US" date="${at(-5 * SECOND)}"></c2-relative-time>`,
  future: `<c2-relative-time id="subject" locale="en-US" date="${at(90 * SECOND)}"></c2-relative-time>`,
  numeric: `
    <c2-relative-time id="auto" locale="en-US" date="${at(-DAY)}"></c2-relative-time>
    <c2-relative-time id="always" locale="en-US" numeric="always" date="${at(-DAY)}"></c2-relative-time>
    <c2-relative-time id="short" locale="en-US" format="short" date="${at(-3 * HOUR)}"></c2-relative-time>
    <c2-relative-time id="weeks" locale="en-US" date="${at(-15 * DAY)}"></c2-relative-time>
    <c2-relative-time id="months" locale="en-US" date="${at(-62 * DAY)}"></c2-relative-time>
    <c2-relative-time id="years" locale="en-US" date="${at(-800 * DAY)}"></c2-relative-time>`,
  lang: `<p lang="fr">Modifié <c2-relative-time id="subject" date="${at(-3 * MINUTE)}"></c2-relative-time></p>`,
  fallback: `
    <c2-relative-time id="unset">Never</c2-relative-time>
    <c2-relative-time id="invalid" date="not a date">Unknown</c2-relative-time>`,
  'no-update': `<c2-relative-time id="subject" locale="en-US" no-update date="${at(-5 * SECOND)}"></c2-relative-time>`,
  timestamp: `<c2-relative-time id="subject" locale="en-US" date="${Date.now() - 2 * HOUR}"></c2-relative-time>`,
}
main.innerHTML = markup[scenario] ?? markup.default

await Promise.all([...main.querySelectorAll('c2-relative-time')].map((element) => element.updateComplete))
main.dataset.ready = 'true'
