import { customElement as litCustomElement, type CustomElementDecorator } from '@lit/reactive-element/decorators/custom-element.js'

type ElementClass = Omit<typeof HTMLElement, 'new'>

interface PropertyDeclarationLike {
  attribute?: boolean | string
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

/**
 * `@customElement`, but a duplicate registration warns instead of throwing.
 *
 * `customElements.define` throws `NotSupportedError` when a tag is already taken, which takes down the whole
 * page. That happens for reasons a component library cannot control: two versions of a package in one app, two
 * micro-frontends, a module graph loaded twice, a dev server's hot reload. Keeping the first definition and
 * warning leaves the page working; the element still behaves like whichever copy won the race.
 *
 * It also forwards the lowercased spelling of a camelCase attribute to the real one, with a warning (see
 * {@link installAttributeCheck}).
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

    // `context` is `undefined` under experimental decorators and a `ClassDecoratorContext` under standard ones;
    // Lit's decorator handles both, so it is forwarded exactly as received.
    return (litCustomElement(tagName) as (target: ElementClass, context?: ClassDecoratorContext) => void)(target, context)
  }
