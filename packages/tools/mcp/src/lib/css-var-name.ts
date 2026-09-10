/**
 * Parses a c2 CSS variable name with the grammar `--<prefix>[__<part>[__<state>]]--<property>`.
 * Ported from `apps/ui/src/utils/manifest-utils.ts` (`normalizeCssDeclaration`) and the theme generator.
 */
export interface ParsedCssVarName {
  prefix: string
  parts: string[]
  states: string[]
  property: string
}

const STATES = new Set([
  'hover',
  'active',
  'focus',
  'selected',
  'disabled',
  'open',
  'error',
  'read-only',
  'unselected',
  'copied',
  'highlighted',
  'over',
  'online',
  'away',
  'busy',
  'offline',
  'expanded',
  'running',
  'checked',
  'invalid',
])

const NAME_PATTERN = /^--(c2-[a-z0-9-]+?)(?:__(.+?))?--(-?[a-z-]+)$/

export function parseCssVarName(name: string): ParsedCssVarName | undefined {
  const match = NAME_PATTERN.exec(name)
  if (!match) return undefined
  const [, prefix, blocks = '', property] = match
  const parts: string[] = []
  const states: string[] = []
  for (const block of blocks.split('__').filter(Boolean)) {
    if (STATES.has(block)) states.push(block)
    else parts.push(block)
  }
  return { prefix, parts, states, property }
}
