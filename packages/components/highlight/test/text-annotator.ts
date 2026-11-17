import '../src/text-annotator'
import type { TextAnnotation, TextAnnotatorLabel } from '../src/text-annotator'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const TEXT = 'Ada Lovelace worked with Charles Babbage in London on the Analytical Engine.'
const at = (word: string, label: string): TextAnnotation => ({ start: TEXT.indexOf(word), end: TEXT.indexOf(word) + word.length, label })

const labels: TextAnnotatorLabel[] = [
  { value: 'person', label: 'Person', key: 'p' },
  { value: 'place', label: 'Place', key: 'l' },
  { value: 'thing', label: 'Thing', key: 't' },
]
const json = (value: unknown) => JSON.stringify(value).replaceAll("'", '&#39;')
const annotator = (attributes = '', ranges: TextAnnotation[] = [at('Ada Lovelace', 'person')]) =>
  `<c2-text-annotator labels='${json(labels)}' ranges='${json(ranges)}' ${attributes}>${TEXT}</c2-text-annotator>`

const markup: Record<string, string> = {
  default: `<p id="text">${annotator()}</p>`,
  overlap: `<p>${annotator('', [at('Analytical Engine', 'thing'), at('Engine', 'person'), at('Babbage', 'person')])}</p>`,
  readonly: `<p>${annotator('readonly', [at('Ada Lovelace', 'person'), at('London', 'place')])}</p>`,
  invalid: `<p>${annotator('', [at('London', 'place'), { start: 70, end: 200, label: 'place' }, { start: 5, end: 5, label: 'person' }, { start: -1, end: 2, label: 'thing' }])}</p>`,
  unknown: `<p>${annotator('', [at('London', 'city')])}</p>`,
  query: `<p>${annotator('query="the"', [at('Analytical Engine', 'thing')])}</p>`,
  two: `<p id="first">${annotator()}</p><p id="second">${annotator('', [])}</p>`,
  field: `<label>Note <input id="note" /></label><p>${annotator()}</p>`,
  legend: `<div role="group" aria-label="Labels">${labels.map((label) => `<button data-label="${label.value}">${label.label}</button>`).join('')}</div><p>${annotator('', [])}</p>`,
  french: `<p lang="fr"><c2-text-annotator labels='${json([
    { value: 'person', label: 'Personne', key: 'p' },
    { value: 'place', label: 'Lieu', key: 'l' },
  ])}' ranges='${json([{ start: 0, end: 12, label: 'person' }])}'>Ada Lovelace a travaillé à Londres.</c2-text-annotator></p>`,
}

// Test markup, built from constants above.
main.innerHTML = `${markup[scenario] ?? markup.default}<output aria-label="Events"></output>` // modern-web-ignore: no-html-sink test scenario markup

const output = main.querySelector('output')!
const log: string[] = []
for (const element of main.querySelectorAll('c2-text-annotator')) {
  element.addEventListener('ranges-change', ({ detail }) => {
    log.push(detail.map((range) => `${TEXT.slice(range.start, range.end) || `${range.start}-${range.end}`}:${range.label}`).join('|'))
    output.textContent = log.join(' / ')
  })
}

// The legend's buttons label the selection, as an application would wire them. Pressing one must not clear it.
const legend = main.querySelector('[role="group"]')
legend?.addEventListener('mousedown', (event) => event.preventDefault())
legend?.addEventListener('click', (event) => {
  const value = (event.target as HTMLElement).closest<HTMLElement>('[data-label]')?.dataset.label
  if (value) void main.querySelector('c2-text-annotator')!.annotate(value)
})

await Promise.all(Array.from(main.querySelectorAll('c2-text-annotator'), (element) => element.updateComplete))
main.dataset.ready = 'true'
