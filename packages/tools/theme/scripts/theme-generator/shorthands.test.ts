import assert from 'node:assert/strict'
import test from 'node:test'

import { classify } from './classify.ts'
import { renderBaseCss, type ClassifiedVar } from './emit.ts'
import { collectFallbackChains, parseVarName, type CssVar } from './manifests.ts'
import { coveredByShorthand, shorthandName } from './shorthands.ts'

const BORDER = '1px solid rgb(213, 213, 213)'

function cssVar(name: string, defaultValue: string | undefined, pkg = '@c2n/details'): CssVar {
  const parsed = parseVarName(name)
  assert.ok(parsed, name)
  return { name, pkg, ...parsed, default: defaultValue }
}

function classifyAll(vars: CssVar[]): ClassifiedVar[] {
  return vars.map((v) => ({ cssVar: v, result: classify(v, vars) }))
}

const sides = ['top', 'right', 'bottom', 'left']
const sideVars = (defaults: Record<string, string> = {}) => sides.map((side) => cssVar(`--c2-details--border-${side}`, defaults[side] ?? BORDER))
const compiled = sides.map((side) => `border-${side}: var(--c2-details--border-${side},var(--c2-details--border,${BORDER}));`).join('\n')

test('names the shorthand variable of a longhand variable', () => {
  assert.equal(shorthandName('--c2-details--border-top', 'border-top'), '--c2-details--border')
  assert.equal(shorthandName('--c2-card__header--padding-left', 'padding-left'), '--c2-card__header--padding')
  assert.equal(shorthandName('--c2-card--border-top-left-radius', 'border-top-left-radius'), '--c2-card--border-radius')
  assert.equal(shorthandName('--c2-card--background', 'background'), undefined)
})

test('reads direct fallbacks between variables from compiled CSS', () => {
  const chains = collectFallbackChains('a{border:var(--c2-x--border-top, var( --c2-x--border ,1px solid red));color:var(--c2-x--color,red)}')
  assert.deepEqual([...chains], [['--c2-x--border-top', new Set(['--c2-x--border'])]])
})

test('per-side variables that fall back to a shorthand mapped to the same value are left out of base.css', () => {
  const classified = classifyAll([cssVar('--c2-details--border', BORDER), ...sideVars()])
  const covered = coveredByShorthand(classified, collectFallbackChains(compiled))
  assert.deepEqual([...covered.keys()], ['--c2-details--border-top', '--c2-details--border-right', '--c2-details--border-bottom', '--c2-details--border-left'])

  const css = renderBaseCss(classified, covered)
  assert.match(css, /--c2-details--border: var\(--c2-theme--border, /)
  assert.doesNotMatch(css, /--c2-details--border-(top|right|bottom|left):/)
})

test('per-side variables are still written without a documented shorthand, a fallback chain, or the same value', () => {
  const noShorthand = classifyAll(sideVars())
  assert.equal(coveredByShorthand(noShorthand, collectFallbackChains(compiled)).size, 0)

  const notChained = classifyAll([cssVar('--c2-details--border', BORDER), ...sideVars()])
  const chainless = sides.map((side) => `border-${side}: var(--c2-details--border-${side},${BORDER});`).join('\n')
  assert.equal(coveredByShorthand(notChained, collectFallbackChains(chainless)).size, 0)

  // A side with a default of its own (here the accent) keeps its own value under the theme.
  const ownValue = classifyAll([cssVar('--c2-details--border', BORDER), ...sideVars({ bottom: '2px solid #0265dc' })])
  assert.deepEqual(
    [...coveredByShorthand(ownValue, collectFallbackChains(compiled)).keys()],
    ['--c2-details--border-top', '--c2-details--border-right', '--c2-details--border-left'],
  )
})
