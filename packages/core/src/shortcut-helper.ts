/**
 * Keyboard shortcuts: parse the `mod+k, mod+k mod+s` syntax, match it against `keydown` events, format it for display
 * and for `aria-keyshortcuts`, and route every registered binding through one shared document listener.
 *
 * Syntax. A binding's `keys` is a comma-separated list of alternatives; an alternative is a space-separated
 * sequence of strokes; a stroke is `+`-joined modifiers followed by one key. `mod` is ⌘ on Apple platforms and
 * Ctrl elsewhere. Key names are `KeyboardEvent.key` values, case-insensitive, plus the aliases in {@link KEY_ALIASES}
 * (`esc`, `space`, `up`, `plus`, `comma`, …) for keys the syntax itself uses.
 *
 * Every stroke must be composed: it holds Ctrl, ⌘ or Alt (Shift alone does not count, `shift+a` is typing). Escape
 * and the function keys F1–F24 are the only keys accepted on their own. An alternative with a bare stroke (`/`,
 * `g d`) is dropped with a console warning.
 *
 *     mod+k            ⌘K / Ctrl+K
 *     mod+k, alt+/     either of two shortcuts
 *     mod+k mod+s      ⌘K, then ⌘S within a second
 *     ctrl+shift+p     all three modifiers must match, and no other
 *     escape, f1       keys that need no modifier
 */

export interface ShortcutStroke {
  /** Lowercased `KeyboardEvent.key` (after aliasing). */
  key: string
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  /** `mod` was written: resolves to `meta` on Apple platforms and `ctrl` elsewhere. */
  mod: boolean
}

/** One alternative of a binding: the strokes pressed in order, and the text it was parsed from. */
export interface ShortcutSequence {
  source: string
  strokes: ShortcutStroke[]
}

/** The options of a binding the shared listener reads. Components extend this with their own fields. */
export interface ShortcutBindingOptions {
  keys: string
  /** `global` (default), `parent` (the registering element's parent) or a CSS selector matched against the focus path. */
  scope?: string
  /** Fire even while focus is in an editable field. Strokes with Ctrl, ⌘ or Alt fire there regardless. */
  allowInInputs?: boolean
  /** Leave the browser's own handling of the key alone instead of calling `preventDefault()`. */
  allowDefault?: boolean
  /** Fire again for auto-repeated `keydown` events while the key is held. */
  repeat?: boolean
  disabled?: boolean
}

export interface ShortcutMatch<B extends ShortcutBindingOptions = ShortcutBindingOptions> {
  binding: B
  /** The alternative that matched, as written (`alt+/` of `mod+k, alt+/`). */
  keys: string
  event: KeyboardEvent
}

/** Delay allowed between two strokes of a sequence. */
export const SEQUENCE_TIMEOUT = 1000

export const KEY_ALIASES: Readonly<Record<string, string>> = {
  esc: 'escape',
  return: 'enter',
  space: ' ',
  spacebar: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  del: 'delete',
  ins: 'insert',
  plus: '+',
  comma: ',',
  minus: '-',
}

const MODIFIER_KEYS = new Set(['control', 'meta', 'alt', 'shift', 'altgraph', 'os', 'capslock', 'fn'])

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

function parseStroke(raw: string): ShortcutStroke {
  // `+` separates parts, so a trailing `++` is the plus key itself (`ctrl++`); `plus` is the unambiguous spelling.
  const parts = raw === '+' ? ['+'] : raw.endsWith('++') ? [...raw.slice(0, -2).split('+'), '+'] : raw.split('+')
  const stroke: ShortcutStroke = { key: '', ctrl: false, meta: false, alt: false, shift: false, mod: false }
  for (const part of parts) {
    const name = part.trim().toLowerCase()
    if (!name) continue
    if (name === 'mod') stroke.mod = true
    else if (name === 'ctrl' || name === 'control') stroke.ctrl = true
    else if (name === 'meta' || name === 'cmd' || name === 'command' || name === 'super') stroke.meta = true
    else if (name === 'alt' || name === 'option' || name === 'opt') stroke.alt = true
    else if (name === 'shift') stroke.shift = true
    else stroke.key = KEY_ALIASES[name] ?? name
  }
  return stroke
}

/** Whether the stroke holds Ctrl, ⌘ or Alt, the modifiers that make a key press a command rather than typing. */
function isChord(stroke: ShortcutStroke): boolean {
  return stroke.ctrl || stroke.meta || stroke.alt || stroke.mod
}

/** Keys that are commands on their own and need no modifier. */
function isStandaloneKey(key: string): boolean {
  return key === 'escape' || /^f([1-9]|1[0-9]|2[0-4])$/.test(key)
}

/** Whether a stroke is accepted: a chord, or Escape / a function key. */
export function isComposedStroke(stroke: ShortcutStroke): boolean {
  return !!stroke.key && (isChord(stroke) || isStandaloneKey(stroke.key))
}

const cache = new Map<string, ShortcutSequence[]>()

/**
 * Parses a `keys` string into its alternatives. Malformed alternatives (no key) and alternatives with a stroke that is
 * not composed (see {@link isComposedStroke}) are dropped, the latter with a warning. The comma key has to be written
 * `comma`, since a bare `,` separates alternatives.
 */
export function parseShortcut(keys: string): ShortcutSequence[] {
  const cached = cache.get(keys)
  if (cached) return cached
  const sequences = keys
    .split(',')
    .map((alternative) => alternative.trim())
    .filter(Boolean)
    .map((source) => ({ source, strokes: source.split(/\s+/).map(parseStroke) }))
    .filter((sequence) => sequence.strokes.every((stroke) => stroke.key))
    .filter((sequence) => {
      if (sequence.strokes.every(isComposedStroke)) return true
      console.warn(`[c2-shortcut] "${sequence.source}" ignored: every key needs Ctrl, ⌘ or Alt (only Escape and F1–F24 may stand alone).`)
      return false
    })
  cache.set(keys, sequences)
  return sequences
}

function resolvedModifiers(stroke: ShortcutStroke, apple: boolean) {
  return { ctrl: stroke.ctrl || (stroke.mod && !apple), meta: stroke.meta || (stroke.mod && apple), alt: stroke.alt, shift: stroke.shift }
}

/** The physical key the stroke names, for layouts (and Option on macOS) where `event.key` is another character. */
function codeFor(key: string): string | undefined {
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  return undefined
}

export function matchesStroke(stroke: ShortcutStroke, event: KeyboardEvent, apple = isApplePlatform()): boolean {
  const wanted = resolvedModifiers(stroke, apple)
  if (event.ctrlKey !== wanted.ctrl || event.metaKey !== wanted.meta || event.altKey !== wanted.alt) return false
  const key = (event.key ?? '').toLowerCase()
  // A symbol such as `?` or `+` already implies whichever Shift state the layout needs to type it.
  const symbol = key.length === 1 && !/[a-z0-9]/.test(key)
  if (!(symbol && !wanted.shift) && event.shiftKey !== wanted.shift) return false
  if (key === stroke.key) return true
  // `event.key` is not plain ASCII (Option+K types `˚`, a Cyrillic layout types `л`, a dead key reads `Dead`):
  // fall back to the physical key.
  const ascii = key.length === 1 && key.charCodeAt(0) < 128
  return !ascii && event.code === codeFor(stroke.key)
}

const APPLE_KEY_LABELS: Record<string, string> = {
  escape: 'Esc',
  enter: '↵',
  backspace: '⌫',
  delete: '⌦',
  tab: '⇥',
  ' ': 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
}

const KEY_LABELS: Record<string, string> = {
  escape: 'Esc',
  enter: 'Enter',
  backspace: 'Backspace',
  delete: 'Del',
  tab: 'Tab',
  ' ': 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
}

function keyLabel(key: string, apple: boolean): string {
  const named = (apple ? APPLE_KEY_LABELS : KEY_LABELS)[key]
  if (named) return named
  if (key.length === 1) return key.toUpperCase()
  return key.charAt(0).toUpperCase() + key.slice(1)
}

function strokeLabel(stroke: ShortcutStroke, apple: boolean): string {
  const { ctrl, meta, alt, shift } = resolvedModifiers(stroke, apple)
  const key = keyLabel(stroke.key, apple)
  if (apple) return `${ctrl ? '⌃' : ''}${alt ? '⌥' : ''}${shift ? '⇧' : ''}${meta ? '⌘' : ''}${key}`
  return [ctrl && 'Ctrl', meta && 'Win', alt && 'Alt', shift && 'Shift', key].filter(Boolean).join('+')
}

/**
 * Human label for each alternative, in the platform's convention: `⌘K` / `⇧⌘P` on Apple platforms, `Ctrl+K` /
 * `Ctrl+Shift+P` elsewhere. Strokes of a sequence are separated by a space (`G D`).
 */
export function formatShortcut(keys: string, apple = isApplePlatform()): string[] {
  return parseShortcut(keys).map((sequence) => sequence.strokes.map((stroke) => strokeLabel(stroke, apple)).join(' '))
}

const ARIA_KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  '+': 'Plus',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  pageup: 'PageUp',
  pagedown: 'PageDown',
}

function ariaKeyName(key: string): string {
  return ARIA_KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1))
}

/**
 * The `aria-keyshortcuts` value for a `keys` string (`Meta+K Control+K` style, one token per alternative). ARIA has
 * no notation for a sequence, so multi-stroke alternatives are left out; an empty string means nothing to announce.
 */
export function ariaKeyShortcuts(keys: string, apple = isApplePlatform()): string {
  return parseShortcut(keys)
    .filter((sequence) => sequence.strokes.length === 1)
    .map(({ strokes: [stroke] }) => {
      const { ctrl, meta, alt, shift } = resolvedModifiers(stroke, apple)
      return [ctrl && 'Control', alt && 'Alt', shift && 'Shift', meta && 'Meta', ariaKeyName(stroke.key)].filter(Boolean).join('+')
    })
    .join(' ')
}

/** Whether a key event comes from a field the user types into (input, textarea, select, contenteditable). */
export function isEditableTarget(event: Event): boolean {
  const target = event.composedPath()[0]
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (!(target instanceof HTMLInputElement)) return false
  return !['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'].includes(target.type)
}

// --- Shared listener ---------------------------------------------------------------------------------------------

interface ShortcutSource {
  owner: Element
  bindings: () => readonly ShortcutBindingOptions[]
  onMatch: (match: ShortcutMatch) => void
}

interface Candidate {
  source: ShortcutSource
  binding: ShortcutBindingOptions
  sequence: ShortcutSequence
  /** Position in the focus path of the element that scopes the binding (`Infinity` for global). Lower wins. */
  depth: number
  order: number
}

const sources: ShortcutSource[] = []
let pending: { candidate: Candidate; progress: number }[] = []
let pendingTimer: ReturnType<typeof setTimeout> | undefined

function clearPending() {
  pending = []
  clearTimeout(pendingTimer)
  pendingTimer = undefined
}

function scopeDepth(source: ShortcutSource, scope: string | undefined, path: EventTarget[]): number {
  if (!scope || scope === 'global') return Number.POSITIVE_INFINITY
  if (scope === 'parent') {
    const parent = source.owner.parentNode
    const scopeElement = parent instanceof ShadowRoot ? parent.host : parent
    const index = scopeElement ? path.indexOf(scopeElement) : -1
    return index < 0 ? -1 : index
  }
  try {
    return path.findIndex((node) => node instanceof Element && node.matches(scope))
  } catch {
    // An invalid selector scopes the binding to nothing rather than throwing on every key press.
    return -1
  }
}

function eligibleCandidates(event: KeyboardEvent): Candidate[] {
  const path = event.composedPath()
  const editable = isEditableTarget(event)
  const candidates: Candidate[] = []
  let order = 0
  for (const source of sources) {
    for (const binding of source.bindings()) {
      order += 1
      if (!binding || binding.disabled || typeof binding.keys !== 'string') continue
      if (event.repeat && !binding.repeat) continue
      const depth = scopeDepth(source, binding.scope, path)
      if (depth < 0) continue
      for (const sequence of parseShortcut(binding.keys)) {
        if (editable && !binding.allowInInputs && !isChord(sequence.strokes[0])) continue
        candidates.push({ source, binding, sequence, depth, order })
      }
    }
  }
  return candidates
}

const byPriority = (a: Candidate, b: Candidate) => a.depth - b.depth || a.order - b.order

function handleKeydown(event: KeyboardEvent) {
  // A pressed modifier on its own is part of the next stroke, not a stroke.
  if (MODIFIER_KEYS.has((event.key ?? '').toLowerCase())) return
  // A component that already handled the key (a list's arrow keys, a menu's typeahead) keeps it.
  if (event.defaultPrevented) {
    clearPending()
    return
  }
  const apple = isApplePlatform()
  const candidates = eligibleCandidates(event)
  const completed: Candidate[] = []
  const advanced: { candidate: Candidate; progress: number }[] = []

  // Sequences already under way come first: after ⌘K, ⌘S completes `mod+k mod+s` rather than a lone `mod+s` binding.
  for (const { candidate, progress } of pending) {
    const still = candidates.find((c) => c.binding === candidate.binding && c.sequence === candidate.sequence)
    if (!still || !matchesStroke(candidate.sequence.strokes[progress], event, apple)) continue
    if (progress + 1 === candidate.sequence.strokes.length) completed.push(still)
    else advanced.push({ candidate: still, progress: progress + 1 })
  }
  if (!completed.length) {
    for (const candidate of candidates) {
      if (!matchesStroke(candidate.sequence.strokes[0], event, apple)) continue
      if (candidate.sequence.strokes.length === 1) completed.push(candidate)
      else advanced.push({ candidate, progress: 1 })
    }
  }

  if (completed.length) {
    clearPending()
    const winner = completed.sort(byPriority)[0]
    if (!winner.binding.allowDefault) event.preventDefault()
    winner.source.onMatch({ binding: winner.binding, keys: winner.sequence.source, event })
    return
  }
  clearPending()
  if (advanced.length) {
    pending = advanced
    pendingTimer = setTimeout(clearPending, SEQUENCE_TIMEOUT)
  }
}

/**
 * Registers `owner`'s bindings with the shared document listener and returns the function that unregisters them.
 * `bindings` is read on every key press, so the owner can change its bindings without registering again. When
 * several bindings match, the one scoped to the element closest to the focused node wins, then the one registered
 * first. The listener calls `preventDefault()` on the key event (unless `allowDefault`) before `onMatch`.
 */
export function registerShortcuts<B extends ShortcutBindingOptions>(
  owner: Element,
  bindings: () => readonly B[],
  onMatch: (match: ShortcutMatch<B>) => void,
): () => void {
  const source: ShortcutSource = { owner, bindings, onMatch: onMatch as (match: ShortcutMatch) => void }
  if (!sources.length && typeof document !== 'undefined') document.addEventListener('keydown', handleKeydown)
  sources.push(source)
  return () => {
    const index = sources.indexOf(source)
    if (index < 0) return
    sources.splice(index, 1)
    pending = pending.filter((entry) => entry.candidate.source !== source)
    if (!sources.length) {
      clearPending()
      document.removeEventListener('keydown', handleKeydown)
    }
  }
}
