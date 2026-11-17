/**
 * File filtering shared by everything that takes files from people: a drop zone, a paste, a file picker. The rules are
 * those of the native file input (`accept="image/*,.pdf"`) plus the size and count limits uploaders add, so a component
 * checks a dropped or pasted file exactly as its `<input type="file">` would have offered it.
 *
 * Plain functions with no DOM access: they run on a server, in a worker and in `node --test`.
 */

/** Why a file was turned away: its type, its size, the count limit, or a second file where only one is allowed. */
export type FileRejectionReason = 'type' | 'size' | 'limit' | 'multiple'

export interface FileRejection {
  file: File
  reason: FileRejectionReason
}

/** The limits a set of incoming files is checked against. Every rule is optional; none means every file is taken. */
export interface FileRules {
  /** Comma-separated MIME types (`image/png`), wildcards (`image/*`) or extensions (`.pdf`), as the native `accept`. */
  accept?: string
  /** Largest size of one file in bytes. Zero or absent means no limit. */
  maxSize?: number
  /** Most files in all, counting `existing`. Zero or absent means no limit. */
  maxFiles?: number
  /** Whether more than one file may be taken. Absent means yes. */
  multiple?: boolean
  /** Files already taken: they count toward `maxFiles`, and with `multiple: false` every incoming file is a second one. */
  existing?: number
}

export interface FileFilterResult {
  accepted: File[]
  rejected: FileRejection[]
}

/** The `accept` list as lowercase rules, empty entries dropped. */
export function parseAccept(accept: string | undefined): string[] {
  return (accept ?? '')
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Whether a file matches an `accept` list the way the native file input reads it: an extension rule (`.pdf`) matches
 * the end of the name, a wildcard (`image/*`) the MIME family, any other rule the exact MIME type. An empty list
 * accepts everything.
 */
export function matchesAccept(file: Pick<File, 'name' | 'type'>, accept: string | undefined): boolean {
  const rules = parseAccept(accept)
  if (!rules.length) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule)
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1))
    return type === rule
  })
}

/**
 * Whether a dragged item may be accepted, from its MIME type alone: what a `dragover` can read before the drop (the
 * names are hidden until then). `undefined` when the type cannot tell, because the item has no type or the list has
 * extension rules only; a drop zone then treats the item as welcome and checks the file itself on drop.
 */
export function mayAcceptType(type: string, accept: string | undefined): boolean | undefined {
  const rules = parseAccept(accept)
  if (!rules.length) return true
  const mime = type.toLowerCase()
  if (!mime) return undefined
  const typeRules = rules.filter((rule) => !rule.startsWith('.'))
  const matched = typeRules.some((rule) => (rule.endsWith('/*') ? mime.startsWith(rule.slice(0, -1)) : mime === rule))
  if (matched) return true
  // An extension rule may still match the file's name, which a drag does not show.
  return typeRules.length === rules.length ? false : undefined
}

/**
 * Splits incoming files into those the rules take and those they turn away, in order. A file is checked against, in
 * turn: a second file where only one is allowed, the count limit, the type, then the size; the first rule it breaks
 * is its reason.
 */
export function filterFiles(files: Iterable<File>, rules: FileRules = {}): FileFilterResult {
  const accepted: File[] = []
  const rejected: FileRejection[] = []
  const single = rules.multiple === false
  const existing = rules.existing ?? 0
  const available = rules.maxFiles && rules.maxFiles > 0 ? Math.max(0, rules.maxFiles - existing) : Number.POSITIVE_INFINITY
  let index = 0
  for (const file of files) {
    let reason: FileRejectionReason | undefined
    if (single && (existing > 0 || index > 0)) reason = 'multiple'
    else if (accepted.length >= available) reason = 'limit'
    else if (!matchesAccept(file, rules.accept)) reason = 'type'
    else if (rules.maxSize && rules.maxSize > 0 && file.size > rules.maxSize) reason = 'size'
    if (reason) rejected.push({ file, reason })
    else accepted.push(file)
    index += 1
  }
  return { accepted, rejected }
}
