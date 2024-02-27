export interface ManifestDeclarationItem {
  type?: {
    text: string
  }
  description: string
  name: string
  default?: string
  value?: string
}

export interface StateCssProperties {
  [state: string]: ManifestDeclarationItem[]
}

export interface ComponentManifest {
  host?: {
    w?: string
    h?: string
  }
  allCssProperties: ManifestDeclarationItem[]
  cssProperties: ManifestDeclarationItem[]
  stateCssProperties?: StateCssProperties
  attributes: ManifestDeclarationItem[]
  events: ManifestDeclarationItem[]
  slots: ManifestDeclarationItem[]
  tagName: string
}
