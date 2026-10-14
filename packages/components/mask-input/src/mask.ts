/** What one mask character accepts, and how it rewrites the accepted character. */
export interface MaskToken {
  /** Tested against one typed character. */
  pattern: RegExp
  /** Rewrites an accepted character, e.g. to upper case. Must return one character. */
  transform?: (char: string) => string
}

/** A parsed mask: one entry per mask character. */
export type MaskPart = { kind: 'slot'; token: MaskToken; optional: boolean } | { kind: 'literal'; char: string; optional: boolean }

/** The result of fitting some text to a mask. */
export interface MaskResult {
  /** The accepted characters only, without the mask's literals. */
  raw: string
  /** The text as displayed: literals up to the last filled slot, nothing after it. */
  formatted: string
  /** Offset in `formatted` of each character of `raw`. */
  positions: number[]
  /** Index of the first mask part after the last filled slot (or after the leading literals, while empty). */
  nextPart: number
  /** Every required slot is filled. */
  complete: boolean
  /** Every slot, optional ones included, is filled. */
  full: boolean
}

const upper = (char: string) => {
  const result = char.toLocaleUpperCase()
  return [...result].length === 1 ? result : char
}

/**
 * The built-in mask characters: `9` a digit, `a` a letter, `A` a letter in upper case, `*` a letter or digit and `X` a
 * letter or digit in upper case. Any other character is a literal; `\` makes the next one a literal too, and `?` makes
 * the rest of the mask optional.
 */
export const defaultMaskTokens: Readonly<Record<string, MaskToken>> = Object.freeze({
  '9': { pattern: /^\p{Nd}$/u },
  a: { pattern: /^\p{L}$/u },
  A: { pattern: /^\p{L}$/u, transform: upper },
  '*': { pattern: /^[\p{L}\p{Nd}]$/u },
  X: { pattern: /^[\p{L}\p{Nd}]$/u, transform: upper },
})

/** Splits a mask into slots and literals. `tokens` are added to (and win over) {@link defaultMaskTokens}. */
export function parseMask(mask: string, tokens: Record<string, MaskToken> = {}): MaskPart[] {
  const all: Record<string, MaskToken> = { ...defaultMaskTokens, ...tokens }
  const parts: MaskPart[] = []
  let optional = false
  let escaped = false
  for (const char of mask) {
    if (escaped) {
      parts.push({ kind: 'literal', char, optional })
      escaped = false
    } else if (char === '\\') escaped = true
    else if (char === '?') optional = true
    else if (Object.prototype.hasOwnProperty.call(all, char)) parts.push({ kind: 'slot', token: all[char], optional })
    else parts.push({ kind: 'literal', char, optional })
  }
  return parts
}

const accept = (token: MaskToken, char: string): string | undefined => {
  token.pattern.lastIndex = 0
  if (!token.pattern.test(char)) return undefined
  const result = token.transform ? token.transform(char) : char
  return [...result].length === 1 ? result : char
}

/** Options of {@link applyMask}. */
export interface ApplyMaskOptions {
  /** `text` holds typed characters only: a character equal to a literal fills the next slot rather than the literal. */
  raw?: boolean
}

/**
 * Fits `text` to a mask. `text` may be raw characters, the formatted value or anything typed or pasted in between:
 * characters a slot does not accept are dropped, a character equal to the next literal is taken as that literal
 * (unless `raw` is set), and whatever overflows the mask is cut off. An empty mask takes the text as it is.
 */
export function applyMask(text: string, parts: MaskPart[], options: ApplyMaskOptions = {}): MaskResult {
  // No mask: the text is taken as it is.
  if (parts.length === 0) {
    const positions: number[] = []
    let offset = 0
    for (const char of text) {
      positions.push(offset)
      offset += char.length
    }
    return { raw: text, formatted: text, positions, nextPart: 0, complete: true, full: true }
  }
  let raw = ''
  let formatted = ''
  let pending = ''
  const positions: number[] = []
  let part = 0

  const place = (char: string) => {
    formatted += pending
    pending = ''
    positions.push(formatted.length)
    formatted += char
    raw += char
  }

  for (const char of text) {
    if (part >= parts.length) break
    // Walk the run of literals ahead: a typed literal is consumed, anything else goes to the slot after the run.
    let next = part
    let matched = -1
    while (next < parts.length) {
      const current = parts[next]
      if (current.kind !== 'literal') break
      if (!options.raw && current.char === char) {
        matched = next
        break
      }
      next++
    }
    if (matched >= 0) {
      for (let index = part; index <= matched; index++) pending += (parts[index] as { char: string }).char
      part = matched + 1
      continue
    }
    if (next >= parts.length) continue
    const accepted = accept((parts[next] as { token: MaskToken }).token, char)
    if (accepted === undefined) continue
    for (let index = part; index < next; index++) pending += (parts[index] as { char: string }).char
    place(accepted)
    part = next + 1
  }

  const slots = parts.filter((entry) => entry.kind === 'slot')
  const required = slots.filter((entry) => !entry.optional).length
  const filled = [...raw].length
  return { raw, formatted, positions, nextPart: slotEnd(parts, filled), complete: filled >= required, full: filled >= slots.length }
}

/** Index of the part after the `count`-th slot; for 0, after the leading literals. */
function slotEnd(parts: MaskPart[], count: number) {
  if (count === 0) {
    const first = parts.findIndex((entry) => entry.kind === 'slot')
    return first < 0 ? parts.length : first
  }
  let seen = 0
  for (let index = 0; index < parts.length; index++) {
    if (parts[index].kind === 'slot' && ++seen === count) return index + 1
  }
  return parts.length
}

/**
 * The mask as a hint: `slotChar` in every slot, the literals as they are. With `from`, starts at that part; optional
 * parts are left out unless `optional` is set.
 */
export function maskTemplate(parts: MaskPart[], slotChar = '_', from = 0, optional = false): string {
  let end = parts.length
  if (!optional) {
    end = 0
    parts.forEach((entry, index) => {
      if (entry.kind === 'slot' && !entry.optional) end = index + 1
    })
  }
  let template = ''
  for (let index = from; index < end; index++) {
    const entry = parts[index]
    template += entry.kind === 'slot' ? slotChar : entry.char
  }
  return template
}

/** Fits `text` to `mask` and returns the formatted value: `formatMask('4111111111111111', '9999 9999 9999 9999')`. */
export function formatMask(text: string, mask: string, tokens?: Record<string, MaskToken>): string {
  return applyMask(text, parseMask(mask, tokens)).formatted
}

/** Fits `text` to `mask` and returns the accepted characters only: `unmask('12/34', '99/99')` is `'1234'`. */
export function unmask(text: string, mask: string, tokens?: Record<string, MaskToken>): string {
  return applyMask(text, parseMask(mask, tokens)).raw
}
