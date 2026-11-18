import { defineMessages } from '@c2n/core/localize.js'

/**
 * The text `c2-json-viewer` draws around the data, then the text `c2-schema-tree` draws around a schema's own words:
 * the marks of a property and its constraints. Values arrive written as JSON (`"draft"`, `40`), so a translation only
 * places them.
 */
const en = {
  /** Accessible name of the viewer's tree while `label` is empty. */
  label: 'JSON',
  /** Default content of the `empty` slot, shown while there is no data. */
  noData: 'No data',
  /** Shown in place of the lines when `search` with `filter` matches nothing. */
  noMatch: 'No match',
  /** The line that reveals the next children of a long branch: how many it reveals, of how many left. */
  showMore: (shown: number, remaining: number) => `Show ${shown} more of ${remaining}`,
  /** Size of a closed or open array. */
  itemCount: (count: number) => (count === 1 ? `${count} item` : `${count} items`),
  /** Size of a closed or open object. */
  keyCount: (count: number) => (count === 1 ? `${count} key` : `${count} keys`),
  /** Tooltip of the line action that copies the line's path. */
  copyPath: 'Copy path',
  /** Tooltip of the line action that copies the line's value. */
  copyValue: 'Copy value',
  /** Tooltip of a copy action right after a successful copy. */
  copied: 'Copied',
  /** Accessible name of the tree while `label` is empty. */
  schema: 'Schema',
  /** Mark of a property the parent object requires. */
  required: 'required',
  /** Mark of a property marked `deprecated`. */
  deprecated: 'deprecated',
  /** Mark of a property marked `readOnly`: sent by the server, never by the client. */
  readOnly: 'read-only',
  /** Mark of a property marked `writeOnly`: sent by the client, never returned. */
  writeOnly: 'write-only',
  /** Type of a schema that is exactly one of its options (`oneOf`). */
  oneOf: 'one of',
  /** Type of a schema that is any of its options (`anyOf`). */
  anyOf: 'any of',
  /** Name of an option of `oneOf` or `anyOf` with no title. */
  option: (position: number) => `Option ${position}`,
  /** Name of the line for `additionalProperties`: the keys not listed. */
  otherKeys: 'other keys',
  /** Mark of a schema that refers back to one of its ancestors, whose lines stop there. */
  recursive: 'recursive',
  /** `minimum`. */
  minimum: (value: string) => `≥ ${value}`,
  /** `exclusiveMinimum`. */
  exclusiveMinimum: (value: string) => `> ${value}`,
  /** `maximum`. */
  maximum: (value: string) => `≤ ${value}`,
  /** `exclusiveMaximum`. */
  exclusiveMaximum: (value: string) => `< ${value}`,
  /** `multipleOf`. */
  multipleOf: (value: string) => `multiple of ${value}`,
  /** `minLength`. */
  minLength: (value: string) => `≥ ${value} chars`,
  /** `maxLength`. */
  maxLength: (value: string) => `≤ ${value} chars`,
  /** `pattern`, the regular expression a string matches. */
  pattern: (value: string) => `/${value}/`,
  /** `minItems`. */
  minItems: (value: string) => `≥ ${value} items`,
  /** `maxItems`. */
  maxItems: (value: string) => `≤ ${value} items`,
  /** `uniqueItems`. */
  uniqueItems: 'unique items',
  /** `minProperties`. */
  minProperties: (value: string) => `≥ ${value} keys`,
  /** `maxProperties`. */
  maxProperties: (value: string) => `≤ ${value} keys`,
  /** `const`, the one allowed value. */
  const: (value: string) => `= ${value}`,
  /** `default`. */
  default: (value: string) => `default ${value}`,
}

export const jsonViewerMessages = defineMessages('json-viewer', en)

export type JsonViewerMessages = typeof en
