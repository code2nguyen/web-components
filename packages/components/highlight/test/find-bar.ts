import '../src/highlight'
import '../src/find-bar'
import { findMatches } from '../src/highlight'
import { addTranslations } from '@c2n/core/localize.js'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const bar = (attributes = '') => `<c2-find-bar for="results" ${attributes}></c2-find-bar>`
const results = `<ul id="results">
    <li><c2-highlight>Apple pie</c2-highlight></li>
    <li><c2-highlight>Pineapple crumble with apple sauce</c2-highlight></li>
    <li><c2-highlight>Cherry tart</c2-highlight></li>
  </ul>`

const markup: Record<string, string> = {
  default: `${bar()}${results}`,
  value: `${bar('value="apple"')}${results}`,
  replace: `${bar('value="apple" replace replacement="pear"')}${results}`,
  actions: `<c2-find-bar for="results" value="apple"><button slot="actions">Filter</button></c2-find-bar>${results}`,
  single: `<c2-find-bar for="one" value="the"></c2-find-bar><p><c2-highlight id="one">The fox and the dog and the cat.</c2-highlight></p>`,
  french: `<div lang="fr">${bar('value="apple"')}</div>${results}`,
}

main.innerHTML = `${markup[scenario] ?? markup.default}<output aria-label="Events"></output>`

addTranslations({ fr: { highlight: { find: 'Rechercher', count: '{0} sur {1}', noResults: 'Aucun résultat' } } })

const findBar = main.querySelector('c2-find-bar')!
const output = main.querySelector('output')!
const log: string[] = []
const record = (entry: string) => {
  log.push(entry)
  output.textContent = log.join(' ')
}
findBar.addEventListener('match-change', (event) => record(`match:${event.detail.index}/${event.detail.count}`))
findBar.addEventListener('close', () => record('close'))

// The application replaces in its own text: here, the text of each highlight.
findBar.addEventListener('replace', ({ detail }) => {
  record(`replace:${detail.all ? 'all' : detail.index}`)
  for (const highlight of detail.all ? detail.highlights : [detail.highlight!]) {
    const text = highlight.textContent ?? ''
    // Each highlight's own options, which the bar counted with.
    const { matchCase, wholeWord, ignoreAccents, words } = highlight
    const matches = findMatches(text, detail.query, { matchCase, wholeWord, ignoreAccents, words })
    const chosen = detail.all ? matches : [matches[detail.index]]
    let next = text
    for (const { start, end } of [...chosen].reverse()) next = next.slice(0, start) + detail.replacement + next.slice(end)
    highlight.textContent = next
  }
})

await customElements.whenDefined('c2-find-bar')
await findBar.updateComplete
await Promise.all(Array.from(main.querySelectorAll('c2-highlight'), (highlight) => highlight.updateComplete))
await new Promise((resolve) => requestAnimationFrame(resolve))
main.dataset.ready = 'true'
