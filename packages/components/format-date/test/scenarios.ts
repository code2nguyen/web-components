import '../src/format-date'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
const DATE = '2026-10-14T15:05:09Z'

const markup: Record<string, string> = {
  default: `<c2-format-date id="subject" locale="en-US" time-zone="UTC" date="${DATE}"></c2-format-date>`,
  styles: `
    <c2-format-date id="full" locale="en-US" time-zone="UTC" date-style="full" date="${DATE}"></c2-format-date>
    <c2-format-date id="short" locale="en-US" time-zone="UTC" date-style="short" time-style="short" date="${DATE}"></c2-format-date>
    <c2-format-date id="time" locale="en-US" time-zone="UTC" time-style="medium" date="${DATE}"></c2-format-date>
    <c2-format-date id="mixed" locale="en-US" time-zone="UTC" date-style="long" weekday="long" date="${DATE}"></c2-format-date>`,
  fields: `
    <c2-format-date id="month-year" locale="en-US" time-zone="UTC" month="long" year="numeric" date="${DATE}"></c2-format-date>
    <c2-format-date id="clock" locale="en-US" time-zone="UTC" hour="2-digit" minute="2-digit" hour-format="24" date="${DATE}"></c2-format-date>
    <c2-format-date id="twelve" locale="en-GB" time-zone="UTC" hour="numeric" minute="2-digit" hour-format="12" date="${DATE}"></c2-format-date>
    <c2-format-date id="zone" locale="en-US" time-zone="Asia/Ho_Chi_Minh" hour="numeric" minute="2-digit" time-zone-name="shortOffset" date="${DATE}"></c2-format-date>`,
  lang: `<p lang="fr">Publié le <c2-format-date id="subject" time-zone="UTC" date-style="long" date="${DATE}"></c2-format-date></p>`,
  timestamp: `<c2-format-date id="subject" locale="en-US" time-zone="UTC" date="${Date.parse(DATE)}"></c2-format-date>`,
  fallback: `
    <c2-format-date id="unset">No date</c2-format-date>
    <c2-format-date id="invalid" date="not a date">Unknown</c2-format-date>`,
  'bad-options': `<c2-format-date id="subject" locale="en-US" time-zone="Mars/Olympus" date-style="long" date="${DATE}"></c2-format-date>`,
}
main.innerHTML = markup[scenario] ?? markup.default

await Promise.all([...main.querySelectorAll('c2-format-date')].map((element) => element.updateComplete))
main.dataset.ready = 'true'
