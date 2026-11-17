import { html, isServer, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { JsonViewer } from './json-viewer.js'
import { copyText, type JsonPathSegment, type JsonRow, type SearchText } from './json-model.js'
import { jsonViewerMessages } from './messages.js'
import type { SchemaRenderContext, SchemaTreeModel } from './schema-model.js'
import styles from './schema-tree.scss?inline'

export { jsonViewerMessages } from './messages.js'

// The schema mode loads the first time a schema is given; from then on every tree builds synchronously. A failed load
// (offline, a stale deploy) shows the empty state and is tried again with the next schema.
type SchemaModule = typeof import('./schema-model.js')
let schemaModule: SchemaModule | undefined
let schemaModuleLoad: Promise<SchemaModule> | undefined
function loadSchemaModule(): Promise<SchemaModule> {
  schemaModuleLoad ??= import('./schema-model.js').then(
    (module) => (schemaModule = module),
    (error: unknown) => {
      schemaModuleLoad = undefined
      throw error
    },
  )
  return schemaModuleLoad
}

/**
 * A JSON Schema, or an OpenAPI schema object, as a tree of its properties: the documentation view of an API reference.
 * Each line is a property with its type (`string <email>`, `integer | null`, `Tag[]`, or the name of the schema it
 * refers to), its marks (`required`, `deprecated`, `read-only`, `write-only`), its constraints (`≥ 0`, `≤ 40 chars`,
 * `/^[A-Z]{3}$/`, `default 10`), its allowed values and its description. An object property opens on its properties,
 * an array of objects on its items' properties, and a `oneOf` or `anyOf` on one line per option.
 *
 * ```html
 * <c2-schema-tree schema='{"type":"object","required":["id"],"properties":{"id":{"type":"string","format":"uuid"}}}'></c2-schema-tree>
 * ```
 *
 * Local `$ref`s (`#/$defs/Address`, `#/components/schemas/Address`) are followed, `allOf` is merged, and a schema that
 * refers back to one of its ancestors is marked `recursive` instead of opening forever. To show one schema of an OpenAPI
 * document with its references, give the whole document and its pointer: `pointer="/components/schemas/Order"`.
 *
 * It is `c2-json-viewer` reading a schema: the keyboard, `search` and `filter`, `expand-depth`, `expandAll()`, the
 * events and the `--c2-json-viewer-*` variables all work the same; `search` matches the names and the types a line
 * shows. Paths (copied, in `expansion-change`, in `searchMatches`) are keyword locations: the walk from the root schema,
 * `$ref`s included (`$.properties.address.$ref.properties.city`, or `/properties/address/$ref/properties/city` with
 * `path-format="pointer"`), so two properties sharing a schema still have paths of their own. "Copy value" copies the
 * line's schema. `data` is not used. The code that reads a schema loads the first time one is given; until then, and on
 * the server, the tree is empty, and if it cannot load the `empty` slot shows. A document whose expansion passes 20,000
 * lines stops opening beyond them.
 *
 * @tag c2-schema-tree
 *
 * @slot empty - Shown instead of the tree while `schema` is undefined, names nothing at `pointer`, or the code that reads it could not load.
 *
 * @csspart tree - The scrolling container holding the lines.
 * @csspart row - One line: one property, option, tuple position or pattern of the schema.
 * @csspart key - The name at the start of a line: the property name, an option's title, a tuple position or a pattern.
 * @csspart value - Everything after the name on a line: the type, the marks, the constraints, the values and the description.
 * @csspart type - The type badge after the name.
 * @csspart required - The `required` mark after the type.
 * @csspart mark - Each other mark after the type: `deprecated`, `read-only`, `write-only`, `recursive`.
 * @csspart constraints - The constraints after the marks: bounds, lengths, pattern, default.
 * @csspart enum - The allowed values after the constraints.
 * @csspart description - The description at the end of a line.
 *
 * @cssproperty {color} [--c2-schema-tree__type--color=#0550ae] - Text colour of the type badge.
 * @cssproperty {color} [--c2-schema-tree__type--background-color=#f4f4f5] - Background of the type badge.
 * @cssproperty {border-radius} [--c2-schema-tree__type--border-radius=4px] - Corner radius of the type badge.
 * @cssproperty {padding} [--c2-schema-tree__type--padding-inline=4px] - Horizontal space inside the type badge.
 * @cssproperty {color} [--c2-schema-tree__format--color=#52525b] - Colour of the `<format>` inside the type badge.
 * @cssproperty {color} [--c2-schema-tree__required--color=#b91c1c] - Colour of the `required` mark.
 * @cssproperty {color} [--c2-schema-tree__mark--color=#b35900] - Colour of the `deprecated`, `read-only`, `write-only` and `recursive` marks, and of `one of`.
 * @cssproperty {color} [--c2-schema-tree__deprecated--color=#71717a] - Colour of a deprecated property's name, which is struck through.
 * @cssproperty {color} [--c2-schema-tree__option--color=#0550ae] - Colour of the name of an option, a tuple position, a pattern and "other keys".
 * @cssproperty {color} [--c2-schema-tree__constraint--color=#71717a] - Colour of the constraints.
 * @cssproperty {color} [--c2-schema-tree__enum--color=#116329] - Colour of the allowed values.
 * @cssproperty {color} [--c2-schema-tree__description--color=#71717a] - Colour of the description.
 */
@customElement('c2-schema-tree')
export class SchemaTree extends JsonViewer {
  static override styles = [JsonViewer.styles, unsafeCSS(styles)]

  /** The JSON Schema (or OpenAPI document) to show. As an attribute it is parsed as JSON. */
  @property({ converter: jsonPropertyConverter }) schema: unknown

  /** JSON Pointer of the schema to show inside `schema`, such as `/components/schemas/Order`; the whole of it when empty. */
  @property({ type: String }) pointer = ''

  /** Accessible name of the tree. "Schema" when empty. */
  @property({ type: String }) override label = ''

  @state() private model: SchemaTreeModel | undefined
  @state() private failed = false

  private readonly msg = new LocalizeController(this, jsonViewerMessages)

  /**
   * Rendered on the server, where the schema mode never loads: the first client render must match that empty tree, so
   * the schema is built after it even when the module is already here.
   */
  private readonly serverRendered = !isServer && this.shadowRoot !== null

  private readonly context: SchemaRenderContext = {
    t: (key, ...args) => this.msg.t(key, ...args),
    highlight: (text) => this.highlight(text),
  }

  protected override searchText: SearchText = (parent, key) => {
    const line = parent && typeof parent === 'object' ? this.model?.children.get(parent)?.get(String(key)) : undefined
    return line && schemaModule ? `${schemaModule.keyText(line, this.context.t)}\n${schemaModule.typeText(line, this.context.t)}` : undefined
  }

  protected override get source(): unknown {
    return this.model?.root
  }

  protected override sourceChanged(changed: PropertyValues<this>): boolean {
    return changed.has('model' as keyof SchemaTree)
  }

  protected override get treeLabel(): string {
    return this.label || this.msg.t('schema')
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('schema') || changed.has('pointer')) this.build()
    super.willUpdate(changed)
  }

  private build() {
    const { schema, pointer } = this
    this.failed = false
    if (schema === undefined) {
      this.model = undefined
    } else if (schemaModule && (this.hasUpdated || !this.serverRendered)) {
      this.model = schemaModule.buildSchemaTree(schema, pointer)
    } else if (!isServer) {
      loadSchemaModule().then(
        (module) => {
          // A newer schema may have arrived while the module loaded; that one is built instead.
          if (this.schema === schema && this.pointer === pointer) this.model = module.buildSchemaTree(schema, pointer)
        },
        () => {
          if (this.schema === schema && this.pointer === pointer) this.failed = true
        },
      )
    }
  }

  override render() {
    // Nothing to show yet while the schema mode loads, rather than the empty state.
    if (this.schema !== undefined && !this.model && !this.failed) return html`<div class="loading" part="tree"></div>`
    return super.render()
  }

  protected override renderKey(row: JsonRow): TemplateResult | typeof nothing {
    const line = this.model?.lines.get(row.id)
    return line && schemaModule ? schemaModule.renderSchemaKey(row, line, this.context) : nothing
  }

  protected override renderValue(row: JsonRow): TemplateResult {
    const line = this.model?.lines.get(row.id)
    return line && schemaModule ? schemaModule.renderSchemaValue(line, this.context) : super.renderValue(row)
  }

  protected override copyValue(row: JsonRow): string {
    return copyText(this.model?.lines.get(row.id)?.schema)
  }

  protected override segmentsOf(id: string): JsonPathSegment[] {
    return [...(this.model?.lines.get(id)?.path ?? [])]
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-schema-tree': SchemaTree
  }
}
