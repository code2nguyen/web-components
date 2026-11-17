import '../src/shortcut'
import '../src/shortcut-sheet'
import './translations'
import type { ShortcutBinding } from '../src/shortcut'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const appBindings: ShortcutBinding[] = [
  { keys: 'mod+k, mod+/', action: 'search', description: 'Open search' },
  { keys: 'alt+g alt+d', action: 'dashboard', description: 'Go to dashboard', group: 'Navigation' },
  { keys: 'alt+g alt+i', action: 'inbox', description: 'Go to inbox', group: 'Navigation' },
  { keys: 'mod+s', action: 'save' },
  { keys: 'alt+x', action: 'archive', description: 'Archive', group: 'Editing', disabled: true },
]
const editorBindings: ShortcutBinding[] = [{ keys: 'mod+b', action: 'bold', description: 'Bold', group: 'Editing' }]

const sheet = (attributes: string, content = '') => `<c2-shortcut-sheet id="sheet" ${attributes}>${content}</c2-shortcut-sheet>`

main.innerHTML = `
  <c2-shortcut id="app"></c2-shortcut>
  <c2-shortcut id="editor"></c2-shortcut>
  <button id="open" type="button" aria-haspopup="dialog" commandfor="sheet" command="--show">Show shortcuts</button>
  <button id="toggle" type="button" aria-haspopup="dialog" commandfor="sheet" command="--toggle">Toggle shortcuts</button>
  ${
    {
      default: sheet(`keys="alt+/" shortcuts='[{"keys":"j","description":"Next item","group":"Navigation"}]'`),
      inline: sheet('inline for="editor"'),
      empty: sheet('inline for="missing"'),
      french: `<div lang="fr">${sheet('inline for="app"')}</div>`,
      footer: sheet('inline for="editor"', '<a slot="footer" href="#settings">Customize shortcuts</a>'),
      'render-item': sheet('inline for="editor"'),
      'no-search': sheet('inline no-search for="editor"'),
      'no-bindings': sheet(`inline no-bindings shortcuts='[{"keys":"j","description":"Next","group":"Lists"},{"keys":"shift+?","description":"Help"}]'`),
      'bare-keys': sheet(`keys="?" no-bindings shortcuts='[{"keys":"j","description":"Next"}]'`),
    }[scenario] ?? ''
  }
  <output id="log"></output>
`

const app = document.querySelector<HTMLElementTagNameMap['c2-shortcut']>('#app')!
app.bindings = appBindings
document.querySelector<HTMLElementTagNameMap['c2-shortcut']>('#editor')!.bindings = editorBindings

const subject = document.querySelector('c2-shortcut-sheet')!
const log = document.querySelector('#log')!
subject.addEventListener('open', () => (log.textContent += 'open '))
subject.addEventListener('close', () => (log.textContent += 'close '))
if (scenario === 'render-item') subject.renderItem = ({ entry, index }) => `${index + 1}. ${entry.description}: ${entry.labels.join(' / ')}`

await subject.updateComplete
main.dataset.ready = 'true'
