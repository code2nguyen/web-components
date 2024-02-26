export interface ManifestDeclarationItem {
  type?: {
    text: string
  }
  description: string
  name: string
  default?: string
  value?: string
}

export interface ComponentManifest {
  host?: {
    w?: string
    h?: string
  }
  cssProperties: ManifestDeclarationItem[]
  stateCssProperties?: {
    [state: string]: ManifestDeclarationItem[]
  }
  attributes: ManifestDeclarationItem[]
  events: ManifestDeclarationItem[]
  slots: ManifestDeclarationItem[]
}
