import { messageLocales, type MessageCatalog, type Messages } from '@c2n/core/localize.js'

/** One message of a component, as an app translates it: its key, its English text with `{0}`… for its arguments. */
export interface ComponentMessage {
  key: string
  /** The English text, each argument shown as `{0}`, `{1}`… as a translation writes it. */
  text: string
  /** The arguments' names, in order: `{0}` is the first. Empty for plain text. */
  args: string[]
}

export interface ComponentMessages {
  /** The name translations are registered under: `addTranslations({ fr: { [name]: … } })`. */
  name: string
  messages: ComponentMessage[]
  /** Languages the component carries itself besides English (the planners); others come from the app. */
  builtIn: string[]
}

// Every component that has interface text keeps it in `src/messages.ts`, exporting its catalog.
const modules = import.meta.glob<Record<string, unknown>>('../../../../packages/components/*/src/messages.ts', { eager: true })

const isCatalog = (value: unknown): value is MessageCatalog<Messages> =>
  !!value && typeof value === 'object' && typeof (value as MessageCatalog<Messages>).name === 'string' && 'en' in value

/** The names of a function's parameters, from its source: `(closed, total) => …` gives `closed`, `total`. */
function parameterNames(fn: (...args: never[]) => string): string[] {
  const source = fn.toString()
  const list = source.startsWith('(') ? source.slice(1, source.indexOf(')')) : source.slice(0, source.indexOf('=>'))
  return list
    .split(',')
    .map((name) =>
      name
        .trim()
        .replace(/[:=].*$/, '')
        .trim(),
    )
    .filter(Boolean)
}

function describe(catalog: MessageCatalog<Messages>): ComponentMessages {
  const messages = Object.entries(catalog.en).map(([key, value]) => {
    if (typeof value === 'string') return { key, text: value, args: [] }
    const args = parameterNames(value)
    let text: string
    try {
      // Called with its placeholders, an English message reads as the template a translation writes.
      text = (value as (...values: string[]) => string)(...args.map((_, index) => `{${index}}`))
    } catch {
      text = ''
    }
    return { key, text, args }
  })
  return { name: catalog.name, messages, builtIn: messageLocales(catalog).filter((locale) => locale !== 'en') }
}

const byName = new Map<string, ComponentMessages>()
for (const module of Object.values(modules)) {
  for (const value of Object.values(module)) {
    if (isCatalog(value)) byName.set(value.name, describe(value))
  }
}

/**
 * The interface text of a component tag: its own catalog (`c2-todo-list` → `todo-list`), or the catalog of the element
 * it belongs to (`c2-checkbox-group` → `checkbox`, `c2-toast-region` → `toast`) unless `orParent` is false.
 */
export function componentMessages(tag: string, orParent = true): ComponentMessages | undefined {
  const name = tag.replace(/^c2-/, '')
  if (byName.has(name)) return byName.get(name)
  if (!orParent) return undefined
  const parent = [...byName.keys()].filter((candidate) => name.startsWith(`${candidate}-`)).sort((a, b) => b.length - a.length)[0]
  return parent ? byName.get(parent) : undefined
}
