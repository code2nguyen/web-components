/** What one mask character accepts, and how it rewrites the accepted character. */
export interface MaskToken {
  /** Tested against one typed character. */
  pattern: RegExp
  /** Rewrites an accepted character, e.g. to upper case. Must return one character. */
  transform?: (char: string) => string
}

/** The span `[start, end)` of mask parts an optional group covers. */
export interface MaskGroup {
  start: number
  end: number
}

/**
 * A parsed mask: one entry per mask character. `optional` marks the parts after `?`; `group` the parts of a bracketed
 * group, which is filled entirely or skipped.
 */
export type MaskPart =
  { kind: 'slot'; token: MaskToken; optional: boolean; group?: MaskGroup } | { kind: 'literal'; char: string; optional: boolean; group?: MaskGroup }

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
  /** No slot is left after the last filled one: optional ones are filled, or were skipped as optional groups. */
  full: boolean
}

const upper = (char: string) => {
  const result = char.toLocaleUpperCase()
  return [...result].length === 1 ? result : char
}

/**
 * The built-in mask characters: `9` a digit, `a` a letter, `A` a letter in upper case, `*` a letter or digit and `X` a
 * letter or digit in upper case. Any other character is a literal; `\` makes the next one a literal too, `?` makes
 * the rest of the mask optional, and `[` `]` wrap an optional group anywhere in the mask.
 */
export const defaultMaskTokens: Readonly<Record<string, MaskToken>> = Object.freeze({
  '9': { pattern: /^\p{Nd}$/u },
  a: { pattern: /^\p{L}$/u },
  A: { pattern: /^\p{L}$/u, transform: upper },
  '*': { pattern: /^[\p{L}\p{Nd}]$/u },
  X: { pattern: /^[\p{L}\p{Nd}]$/u, transform: upper },
})

/**
 * Splits a mask into slots and literals. `tokens` are added to (and win over) {@link defaultMaskTokens}. `[` and `]`
 * wrap an optional group (`A[A]9[*] 9AA`, a UK postcode); groups do not nest, so a `[` inside one is a literal, as is
 * a `]` outside one.
 */
export function parseMask(mask: string, tokens: Record<string, MaskToken> = {}): MaskPart[] {
  const all: Record<string, MaskToken> = { ...defaultMaskTokens, ...tokens }
  const parts: MaskPart[] = []
  let optional = false
  let escaped = false
  let group: MaskGroup | undefined
  const push = (part: MaskPart) => parts.push(group ? { ...part, group } : part)
  for (const char of mask) {
    if (escaped) {
      push({ kind: 'literal', char, optional })
      escaped = false
    } else if (char === '\\') escaped = true
    else if (char === '?') optional = true
    else if (char === '[' && !group) group = { start: parts.length, end: parts.length }
    else if (char === ']' && group) {
      group.end = parts.length
      group = undefined
    } else if (Object.prototype.hasOwnProperty.call(all, char)) push({ kind: 'slot', token: all[char], optional })
    else push({ kind: 'literal', char, optional })
  }
  // An unclosed group runs to the end of the mask.
  if (group) group.end = parts.length
  return parts
}

const accepts = (token: MaskToken, char: string) => {
  token.pattern.lastIndex = 0
  return token.pattern.test(char)
}

const accept = (token: MaskToken, char: string): string | undefined => {
  if (!accepts(token, char)) return undefined
  const result = token.transform ? token.transform(char) : char
  return [...result].length === 1 ? result : char
}

/** A part a character can land on from some position, with the literals the field inserts on the way there. */
interface Reach {
  part: number
  literals: string
}

/**
 * For each mask position, the parts the next character can land on, in order of preference: walking past literals,
 * and into an optional group before going around it.
 */
function reachable(parts: MaskPart[]): Reach[][] {
  return parts.map((_, from) => {
    const found: Reach[] = []
    const seen = new Set<number>()
    const walk = (index: number, literals: string) => {
      if (index >= parts.length || seen.has(index)) return
      seen.add(index)
      found.push({ part: index, literals })
      const current = parts[index]
      if (current.kind === 'literal') walk(index + 1, literals + current.char)
      if (current.group && current.group.start === index) walk(current.group.end, literals)
    }
    walk(from, '')
    return found
  })
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
  const chars = [...text]
  // No mask: the text is taken as it is.
  if (parts.length === 0) {
    const positions: number[] = []
    let offset = 0
    for (const char of chars) {
      positions.push(offset)
      offset += char.length
    }
    return { raw: text, formatted: text, positions, nextPart: 0, complete: true, full: true }
  }
  const reach = reachable(parts)
  // A typed character may be taken as a literal ahead (unless the text is raw), go to a slot ahead that accepts it, or
  // be dropped. Optional groups make the first choice not always the best one (`M11AE` against `A[A]9[*] 9AA` must
  // skip both groups), so `best[i][p]` counts the characters the slots can take from the `i`-th character on, at
  // mask position `p`; the walk below then takes the first choice that keeps that count, which, with no groups, is
  // always the first one that applies.
  const width = parts.length + 1
  const best = new Int32Array((chars.length + 1) * width)
  const step = (char: string, entry: Reach): { next: number; gain: number } | undefined => {
    const current = parts[entry.part]
    if (current.kind === 'literal') return !options.raw && current.char === char ? { next: entry.part + 1, gain: 0 } : undefined
    return accepts(current.token, char) ? { next: entry.part + 1, gain: 1 } : undefined
  }
  for (let i = chars.length - 1; i >= 0; i--) {
    for (let p = 0; p < parts.length; p++) {
      let score = best[(i + 1) * width + p]
      for (const entry of reach[p]) {
        const move = step(chars[i], entry)
        if (move) score = Math.max(score, move.gain + best[(i + 1) * width + move.next])
      }
      best[i * width + p] = score
    }
  }

  let raw = ''
  let formatted = ''
  let pending = ''
  const positions: number[] = []
  let part = 0
  let lastSlot = -1
  for (let i = 0; i < chars.length && part < parts.length; i++) {
    const target = best[i * width + part]
    for (const entry of reach[part]) {
      const move = step(chars[i], entry)
      if (!move || move.gain + best[(i + 1) * width + move.next] !== target) continue
      const current = parts[entry.part]
      if (current.kind === 'literal') pending += entry.literals + current.char
      else {
        const accepted = accept(current.token, chars[i]) as string
        formatted += pending + entry.literals
        pending = ''
        positions.push(formatted.length)
        formatted += accepted
        raw += accepted
        lastSlot = entry.part
      }
      part = move.next
      break
    }
  }

  const first = parts.findIndex((entry) => entry.kind === 'slot')
  const nextPart = lastSlot >= 0 ? lastSlot + 1 : first < 0 ? parts.length : first
  const rest = remaining(parts, lastSlot + 1)
  return { raw, formatted, positions, nextPart, complete: !rest.required, full: !rest.any }
}

/** Whether slots are left from `from` on: any at all, and any that must be filled. */
function remaining(parts: MaskPart[], from: number) {
  let any = false
  let required = false
  for (let index = from; index < parts.length; index++) {
    const current = parts[index]
    if (current.kind !== 'slot') continue
    any = true
    // A slot of a group not started yet may be skipped with the group; one of the group being filled may not.
    const skippable = current.group !== undefined && current.group.start >= from
    if (!current.optional && !skippable) required = true
  }
  return { any, required }
}

/**
 * The mask as a hint: `slotChar` in every slot, the literals as they are. With `from`, starts at that part; optional
 * parts, and optional groups not started yet, are left out unless `optional` is set.
 */
export function maskTemplate(parts: MaskPart[], slotChar = '_', from = 0, optional = false): string {
  const skipped = (entry: MaskPart) => !optional && entry.group !== undefined && entry.group.start >= from
  let end = parts.length
  if (!optional) {
    end = 0
    parts.forEach((entry, index) => {
      if (entry.kind === 'slot' && !entry.optional && !skipped(entry)) end = index + 1
    })
  }
  let template = ''
  for (let index = from; index < end; index++) {
    const entry = parts[index]
    if (skipped(entry)) continue
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
