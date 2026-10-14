import '../src/highlight'
import { findMatches } from '../src/highlight'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const TEXT = 'Apple pie, apple tart and pineapple crumble are on the café menu.'
const attributes: Record<string, string> = {
  default: 'query="apple"',
  'match-case': 'query="apple" match-case',
  'whole-word': 'query="apple" whole-word',
  words: 'query="pie  crumble" words',
  accents: 'query="cafe" ignore-accents',
  empty: 'query=""',
  active: 'query="apple" active-index="1"',
}

main.innerHTML = `<label>Search <input id="search" value="${scenario === 'search' ? '' : 'apple'}" /></label>
  <button id="next">Next match</button>
  <button id="rewrite">Change text</button>
  <p><c2-highlight id="subject" ${attributes[scenario] ?? ''}>${TEXT}</c2-highlight></p>
  <output aria-label="Events"></output>`

const subject = document.querySelector('c2-highlight')!
const input = document.querySelector<HTMLInputElement>('#search')!
const output = document.querySelector('output')!
const log: string[] = []
subject.addEventListener('match-change', (event) => {
  log.push(`matches:${event.detail}`)
  output.textContent = log.join(' ')
})

// The application owns the query and the current match, as a search box or find bar would.
input.addEventListener('input', () => {
  subject.query = input.value
})
document.querySelector('#next')!.addEventListener('click', () => {
  subject.activeIndex = subject.matchCount ? (subject.activeIndex + 1) % subject.matchCount : -1
})
document.querySelector('#rewrite')!.addEventListener('click', () => {
  subject.textContent = 'An apple a day.'
})

if (scenario === 'array') subject.query = ['tart', 'menu']

// Exposes the matcher to the spec for the folding cases the element's markup cannot show compactly.
;(window as unknown as { findMatches: typeof findMatches }).findMatches = findMatches

await subject.updateComplete
main.dataset.ready = 'true'
