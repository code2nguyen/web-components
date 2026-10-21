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

const accept = (token: MaskToken, char: string): string | undefined => {
  token.pattern.lastIndex = 0
  if (!token.pattern.test(char)) return undefined
  const result = token.transform ? token.transform(char) : char
  return [...result].length === 1 ? result : char
}

/** Where one typed character can go from a mask position. */
interface Move {
  /** Mask position after the character. */
  next: number
  /** Literals the field inserts before the character, or the typed literal and those before it. */
  literals: string
  /** The character as a slot took it; absent when it was taken as a literal or dropped. */
  accepted?: string
  /** The character was dropped. */
  dropped?: boolean
}

/**
 * Where `char` can go from position `from`: walking the literals ahead, a character equal to one is taken as that
 * literal (unless `raw`), anything else goes to the slot after them or is dropped. An optional group not started yet
 * gives two moves, into the group and past it, in that order; with no groups there is always exactly one.
 */
function moves(parts: MaskPart[], from: number, char: string, raw: boolean): Move[] {
  const found: Move[] = []
  const walk = (index: number, literals: string, decided: boolean) => {
    if (index >= parts.length) {
      found.push({ next: from, literals: '', dropped: true })
      return
    }
    const current = parts[index]
    if (!decided && current.group && current.group.start === index) {
      walk(index, literals, true)
      walk(current.group.end, literals, false)
      return
    }
    if (current.kind === 'literal') {
      if (!raw && current.char === char) found.push({ next: index + 1, literals: literals + char })
      else walk(index + 1, literals + current.char, false)
      return
    }
    const accepted = accept(current.token, char)
    found.push(accepted === undefined ? { next: from, literals: '', dropped: true } : { next: index + 1, literals, accepted })
  }
  walk(from, '', false)
  return found
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
  const raw = !!options.raw
  // A choice exists only where an optional group may be entered or skipped, and the right one can depend on what comes
  // later (`M11AE` against `A[A]9[X] 9AA` skips both groups). For those, `best[i * width + p]` scores the rest of the
  // text from the `i`-th character at position `p`: two points per character a slot takes, one more if the value ends
  // complete. Masks without groups never need it.
  const width = parts.length + 1
  let best: Int32Array | undefined
  if (parts.some((entry) => entry.group)) {
    best = new Int32Array((chars.length + 1) * width)
    for (let p = 0; p <= parts.length; p++) best[chars.length * width + p] = remaining(parts, p).required ? 0 : 1
    for (let i = chars.length - 1; i >= 0; i--) {
      for (let p = 0; p <= parts.length; p++) {
        let score = -1
        for (const move of moves(parts, p, chars[i], raw)) score = Math.max(score, (move.accepted === undefined ? 0 : 2) + best[(i + 1) * width + move.next])
        best[i * width + p] = score
      }
    }
  }

  let rawText = ''
  let formatted = ''
  let pending = ''
  const positions: number[] = []
  let part = 0
  let lastSlot = -1
  for (let i = 0; i < chars.length && part < parts.length; i++) {
    const choices = moves(parts, part, chars[i], raw)
    let move = choices[0]
    if (best && choices.length > 1) {
      // The first of the best moves: entering a group wins a tie.
      const score = (entry: Move) => (entry.accepted === undefined ? 0 : 2) + best[(i + 1) * width + entry.next]
      for (const entry of choices) if (score(entry) > score(move)) move = entry
    }
    if (move.dropped) continue
    if (move.accepted === undefined) pending += move.literals
    else {
      formatted += pending + move.literals
      pending = ''
      positions.push(formatted.length)
      formatted += move.accepted
      rawText += move.accepted
      lastSlot = move.next - 1
    }
    part = move.next
  }

  const first = parts.findIndex((entry) => entry.kind === 'slot')
  const nextPart = lastSlot >= 0 ? lastSlot + 1 : first < 0 ? parts.length : first
  // Moves skip slots only by skipping a whole group, so the slots left are the ones from `part` on.
  const rest = remaining(parts, part)
  return { raw: rawText, formatted, positions, nextPart, complete: !rest.required, full: !rest.any }
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
