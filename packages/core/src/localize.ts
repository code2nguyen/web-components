import type { ReactiveController, ReactiveControllerHost } from '@lit/reactive-element'

/**
 * A component's interface text, one entry per message: a string, or a function of the values it carries for text with
 * numbers, names or plurals (`(done: number, total: number) => \`${done} of ${total} done\``).
 */
export type Messages = { [key: string]: string | ((...args: never[]) => string) }

/** The arguments a message takes: none for a string, the function's own for a function. */
export type MessageArgs<V> = V extends (...args: infer A) => string ? A : []

/** A component's messages in every language it ships, registered under the component's name. */
export interface MessageCatalog<M extends Messages> {
  readonly name: string
  readonly en: M
}

/** The languages each catalog has, by catalog name then lowercase BCP 47 tag; English is the catalog's own `en`. */
const translations = new Map<string, Map<string, Partial<Messages>>>()
const catalogs = new Map<string, MessageCatalog<Messages>>()

/**
 * Registers a component's messages: the English ones, which every other language falls back to message by message,
 * and the translations it ships (`{ fr, vi }`). Type each translation as `typeof en` so a missing message fails the
 * build. Defining a name twice (two copies of a package) keeps the first.
 */
export function defineMessages<M extends Messages>(name: string, en: M, shipped: Record<string, M> = {}): MessageCatalog<M> {
  const existing = catalogs.get(name)
  if (existing) return existing as unknown as MessageCatalog<M>
  const catalog: MessageCatalog<M> = { name, en }
  catalogs.set(name, catalog as unknown as MessageCatalog<Messages>)
  const byLocale = new Map<string, Partial<Messages>>()
  for (const [locale, messages] of Object.entries(shipped)) byLocale.set(locale.toLowerCase(), messages)
  translations.set(name, byLocale)
  return catalog
}

/**
 * Adds or overrides messages of a component (`'todo-list'`, or its catalog) in one language: a language the library
 * does not ship, or the wording of an app. Only the messages given change; the others keep the shipped text, then the
 * English. Components showing that catalog redraw.
 */
export function addMessages<M extends Messages>(catalog: MessageCatalog<M> | string, locale: string, messages: Partial<M>): void {
  const name = typeof catalog === 'string' ? catalog : catalog.name
  let byLocale = translations.get(name)
  if (!byLocale) {
    byLocale = new Map()
    translations.set(name, byLocale)
  }
  const key = locale.toLowerCase()
  byLocale.set(key, { ...byLocale.get(key), ...(messages as Partial<Messages>) })
  for (const controller of controllers) {
    if (controller.catalogName === name) controller.refresh(true)
  }
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
  const message = (byLocale?.get(tag)?.[key] ?? byLocale?.get(language)?.[key] ?? catalog.en[key]) as M[K]
  return typeof message === 'function' ? (message as (...values: unknown[]) => string)(...args) : (message as string)
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

  constructor(
    protected readonly host: ReactiveControllerHost & Element,
    /** The component's own locale setting, which wins over `lang` when it is set. */
    private readonly explicit: () => string | null | undefined = () => undefined,
  ) {
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

  constructor(
    host: ReactiveControllerHost & Element,
    private readonly catalog: MessageCatalog<M>,
    explicit?: () => string | null | undefined,
  ) {
    super(host, explicit)
    this.catalogName = catalog.name
  }

  t<K extends keyof M & string>(key: K, ...args: MessageArgs<M[K]>): string {
    return formatMessage(this.catalog, this.locale, key, ...args)
  }
}
