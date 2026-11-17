import type { PasswordField, PasswordGeneratorOptions, PasswordRequirement } from './password-field.js'

/**
 * The password generator of `c2-password-field`, loaded with `import()` the first time a password is generated. Every
 * random choice comes from `crypto.getRandomValues`, drawn without modulo bias.
 */

const CLASSES = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '!#$%&*+-=?@^_~',
} as const

export type CharacterClass = keyof typeof CLASSES

export const CHARACTER_CLASSES = Object.keys(CLASSES) as CharacterClass[]

/** The built-in requirement that asks for each character class. */
const REQUIREMENT_OF: Record<CharacterClass, string> = { lowercase: 'lowercase', uppercase: 'uppercase', numbers: 'number', symbols: 'symbol' }

/** Shortest password the generator draws, and the most words, so a slip in the options never yields a trivial or huge result. */
const MIN_LENGTH = 4
/** What the built-in `length` requirement asks for when the field sets no `minlength`, as in `password-field.ts`. */
const DEFAULT_REQUIRED_LENGTH = 8
const MAX_LENGTH = 256
const MIN_WORDS = 3
const MAX_WORDS = 20

/** Options with every field resolved, and the character classes the field's requirements make compulsory. */
export interface GeneratorSettings extends Required<Omit<PasswordGeneratorOptions, 'wordList'>> {
  wordList?: readonly string[]
  /** Lower and upper bound of `length`: the field's `minlength` and `maxlength`. */
  minLength: number
  maxLength: number
  /** Bounds of `words`: enough for `minlength`, few enough for `maxlength`, with words of usual length. */
  minWords: number
  maxWords: number
  /** Options a requirement of the field asks for: they stay on. */
  locked: Lockable[]
}

/** The options a requirement can lock: a character class, or a passphrase's capitals and digit. */
export type Lockable = CharacterClass | 'capitalize' | 'includeNumber'

/** The fields of `c2-password-field` the generator reads. */
export interface GeneratorField {
  minLength: number
  maxLength: number
  requirements: (string | PasswordRequirement)[]
}

/**
 * The private members of `c2-password-field` its lazy modules use, so the entry carries no glue for them. The types
 * are read from the class (an indexed access reaches a private member), so renaming one breaks this build.
 */
export interface FieldInternals {
  strengthOf: PasswordField['strengthOf']
  requirementsOf: PasswordField['requirementsOf']
  strengthLabel: PasswordField['strengthLabel']
  readonly effectiveDisabled: PasswordField['effectiveDisabled']
  dirty: PasswordField['dirty']
  readonly input: PasswordField['input']
  generatorPanel: PasswordField['generatorPanel']
}

export const internals = (field: PasswordField) => field as unknown as FieldInternals

/** Whether the field takes `value` as it is: within `minlength` and `maxlength`, and meeting every requirement. */
export const acceptsFor = (field: PasswordField) => (value: string) => {
  const length = [...value].length
  return (
    length >= field.minLength &&
    (field.maxLength < 0 || length <= field.maxLength) &&
    internals(field)
      .requirementsOf(value)
      .every((requirement) => requirement.met)
  )
}

/** A uniformly random integer in `[0, n)`, from `crypto.getRandomValues` with rejection sampling (no modulo bias). */
export function randomIndex(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new RangeError(`randomIndex: ${n} is not a valid range`)
  const limit = 2 ** 32 - (2 ** 32 % n)
  const buffer = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buffer)
    if (buffer[0] < limit) return buffer[0] % n
  }
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Math.round(Number(value))
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

/** The options merged with their defaults and fitted to the field's length limits and requirements. */
export function resolveSettings(options: PasswordGeneratorOptions | null | undefined, field: GeneratorField): GeneratorSettings {
  const given = options && typeof options === 'object' ? options : {}
  const ids = new Set(
    (Array.isArray(field.requirements) ? field.requirements : []).map((entry) => (typeof entry === 'string' ? entry.trim() : entry?.id)).filter(Boolean),
  )
  const locked: Lockable[] = CHARACTER_CLASSES.filter((name) => ids.has(REQUIREMENT_OF[name]))
  if (ids.has('uppercase')) locked.push('capitalize')
  if (ids.has('number')) locked.push('includeNumber')
  const required = field.minLength > 0 ? field.minLength : ids.has('length') ? DEFAULT_REQUIRED_LENGTH : 0
  const minLength = Math.max(MIN_LENGTH, required, locked.length)
  const maxLength = Math.max(minLength, field.maxLength > 0 ? Math.min(field.maxLength, MAX_LENGTH) : MAX_LENGTH)
  return fit({
    kind: given.kind === 'passphrase' ? 'passphrase' : 'password',
    length: clamp(given.length, minLength, maxLength, Math.max(minLength, Math.min(16, maxLength))),
    lowercase: given.lowercase ?? true,
    uppercase: given.uppercase ?? true,
    numbers: given.numbers ?? true,
    symbols: given.symbols ?? true,
    words: clamp(given.words, MIN_WORDS, MAX_WORDS, 5),
    separator: typeof given.separator === 'string' ? given.separator : '-',
    capitalize: given.capitalize ?? false,
    includeNumber: given.includeNumber ?? false,
    wordList: Array.isArray(given.wordList) ? given.wordList : undefined,
    minLength,
    maxLength,
    minWords: MIN_WORDS,
    maxWords: MAX_WORDS,
    locked,
  })
}

/**
 * Keeps settings within what the field accepts after a change: locked options on, at least one character class, and
 * a word count whose usual length (words of 5 to 6 letters) fits `minlength` and `maxlength`. Rejection does the rest.
 */
export function fit(settings: GeneratorSettings): GeneratorSettings {
  for (const name of settings.locked) settings[name] = true
  if (!CHARACTER_CLASSES.some((name) => settings[name])) settings.lowercase = true
  const separator = [...settings.separator].length
  settings.maxWords =
    settings.maxLength < MAX_LENGTH ? clamp(Math.floor((settings.maxLength + separator) / (6 + separator)), MIN_WORDS, MAX_WORDS, MIN_WORDS) : MAX_WORDS
  settings.minWords = clamp(Math.ceil((settings.minLength + separator) / (5 + separator)), MIN_WORDS, settings.maxWords, MIN_WORDS)
  settings.words = clamp(settings.words, settings.minWords, settings.maxWords, settings.minWords)
  settings.length = clamp(settings.length, settings.minLength, settings.maxLength, settings.minLength)
  return settings
}

/** A source of suggestions for one set of settings, with the entropy of each in bits. */
export interface Generator {
  next(): string
  bits: number
}

let defaultWords: Promise<readonly string[]> | undefined

/** Loads the word list a passphrase needs (the built-in one only when the settings bring none) and returns the generator. */
export async function prepare(settings: GeneratorSettings): Promise<Generator> {
  if (settings.kind === 'password') {
    const classes = CHARACTER_CLASSES.filter((name) => settings[name]).map((name) => CLASSES[name])
    const pool = [...classes.join('')]
    const length = Math.max(settings.length, classes.length)
    return {
      bits: Math.floor(length * Math.log2(pool.length)),
      next() {
        // Drawn again until every chosen class appears: rejection keeps every valid password equally likely.
        for (;;) {
          const chars = Array.from({ length }, () => pool[randomIndex(pool.length)])
          if (classes.every((set) => chars.some((char) => set.includes(char)))) return chars.join('')
        }
      },
    }
  }
  const own = settings.wordList ? [...new Set(settings.wordList.map((word) => String(word).trim()).filter(Boolean))] : []
  const list =
    own.length >= 2
      ? own
      : await (defaultWords ??= import('./word-list.js').then(
          (module) => module.default,
          (error: unknown) => {
            defaultWords = undefined
            throw error
          },
        ))
  const count = settings.words
  return {
    bits: Math.floor(count * Math.log2(list.length) + (settings.includeNumber ? Math.log2(10 * count) : 0)),
    next() {
      const words = Array.from({ length: count }, () => {
        const word = list[randomIndex(list.length)]
        return settings.capitalize ? word.charAt(0).toLocaleUpperCase() + word.slice(1) : word
      })
      if (settings.includeNumber) {
        const at = randomIndex(count)
        words[at] += String(randomIndex(10))
      }
      return words.join(settings.separator)
    },
  }
}

/**
 * A suggestion the field accepts: drawn again while `accepts` refuses it (a passphrase too long for `maxlength`, a
 * requirement of the app's own). An empty string when 100 draws found none: the options cannot meet the field's rules.
 */
export function suggest(generator: Generator, accepts: (value: string) => boolean): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = generator.next()
    if (accepts(value)) return value
  }
  return ''
}

/** `generate()` of `c2-password-field`: one suggestion for the field's options, overridden by `options`. */
export async function generateFor(field: PasswordField, options?: PasswordGeneratorOptions): Promise<string> {
  return suggest(await prepare(resolveSettings({ ...field.generatorOptions, ...options }, field)), acceptsFor(field))
}
