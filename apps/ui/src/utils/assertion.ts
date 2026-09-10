import type { AstroGlobal, Props } from 'astro'
import type { AstroComponentFactory } from 'astro/runtime/server/index.js'

declare const Astro: Readonly<AstroGlobal<Props, AstroComponentFactory, Record<string, string | undefined>>>

export function requireNotNull<T>(value: T): NonNullable<T> {
  if (!value) {
    Astro.redirect('/404')
    throw Error('null value exception')
  }
  return value
}
