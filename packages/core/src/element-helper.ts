import { customElement as litCustomElement, type CustomElementDecorator } from '@lit/reactive-element/decorators/custom-element.js'
import { isServer } from 'lit-html/is-server.js'

type ElementClass = Omit<typeof HTMLElement, 'new'>

interface PropertyDeclarationLike {
  attribute?: boolean | string
  reflect?: boolean
}

interface ReactiveElementClassLike extends ElementClass {
  elementProperties?: Map<PropertyKey, PropertyDeclarationLike>
  prototype: HTMLElement
}

const warned = new Set<string>()

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[c2n] ${message}`)
}

/**
 * Attributes a consumer is likely to write instead of the real one: the lowercased spelling of a camelCase
 * property whose attribute was renamed to kebab-case (`rowkey` for `rowKey`, whose attribute is `row-key`).
 *
 * The lowercased spelling is what a framework produces from a *static* attribute in a template — Angular and
 * plain HTML both do it, and so does React when it renders a custom element on the server (the prop name is
 * written verbatim and the parser lowercases it; hydration never sets the property). The component does not
 * observe it, so without help the value is silently dropped.
 */
function ambiguousAttributes(elementClass: ReactiveElementClassLike): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const [name, declaration] of elementClass.elementProperties ?? []) {
    if (typeof name !== 'string' || declaration.attribute === false) continue
    const attribute = typeof declaration.attribute === 'string' ? declaration.attribute : name.toLowerCase()
    const lowercased = name.toLowerCase()
    if (lowercased !== attribute) aliases.set(lowercased, attribute)
  }
  return aliases
}

/**
 * Forwards the lowercased spelling of a camelCase property to the attribute the component observes, and warns
 * once per tag and attribute so the author can fix the template. The real attribute wins when both are present.
 * Installed by {@link customElement} and skipped entirely for components that have none.
 */
function installAttributeCheck(tagName: string, elementClass: ReactiveElementClassLike): void {
  const prototype = elementClass.prototype as HTMLElement & { connectedCallback?: () => void }
  const connected = prototype.connectedCallback
  let aliases: Map<string, string> | undefined

  prototype.connectedCallback = function (this: HTMLElement) {
    connected?.call(this)

    // Resolved on the first connect: `elementProperties` is only complete once every decorator has run.
    aliases ??= ambiguousAttributes(elementClass)
    if (aliases.size === 0 || !this.hasAttributes()) return

    for (const { name, value } of [...this.attributes]) {
      const attribute = aliases.get(name)
      if (!attribute) continue
      if (!this.hasAttribute(attribute)) this.setAttribute(attribute, value)
      warnOnce(
        `${tagName}:${name}`,
        `<${tagName} ${name}> is not an attribute of this component — did you mean "${attribute}"? The value was forwarded to it; write "${attribute}" so it is read directly.`,
      )
    }
  }
}

const reflectedByClass = new WeakMap<object, Map<string, PropertyKey>>()

/** Attribute name → property name, for every property declared with `reflect: true`. Read once per class. */
function reflectedAttributes(elementClass: ReactiveElementClassLike): Map<string, PropertyKey> {
  const cached = reflectedByClass.get(elementClass)
  if (cached) return cached
  const reflected = new Map<string, PropertyKey>()
  reflectedByClass.set(elementClass, reflected)
  for (const [name, declaration] of elementClass.elementProperties ?? []) {
    if (!declaration.reflect || declaration.attribute === false) continue
    reflected.set(typeof declaration.attribute === 'string' ? declaration.attribute : String(name).toLowerCase(), name)
  }
  return reflected
}

type ReflectingHost = HTMLElement & Record<PropertyKey, unknown> & { update(changedProperties: unknown): void }

/** The value each reflected property held when construction finished: the class-field defaults. */
const constructedDefaults = new WeakMap<HTMLElement, Map<PropertyKey, unknown>>()
/** Hosts inside `update()`, which is where Lit reflects properties to attributes. */
const updatingHosts = new WeakSet<HTMLElement>()

/**
 * Subclasses a component so Lit does not reflect a property that still holds its class-field default onto an
 * attribute the host does not have.
 *
 * Lit reflects every `reflect: true` property on the first update, defaults included, so a bare `<c2-button>` gains
 * `type="button" name=""` the moment it upgrades. Under SSR (Next.js, React Router) that happens before React
 * hydrates, and React reports each of those attributes as a hydration mismatch. Keeping defaults off the host means
 * an element's attributes are the ones its author wrote, plus the values that were actually changed.
 *
 * The consequence for styling: a default value is not visible as an attribute, so `:host([size='m'])` does not
 * match a host that never had `size` set. Write default-state rules against the attribute's absence
 * (`:host(:not([size]))`), or not against the attribute at all.
 *
 * A value set after construction — by the author, a framework or the component itself — reflects as before, and an
 * attribute the host already carries keeps being updated, so it never goes stale. The class needs a subclass
 * because the defaults are only known once the component's own constructor, which assigns them, has returned.
 */
function keepDefaultsOffTheHost(target: ElementClass): ElementClass {
  const Base = target as unknown as new (...args: unknown[]) => ReflectingHost

  class DefaultsOffTheHost extends Base {
    constructor(...args: unknown[]) {
      super(...args)
      const reflected = reflectedAttributes(this.constructor as unknown as ReactiveElementClassLike)
      if (reflected.size) constructedDefaults.set(this, new Map([...reflected.values()].map((property) => [property, this[property]])))
    }

    override update(changedProperties: unknown): void {
      updatingHosts.add(this)
      try {
        super.update(changedProperties)
      } finally {
        updatingHosts.delete(this)
      }
    }

    override setAttribute(name: string, value: string): void {
      if (!isServer && updatingHosts.has(this) && !this.hasAttribute(name)) {
        const defaults = constructedDefaults.get(this)
        const property = reflectedAttributes(this.constructor as unknown as ReactiveElementClassLike).get(name)
        if (defaults && property !== undefined && defaults.has(property) && Object.is(this[property], defaults.get(property))) return
      }
      super.setAttribute(name, value)
    }
  }

  // Keep the component's own name in stack traces and devtools.
  Object.defineProperty(DefaultsOffTheHost, 'name', { value: (target as unknown as { name: string }).name })
  return DefaultsOffTheHost as unknown as ElementClass
}

/**
 * `@customElement`, but a duplicate registration warns instead of throwing.
 *
 * `customElements.define` throws `NotSupportedError` when a tag is already taken, which takes down the whole
 * page. That happens for reasons a component library cannot control: two versions of a package in one app, two
 * micro-frontends, a module graph loaded twice, a dev server's hot reload. Keeping the first definition and
 * warning leaves the page working; the element still behaves like whichever copy won the race.
 *
 * It also forwards the lowercased spelling of a camelCase attribute to the real one, with a warning (see
 * {@link installAttributeCheck}), and keeps reflected properties that still hold their default off the host (see
 * {@link keepDefaultsOffTheHost}).
 */
export const customElement =
  (tagName: string): CustomElementDecorator =>
  (target: ElementClass, context?: ClassDecoratorContext) => {
    installAttributeCheck(tagName, target as ReactiveElementClassLike)

    if (customElements.get(tagName)) {
      warnOnce(
        `define:${tagName}`,
        `<${tagName}> is already registered. The first definition is kept; this one is ignored. Two copies of a @c2n package are loaded — check for duplicate versions in the dependency tree.`,
      )
      return
    }

    // The subclass is what gets registered, and returning it replaces the decorated class binding, so the exported
    // class and the registered one stay the same. `context` is `undefined` under experimental decorators and a
    // `ClassDecoratorContext` under standard ones; Lit's decorator handles both, so it is forwarded as received.
    const element = keepDefaultsOffTheHost(target)
    ;(litCustomElement(tagName) as (target: ElementClass, context?: ClassDecoratorContext) => void)(element, context)
    return element
  }
