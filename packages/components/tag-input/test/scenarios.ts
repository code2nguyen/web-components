import '../src/tag-input'

const EMAIL = '[^\\s@]+@[^\\s@]+\\.[^\\s@]+'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const field = (attributes: string) => `<c2-tag-input id="subject" aria-label="Recipients" placeholder="Add recipients" ${attributes}></c2-tag-input>`
const markup: Record<string, string> = {
  default: field(''),
  prefilled: field('value="ann@example.com;bob@example.com;cy@example.com"'),
  email: field(`delimiters=",; " pattern="${EMAIL}"`),
  reject: field(`reject-invalid pattern="${EMAIL}"`),
  pattern: field('split-pattern="\\s*\\|\\s*"'),
  parser: field(''),
  max: field('max="2"'),
  blur: `${field('add-on-blur')}<button type="button">After</button>`,
  veto: field(''),
  disabled: field('disabled value="ann@example.com"'),
  readonly: field('readonly value="ann@example.com"'),
  form: `<form>${field('name="to" required value="ann@example.com"')}<button type="reset">Reset</button></form>`,
  'remove-icon': `<c2-tag-input id="subject" aria-label="Recipients" value="ann@example.com;bob@example.com;cy@example.com"><svg slot="remove-icon" class="custom-remove" viewBox="0 0 24 24"><path d="M3 6h18"></path></svg></c2-tag-input>`,
  'duplicate-icons': `<c2-tag-input id="subject" aria-label="Labels" allow-duplicates value="a;a"><svg slot="remove-icon" class="custom-remove" viewBox="0 0 24 24"><defs><linearGradient id="g"></linearGradient></defs><path fill="url(#g)" d="M3 6h18"></path></svg></c2-tag-input>`,
  sprite: `<svg hidden><symbol id="icon-x" viewBox="0 0 24 24"><path class="sprite-path" d="M6 6l12 12"></path></symbol></svg><c2-tag-input id="subject" aria-label="Labels" value="a;b"><svg slot="remove-icon" class="custom-remove" viewBox="0 0 24 24"><use href="#icon-x"></use></svg></c2-tag-input>`,
}
main.innerHTML = `${markup[scenario] ?? markup.default}<output aria-label="Changes">0</output><output aria-label="Value"></output>`

const subject = document.querySelector('c2-tag-input')!
const [changes, value] = document.querySelectorAll('output')
let count = 0
subject.addEventListener('change', () => {
  changes.textContent = String(++count)
  value.textContent = subject.value.join('|')
})

// Pulls the address out of `Name <address>` and lowercases it.
if (scenario === 'parser') subject.parseTag = (token) => (/<([^>]+)>/.exec(token)?.[1] ?? token).toLowerCase()
if (scenario === 'veto') subject.addEventListener('tag-add', (event) => event.detail.value === 'blocked' && event.preventDefault())

await subject.updateComplete
main.dataset.ready = 'true'
