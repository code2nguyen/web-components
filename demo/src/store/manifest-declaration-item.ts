export interface CSSDeclarationItem {
  cssVariable: string
  type: string
  blocks: string[]
  property: string
  default?: string
  value?: string
  description?: string
}

export interface AttributeDeclarationItem {
  name: string
  type: string
  default?: string
  value?: string
  description?: string
}

export interface EventDeclarationItem {
  name: string
  type: string
  description?: string
}

export interface ComponentManifest {
  host: {
    w?: string
    h?: string
  }
  cssProperties: CSSDeclarationItem[]
  attributes: AttributeDeclarationItem[]
  events: EventDeclarationItem[]
  tagName: string
}

export interface ComponentManifests {
  [tagName: string]: ComponentManifest
}

export interface GroupedCssVariables {
  level: number
  groupName: string
  groups: string[]
  cssProperties: CSSDeclarationItem[]
  subGroups: GroupedCssVariables[]
}

export interface FlattenGroupedCssVariable {
  level: number
  groupName: string
  fullGroupName: string
  cssProperty?: CSSDeclarationItem
}
