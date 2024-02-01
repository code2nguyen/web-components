export interface ComponentCode {
  [uid: string]: {
    code: string
    lang: string
  }
}

interface CssVariable {
  name: string
  value: string
  type: string
  defaultValue: string
}

export interface ComponentCssVariable {
  [uid: string]: CssVariable[]
}
