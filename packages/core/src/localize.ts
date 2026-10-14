import type { ReactiveController, ReactiveControllerHost } from '@lit/reactive-element'

/**
 * A component's interface text, one entry per message: a string, or a function of the values it carries for text with
 * numbers, names or plurals (`(done: number, total: number) => \`${done} of ${total} done\``).
 */
export type Messages = { [key: string]: string | ((...args: never[]) => string) }

/** The arguments a message takes: none for a string, the function's own for a function. */
export type MessageArgs<V> = V extends (...args: infer A) => string ? A : []

/**
 * A translated message, in a form JSON can hold:
 * - a string, where `{0}`, `{1}`… stand for the message's arguments: `"{0} sur {1} terminées"`;
 * - an object picked by the first argument: for a number its plural category in the language (`zero`, `one`, `two`,
 *   `few`, `many`, `other`) or the exact number (`"0"`), for a string that key; `other` when nothing matches.
 *   `{ "one": "{0} urgente", "other": "{0} urgentes" }`, `{ "work": "Travail", "other": "{0}" }`;
 * - or, from script, a function of the arguments, as the English messages are.
 */
export type TranslatedMessage = string | { readonly [choice: string]: string } | ((...args: never[]) => string)

/** A component's messages in one language: any of them, each falling back to English when missing. */
export type TranslatedMessages<M extends Messages = Messages> = { readonly [K in keyof M]?: TranslatedMessage }

/**
 * Translations for many components at once, by language then component: what `addTranslations` takes, and what a
 * JSON file can hold. `{ "fr": { "todo-list": { "addTask": "Ajouter" }, "modal": { "close": "Fermer" } } }`
 */
export type Translations = { readonly [locale: string]: { readonly [component: string]: TranslatedMessages } }

/** A component's messages in every language it ships, registered under the component's name. */
export interface MessageCatalog<M extends Messages> {
  readonly name: string
  readonly en: M
}

/** The languages each catalog has, by catalog name then lowercase BCP 47 tag; English is the catalog's own `en`. */
const translations = new Map<string, Map<string, TranslatedMessages>>()
const catalogs = new Map<string, MessageCatalog<Messages>>()

/**
 * Registers a component's messages in English, which every other language falls back to message by message. A
 * component ships English only: the app adds its languages with `addTranslations` or `addMessages`. (`shipped` is for
 * the few components that carried languages before, the planners; translations added later still win over them.)
 * Defining a name twice (two copies of a package) keeps the first.
 */
export function defineMessages<M extends Messages>(name: string, en: M, shipped: Record<string, M> = {}): MessageCatalog<M> {
  const existing = catalogs.get(name)
  if (existing) return existing as unknown as MessageCatalog<M>
  const catalog: MessageCatalog<M> = { name, en }
  catalogs.set(name, catalog as unknown as MessageCatalog<Messages>)
  // Translations added before the component loaded (an app registering its languages first) keep winning.
  const byLocale = translations.get(name) ?? new Map<string, TranslatedMessages>()
  for (const [locale, messages] of Object.entries(shipped)) {
    const key = locale.toLowerCase()
    byLocale.set(key, { ...messages, ...byLocale.get(key) })
  }
  translations.set(name, byLocale)
  return catalog
}

/**
 * Adds or overrides messages of a component (`'todo-list'`, or its catalog) in one language: a language the library
 * does not ship, or the wording of an app. Only the messages given change; the others keep the shipped text, then the
 * English. Components showing that catalog redraw.
 */
export function addMessages<M extends Messages>(catalog: MessageCatalog<M> | string, locale: string, messages: TranslatedMessages<M>): void {
  const name = typeof catalog === 'string' ? catalog : catalog.name
  store(name, locale, messages)
  for (const controller of controllers) {
    if (controller.catalogName === name) controller.refresh(true)
  }
}

/**
 * Adds the app's languages for any number of components at once, by language then component name (the tag without
 * `c2-`), as a JSON file can hold them: `addTranslations({ fr: { 'todo-list': { addTask: 'Ajouter' } } })`. A
 * component shows the language of its nearest `lang`, message by message, and English for any message not given.
 * Calling it again adds to, or overrides, what was given before. Components already on the page redraw.
 */
export function addTranslations(languages: Translations): void {
  const names = new Set<string>()
  for (const [locale, components] of Object.entries(languages)) {
    for (const [name, messages] of Object.entries(components)) {
      store(name, locale, messages)
      names.add(name)
    }
  }
  for (const controller of controllers) {
    if (names.has(controller.catalogName)) controller.refresh(true)
  }
}

function store(name: string, locale: string, messages: TranslatedMessages): void {
  let byLocale = translations.get(name)
  if (!byLocale) {
    byLocale = new Map()
    translations.set(name, byLocale)
  }
  const key = locale.toLowerCase()
  byLocale.set(key, { ...byLocale.get(key), ...messages })
}

/** A component's English messages, by its name or catalog: what there is to translate, for the docs and translators. */
export function englishMessages(catalog: MessageCatalog<Messages> | string): Messages | undefined {
  return typeof catalog === 'string' ? catalogs.get(catalog)?.en : catalog.en
}

/** The languages a component's text is shipped in, besides English, plus any added with `addMessages`. */
export function messageLocales(catalog: MessageCatalog<Messages> | string): string[] {
  const name = typeof catalog === 'string' ? catalog : catalog.name
  return ['en', ...(translations.get(name)?.keys() ?? [])]
}

/**
 * One message of `catalog` in `locale`: the exact tag (`fr-ca`), else its language (`fr`), else English. Functions are
 * called with `args`.
 */
export function formatMessage<M extends Messages, K extends keyof M & string>(
  catalog: MessageCatalog<M>,
  locale: string,
  key: K,
  ...args: MessageArgs<M[K]>
): string {
  const byLocale = translations.get(catalog.name)
  const tag = locale.toLowerCase()
  const language = tag.split('-')[0]
  const translated = byLocale?.get(tag)?.[key] ?? byLocale?.get(language)?.[key]
  const message = translated ?? catalog.en[key]
  return render(message as TranslatedMessage, locale, args as unknown[])
}

const pluralRules = new Map<string, Intl.PluralRules>()

/** A message as text: a function called, a choice picked by the first argument, `{n}` filled in. */
function render(message: TranslatedMessage, locale: string, args: unknown[]): string {
  if (typeof message === 'function') return (message as (...values: unknown[]) => string)(...args)
  let text: string | undefined
  if (typeof message === 'string') {
    text = message
  } else {
    const [first] = args
    let choice: string | undefined
    if (typeof first === 'number') {
      choice = message[String(first)]
      if (choice === undefined) {
        let rules = pluralRules.get(locale)
        if (!rules) {
          try {
            rules = new Intl.PluralRules(locale)
          } catch {
            rules = new Intl.PluralRules('en')
          }
          pluralRules.set(locale, rules)
        }
        choice = message[rules.select(first)]
      }
    } else if (first !== undefined) {
      choice = message[String(first)]
    }
    text = choice ?? message.other ?? ''
  }
  return text.replace(/\{(\d+)\}/g, (whole, index: string) => (Number(index) < args.length ? String(args[Number(index)]) : whole))
}

/**
 * The language of an element: the nearest `lang` attribute, through shadow roots to their hosts, else the browser's
 * language, else English. `lang=""` (unknown) is skipped.
 */
export function localeOf(element: Element | null | undefined): string {
  let node: Node | null | undefined = element
  while (node) {
    if (node instanceof Element) {
      const lang = node.getAttribute('lang')
      if (lang) return lang
    }
    node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null)
  }
  return (typeof navigator !== 'undefined' && navigator.language) || 'en'
}

const controllers = new Set<LocaleController>()
let observer: MutationObserver | undefined

/** One observer for the whole document: a `lang` set, changed or removed anywhere redraws the components it reaches. */
function observeLang(): void {
  if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return
  observer = new MutationObserver(() => {
    for (const controller of controllers) controller.refresh()
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'], subtree: true })
}

/**
 * Keeps a component in step with its language: `locale` is the host's language (its own `locale` when the component
 * passes one, else `localeOf`), read before each render, and the host redraws when a `lang` attribute changes
 * anywhere in the document. For components whose text comes from `Intl`; `LocalizeController` adds messages.
 */
export class LocaleController implements ReactiveController {
  /** The host's language as of its last render. */
  locale = 'en'
  readonly catalogName: string = ''

  protected readonly host: ReactiveControllerHost & Element
  /** The component's own locale setting, which wins over `lang` when it is set. */
  private readonly explicit: () => string | null | undefined

  constructor(host: ReactiveControllerHost & Element, explicit: () => string | null | undefined = () => undefined) {
    this.host = host
    this.explicit = explicit
    host.addController(this)
  }

  /** The language the host would use now. */
  resolve(): string {
    return this.explicit() || localeOf(this.host)
  }

  hostConnected(): void {
    controllers.add(this)
    observeLang()
    this.locale = this.resolve()
  }

  hostDisconnected(): void {
    controllers.delete(this)
  }

  hostUpdate(): void {
    this.locale = this.resolve()
  }

  /** Redraws the host when its language changed, or always when its messages did. */
  refresh(force = false): void {
    if (force || this.resolve() !== this.locale) this.host.requestUpdate()
  }
}

/**
 * A component's interface text in its language: `this.msg.t('close')`, `this.msg.t('done', closed, total)`. The host
 * redraws when its language or its catalog's messages change.
 */
export class LocalizeController<M extends Messages> extends LocaleController {
  override readonly catalogName: string

  private readonly catalog: MessageCatalog<M>

  constructor(host: ReactiveControllerHost & Element, catalog: MessageCatalog<M>, explicit?: () => string | null | undefined) {
    super(host, explicit)
    this.catalog = catalog
    this.catalogName = catalog.name
  }

  t<K extends keyof M & string>(key: K, ...args: MessageArgs<M[K]>): string {
    return formatMessage(this.catalog, this.locale, key, ...args)
  }
}
