import { taskIconCatalog, type TaskIconName } from './task-icon-names'

// Words that say nothing about the subject of a task.
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'up',
  'with',
  'my',
  'our',
  'new',
  'go',
  'do',
  'get',
  'make',
  'take',
  'out',
  'off',
  'have',
  'need',
  'it',
  'this',
  'that',
  'some',
  'all',
  'today',
  'tomorrow',
])

let index: Map<string, TaskIconName[]> | undefined

function keywordIndex(): Map<string, TaskIconName[]> {
  if (index) return index
  index = new Map()
  for (const { name, keywords } of taskIconCatalog) {
    for (const keyword of [name, ...keywords]) {
      const names = index.get(keyword) ?? []
      if (!names.includes(name)) names.push(name)
      index.set(keyword, names)
    }
  }
  return index
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9:]+/)
    .filter((word) => word && !STOP_WORDS.has(word))
}

/**
 * Pick the task icon whose keywords best match a piece of text, such as a task label: `"Call the dentist"` gives
 * `tooth`, `"Buy oat milk"` gives `cart`. Earlier words weigh more, since a task usually starts with its verb or
 * subject, and a word matches a keyword it starts with once it is four letters long (`"meetings"` → `meeting`).
 * Returns `undefined` when nothing matches.
 */
export function suggestTaskIcon(text: string): TaskIconName | undefined {
  const keywords = keywordIndex()
  const scores = new Map<TaskIconName, number>()
  const tokens = words(text)
  tokens.forEach((word, position) => {
    const weight = 1 + 1 / (position + 1)
    const exact = keywords.get(word)
    const matches: [TaskIconName[], number][] = exact ? [[exact, weight * 2]] : []
    if (!exact && word.length >= 4) {
      for (const [keyword, names] of keywords) {
        if (keyword.length >= 4 && (keyword.startsWith(word) || word.startsWith(keyword))) matches.push([names, weight])
      }
    }
    for (const [names, score] of matches) {
      // A keyword shared by several icons is weaker evidence for each of them.
      for (const name of names) scores.set(name, (scores.get(name) ?? 0) + score / names.length)
    }
  })
  let best: TaskIconName | undefined
  let bestScore = 0
  for (const [name, score] of scores) {
    if (score > bestScore) {
      best = name
      bestScore = score
    }
  }
  return best
}
