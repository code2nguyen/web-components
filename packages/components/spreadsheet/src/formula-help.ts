/**
 * What the formula being typed needs help with: the function name under the caret (for suggestions) and the call
 * the caret is inside (for the argument hint).
 */

/** The built-in functions in the order the suggestions list them: the everyday ones first. */
export const FUNCTION_ORDER = [
  'SUM',
  'AVERAGE',
  'COUNT',
  'COUNTA',
  'MIN',
  'MAX',
  'ROUND',
  'ABS',
  'IF',
  'IFERROR',
  'SUMIF',
  'AND',
  'OR',
  'NOT',
  'CONCAT',
  'LEN',
  'UPPER',
  'LOWER',
  'TRIM',
  'TODAY',
] as const

export type BuiltinFunctionName = (typeof FUNCTION_ORDER)[number]

export interface FormulaContext {
  /** The name being typed right before the caret, from `start`. Empty right after `=`. */
  name?: { start: number; text: string }
  /** The innermost call the caret is in, with the zero-based argument it is on. */
  call?: { name: string; argument: number }
  /** A cell reference can go at the caret (after `=`, `(`, `,` or an operator). */
  referable: boolean
}

/** Strings blanked out, so their content never reads as names, commas or parentheses. Returns the text and whether a string is still open. */
function blankStrings(text: string): { text: string; open: boolean } {
  let open = false
  const blanked = text.replace(/"(?:[^"]|"")*("?)/g, (quoted, closing: string) => {
    if (!closing) open = true
    return ' '.repeat(quoted.length)
  })
  return { text: blanked, open }
}

export function formulaContext(text: string, caret: number): FormulaContext {
  if (!text.startsWith('=')) return { referable: false }
  const { text: before, open } = blankStrings(text.slice(0, caret))
  const stack: { name: string; argument: number }[] = []
  for (let index = 1; index < before.length; index++) {
    const char = before[index]
    if (char === '(') stack.push({ name: /([A-Za-z][A-Za-z0-9_.]*)\s*$/.exec(before.slice(0, index))?.[1]?.toUpperCase() ?? '', argument: 0 })
    else if (char === ')') stack.pop()
    else if (char === ',' && stack.length) stack[stack.length - 1].argument++
  }
  const top = stack[stack.length - 1]
  const call = top?.name ? top : undefined
  if (open) return { call, referable: false }
  const match = /(^|[=(,+\-*/^&<>%\s])([A-Za-z][A-Za-z0-9_.]*)?$/.exec(before)
  const name = match && (match[2] || before === '=') ? { start: before.length - (match[2]?.length ?? 0), text: match[2] ?? '' } : undefined
  const referable = /[=(,+\-*/^&<>:]\s*$/.test(before)
  return { name, call, referable }
}

/** A formula typed so far, with its open string and parentheses closed, so its result can be previewed. */
export function closeFormula(text: string): string {
  const { text: blanked, open } = blankStrings(text)
  let depth = 0
  for (const char of blanked) {
    if (char === '(') depth++
    else if (char === ')' && depth) depth--
  }
  return `${text}${open ? '"' : ''}${')'.repeat(depth)}`
}
