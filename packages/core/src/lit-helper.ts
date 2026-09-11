export const arrayPropertyConverter = {
  toAttribute: (value: string[]) => {
    return Array.isArray(value) ? value.join(';') : ''
  },
  fromAttribute: (value: string) => {
    return value ? value.split(';') : []
  },
}

/**
 * Converter for properties whose value is a plain object or array and whose attribute is JSON, so data-driven
 * components (a table's rows and columns, for instance) can be authored in markup as well as from script.
 * Invalid JSON parses to `undefined` rather than throwing, and never round-trips back to the attribute.
 */
export const jsonPropertyConverter = {
  toAttribute: (value: unknown) => {
    if (value === undefined || value === null) return null
    return JSON.stringify(value)
  },
  fromAttribute: (value: string | null) => {
    if (!value) return undefined
    try {
      return JSON.parse(value)
    } catch {
      return undefined
    }
  },
}
