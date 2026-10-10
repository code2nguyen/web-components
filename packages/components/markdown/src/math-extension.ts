import type { TokenizerExtension } from 'marked'

/** Which math delimiters are recognised: all of them, only the backslash forms (text full of prices), or none. */
export type MathMode = 'dollar' | 'bracket' | 'off'

export interface MathToken {
  type: 'mathBlock' | 'mathInline'
  raw: string
  text: string
  display: boolean
}

/** `$$…$$` or `\[…\]` starting a line: a display formula block. */
const BLOCK_DOLLAR = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/
const BLOCK_BRACKET = /^ {0,3}\\\[([\s\S]+?)\\\][ \t]*(?:\n+|$)/
/** `\(…\)` inline. */
const INLINE_PAREN = /^\\\(([\s\S]+?)\\\)/
/** `$$…$$` inside a line: a display formula in the text flow. */
const INLINE_DISPLAY = /^\$\$((?:\\[\s\S]|[^\\$])+?)\$\$/
/**
 * `$…$` by Pandoc's rule, so prices stay text: the opening `$` is followed by a non-space, the closing `$` follows a
 * non-space and is not followed by a digit, and an escaped `\$` never delimits. `$5 and $10` is therefore text.
 */
const INLINE_DOLLAR = /^\$(?=\S)((?:\\[\s\S]|[^\\$\n])+?)(?<=\S)\$(?!\d)/

function blockExtension(mode: MathMode): TokenizerExtension {
  return {
    name: 'mathBlock',
    level: 'block',
    start(src) {
      const match = (mode === 'dollar' ? /^ {0,3}(?:\$\$|\\\[)/m : /^ {0,3}\\\[/m).exec(src)
      return match?.index
    },
    tokenizer(src) {
      const match = (mode === 'dollar' ? BLOCK_DOLLAR.exec(src) : null) ?? BLOCK_BRACKET.exec(src)
      if (!match) return undefined
      return { type: 'mathBlock', raw: match[0], text: match[1].trim(), display: true } satisfies MathToken
    },
  }
}

function inlineExtension(mode: MathMode): TokenizerExtension {
  return {
    name: 'mathInline',
    level: 'inline',
    start(src) {
      const match = (mode === 'dollar' ? /\$|\\\(/ : /\\\(/).exec(src)
      return match?.index
    },
    tokenizer(src) {
      let match = INLINE_PAREN.exec(src)
      if (match) return { type: 'mathInline', raw: match[0], text: match[1].trim(), display: false } satisfies MathToken
      if (mode !== 'dollar') return undefined
      match = INLINE_DISPLAY.exec(src)
      if (match) return { type: 'mathInline', raw: match[0], text: match[1].trim(), display: true } satisfies MathToken
      match = INLINE_DOLLAR.exec(src)
      if (match) return { type: 'mathInline', raw: match[0], text: match[1], display: false } satisfies MathToken
      return undefined
    },
  }
}

/** marked tokenizer extensions for the given delimiters; empty when math is off. */
export function mathExtensions(mode: MathMode): TokenizerExtension[] {
  return mode === 'off' ? [] : [blockExtension(mode), inlineExtension(mode)]
}
