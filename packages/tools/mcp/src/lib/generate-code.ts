/**
 * Variant code generation, ported from `apps/ui/src/utils/playground.ts` (`generateCode`). The Lit output takes the
 * base class and module from the registry instead of deriving them from the tag, which is wrong for `c2-tab`
 * (`@c2n/tabs/tab.js`) and the icon elements.
 */
export type CodeFormat = 'html' | 'css' | 'lit' | 'json'

export interface VariantChanges {
  css: Record<string, string>
  attributes?: Record<string, string>
}

export interface CodeInput {
  tag: string
  /** Base markup the variant is applied to. */
  html: string
  changes: VariantChanges
  /** Name of the generated class / custom element, e.g. `brand-checkbox`. */
  name: string
  /** Exported class of the base element, e.g. `Button`. */
  className: string
  /** Module exporting that class, e.g. `@c2n/button`. */
  modulePath: string
}

export function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('')
}

function cssDeclarations(css: Record<string, string>, indent = '  '): string {
  return Object.entries(css)
    .map(([name, value]) => `${indent}${name}: ${value};`)
    .join('\n')
}

/** Rewrites the opening tag of the root element: adds a class and applies attribute changes. */
export function rewriteRootTag(html: string, tag: string, className: string, attributes: Record<string, string> = {}): string {
  const open = new RegExp(`<${tag}(\\s[^>]*)?>`, 'i')
  return html.replace(open, (_match, attrs: string = '') => {
    let rest = attrs
    for (const [name, value] of Object.entries(attributes)) {
      rest = rest.replace(new RegExp(`\\s${name}(=("[^"]*"|'[^']*'|[^\\s>]+))?`, 'i'), '')
      if (value === 'true' || value === '') rest += ` ${name}`
      else if (value !== 'false') rest += ` ${name}="${value}"`
    }
    if (/\sclass=/.test(rest)) {
      rest = rest.replace(/\sclass=(["'])([^"']*)\1/, (_m, quote: string, classes: string) => ` class=${quote}${classes.trim()} ${className}${quote}`)
    } else {
      rest = ` class="${className}"` + rest
    }
    return `<${tag}${rest}>`
  })
}

export function generateCode(format: CodeFormat, input: CodeInput): string {
  const { tag, html, changes, name, className: baseClass, modulePath } = input
  const hasCss = Object.keys(changes.css).length > 0
  switch (format) {
    case 'css':
      return hasCss ? `.${name} {\n${cssDeclarations(changes.css)}\n}` : `/* No CSS variable changes. */`
    case 'html': {
      const markup = rewriteRootTag(html.trim(), tag, name, changes.attributes)
      return hasCss ? `${markup}\n\n<style>\n  .${name} {\n${cssDeclarations(changes.css, '    ')}\n  }\n</style>` : markup
    }
    case 'lit': {
      const className = toPascalCase(name)
      const attributeLines = Object.entries(changes.attributes ?? {})
        .map(([attr, value]) => `    this.setAttribute('${attr}', '${value === 'true' ? '' : value}')`)
        .join('\n')
      return [
        `import { css } from 'lit'`,
        `import { ${baseClass} } from '${modulePath}'`,
        ``,
        `/** ${tag} with your theme baked in. Register once, then use <${name}> anywhere. */`,
        `export class ${className} extends ${baseClass} {`,
        `  static override styles = [`,
        `    ${baseClass}.styles,`,
        `    css\``,
        `      :host {`,
        hasCss ? cssDeclarations(changes.css, '        ') : `        /* your overrides */`,
        `      }`,
        `    \`,`,
        `  ]`,
        ...(attributeLines ? [``, `  override connectedCallback() {`, `    super.connectedCallback()`, attributeLines, `  }`] : []),
        `}`,
        ``,
        `customElements.define('${name}', ${className})`,
      ].join('\n')
    }
    case 'json':
      return JSON.stringify({ tag, ...changes }, null, 2)
  }
}
