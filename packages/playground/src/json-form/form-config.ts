import { Package } from 'custom-elements-manifest'

type RuleEffectType = 'HIDE' | 'SHOW' | 'DISABLE' | 'ENABLE'

interface RuleCondition {
  expect: unknown
}

interface RuleDefinition {
  trigger: string
  effect?: RuleEffectType
  condition: RuleCondition
}

interface LinkDefinition {
  source: string
  target: string
}

interface SimpleElement {
  tag: string
  id: string
  children?: SimpleElement[]
}

export interface FormConfig {
  packages: Package[]
  layout: SimpleElement
  rules?: RuleDefinition[]
  links?: LinkDefinition[]
}
