import { html, unsafeStatic } from 'lit/static-html.js'

const brand = Symbol.for('dynamicBind')

export interface ObjectMap {
  key: string
  value: unknown
  type: 'attribute' | 'event'
}

export interface BindMap {
  _$map$: ObjectMap[]
  r: typeof brand
}

/** Safely extracts the string part of a StaticValue. */
const unwrapBindMap = (value: unknown): ObjectMap[] | undefined => {
  if ((value as Partial<BindMap>)?.r !== brand) {
    return undefined
  }
  return (value as Partial<BindMap>)?.['_$map$']
}
export const bindMap = (value: ObjectMap[]): BindMap => ({
  _$map$: value,
  r: brand,
})

export const dynamicHtml = (strings: TemplateStringsArray, ...values: unknown[]) => {
  const l = values.length
  let dynamicBind: ObjectMap[] | undefined
  const staticStrings: Array<string> = []
  const dynamicValues: Array<unknown> = []
  let i = 0
  let hasStatics = false
  while (i < l) {
    if ((dynamicBind = unwrapBindMap(values[i])) !== undefined) {
      dynamicBind.forEach((bindItem) => {
        if (bindItem.type === 'attribute') {
          if (typeof bindItem.value === 'boolean') {
            staticStrings.push(' ?')
          } else {
            staticStrings.push(' ')
          }
        } else if (bindItem.type === 'event') {
          staticStrings.push(' @')
        }
        dynamicValues.push(unsafeStatic(bindItem.key))
        staticStrings.push('=')
        dynamicValues.push(bindItem.value)
      })
      hasStatics = true
    } else {
      dynamicValues.push(values[i])
      staticStrings.push(strings[i])
    }
    i++
  }
  if (i === l) {
    staticStrings.push(strings[l])
  }
  if (hasStatics) {
    strings = staticStrings as unknown as TemplateStringsArray
    values = dynamicValues
  }
  return html(strings, ...values)
}
