import '../src/code-editor'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const SAMPLE = `const greeting = 'hello'
// a comment
function greet(name) {
  return greeting + name
}`

const markup: Record<string, string> = {
  default: `<c2-code-editor id="subject" language="javascript" label="Source"></c2-code-editor>`,
  'line-numbers': `<c2-code-editor id="subject" language="javascript" line-numbers label="Source"></c2-code-editor>`,
  readonly: `<c2-code-editor id="subject" language="javascript" readonly label="Source"></c2-code-editor>`,
  disabled: `<c2-code-editor id="subject" language="javascript" disabled label="Source"></c2-code-editor>`,
  placeholder: `<c2-code-editor id="subject" language="javascript" placeholder="Paste your code" label="Source"></c2-code-editor>`,
  error: `<c2-code-editor id="subject" language="css" error error-text="Unexpected token." label="Source"></c2-code-editor>`,
  help: `<c2-code-editor id="subject" language="javascript" help="Tab indents." label="Source"></c2-code-editor>`,
  themed: `<c2-code-editor id="subject" class="themed" language="javascript" line-numbers label="Source"></c2-code-editor>`,
  json: `<c2-code-editor id="subject" language="json" label="Source"></c2-code-editor>`,
  'no-language': `<c2-code-editor id="subject" label="Source"></c2-code-editor>`,
  // Same element; the spec aborts the engine request so the textarea fallback is exercised.
  fallback: `<c2-code-editor id="subject" language="javascript" label="Source"></c2-code-editor>`,
  form: `<form id="host">
    <c2-code-editor id="subject" name="snippet" language="javascript" required label="Source"></c2-code-editor>
    <button type="submit">Submit</button>
    <button type="reset">Reset</button>
  </form>`,
  'slot-label': `<c2-code-editor id="subject" language="javascript"><span slot="label">Slotted label</span><span slot="supporting-text">Slotted help</span></c2-code-editor>`,
}

main.innerHTML = `
  <button id="before">Before</button>
  ${markup[scenario] ?? markup.default}
  <button id="after">After</button>
  <output aria-label="Events">0 0</output>
  <output id="submitted" aria-label="Submitted">—</output>
`

const subject = document.querySelector('c2-code-editor')!
const output = document.querySelector('output')!
// Its own output: CodeMirror reports the blur asynchronously on Firefox and WebKit, so the `change` that follows a
// submit click can land after the submit handler and would overwrite a shared one.
const submitted = document.querySelector('#submitted')!

// `form` starts from a default value so reset has something to restore.
if (scenario === 'form') subject.setAttribute('value', 'const initial = 1')
else if (scenario !== 'placeholder' && scenario !== 'no-language') subject.value = SAMPLE
if (scenario === 'json') subject.value = '{ "name": "c2n", "count": 2 }'

let inputs = 0
let changes = 0
const report = () => (output.textContent = `${inputs} ${changes}`)
subject.addEventListener('input', () => {
  inputs += 1
  report()
})
subject.addEventListener('change', () => {
  changes += 1
  report()
})

const form = document.querySelector('form')
form?.addEventListener('submit', (event) => {
  event.preventDefault()
  submitted.textContent = String(new FormData(form).get('snippet'))
})

await subject.updateComplete
// Every scenario waits for the engine, so a spec never races the dynamic import.
const engine = await subject.ready
main.dataset.engine = engine
main.dataset.ready = 'true'
