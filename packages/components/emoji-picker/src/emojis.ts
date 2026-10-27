import { EMOJI_GROUPS, ENCODED_EMOJI } from './emoji-data'

/** One emoji the picker offers. */
export interface EmojiData {
  /** The emoji itself, without a skin tone. */
  emoji: string
  /** Its name, shown in the preview and read by screen readers. */
  name: string
  /** The category it is listed under, such as `smileys-emotion` or an id of your own. */
  group: string
  /** More words a search matches, beyond the words of its name. */
  keywords?: string[]
  /** The five skin-tone variants, from light to dark, when it has them. */
  skins?: string[]
}

/** The categories of the default set, in order. */
export const DEFAULT_EMOJI_GROUPS: readonly string[] = EMOJI_GROUPS

let parsed: EmojiData[] | undefined

/** The default set: Unicode emoji up to 15.1 with English names and keywords, from Emojibase. Parsed once, on first use. */
export function defaultEmojis(): EmojiData[] {
  parsed ??= EMOJI_GROUPS.flatMap((group) =>
    ENCODED_EMOJI[group].split('\n').map((line) => {
      const [emoji, name, keywords, skins] = line.split('\t')
      const entry: EmojiData = { emoji, name, group }
      if (keywords) entry.keywords = keywords.split(' ')
      if (skins) entry.skins = skins.split(' ')
      return entry
    }),
  )
  return parsed
}

/** Whether every word of `query` starts a word of the emoji's name or keywords; the lower the rank, the better the match. */
export function searchRank(entry: EmojiData, terms: string[]): number {
  const name = entry.name.toLowerCase()
  const words = name.split(/[^\p{L}\p{N}]+/u).concat(entry.keywords ?? [])
  let rank = 0
  for (const term of terms) {
    if (name.startsWith(term)) continue
    if (words.some((word) => word.startsWith(term))) {
      rank += 1
      continue
    }
    if (name.includes(term)) {
      rank += 2
      continue
    }
    return -1
  }
  return rank
}
