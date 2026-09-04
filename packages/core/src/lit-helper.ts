export const arrayPropertyConverter = {
  toAttribute: (value: string[]) => {
    return Array.isArray(value) ? value.join(';') : ''
  },
  fromAttribute: (value: string) => {
    return value ? value.split(';') : []
  },
}
