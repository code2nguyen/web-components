import { createHighlighterCore, createCssVariablesTheme } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { toRegExp, toRegExpDetails } from 'oniguruma-to-es'
import js from '@shikijs/langs/javascript'

window.runProbe = async () => {
  const out = { ua: navigator.userAgent, targets: {}, compile: {} }
  for (const target of ['auto', 'ES2018', 'ES2024', 'ES2025']) {
    for (const forgiving of [true, false]) {
      const key = `${target}/${forgiving ? 'forgiving' : 'strict'}`
      try {
        const core = await createHighlighterCore({
          engine: createJavaScriptRegexEngine(target === 'auto' ? { forgiving } : { forgiving, target }),
          themes: [createCssVariablesTheme({ name: 't', variablePrefix: '--_tok-', variableDefaults: {}, fontStyle: true })],
          langs: [js],
        })
        const { tokens } = core.codeToTokens('if (ok) {}', { lang: 'javascript', theme: 't' })
        out.targets[key] = tokens[0].map((t) => [t.content, t.color])
      } catch (e) {
        out.targets[key] = 'THROW ' + String(e && e.stack || e).slice(0, 600)
      }
    }
  }
  const pats = []
  const walk = (o) => { if (!o || typeof o !== 'object') return; for (const k of ['match', 'begin', 'end', 'while']) if (typeof o[k] === 'string') pats.push(o[k]); for (const v of Object.values(o)) walk(v) }
  walk(js)
  for (const target of ['ES2018', 'ES2024', 'ES2025']) {
    const errs = {}
    let fails = 0, examples = []
    for (const p of pats) {
      let details
      try { details = toRegExpDetails(p, { global: true, hasIndices: true, rules: { allowOrphanBackrefs: true, asciiWordBoundaries: true, captureGroup: true, recursionLimit: 5, singleline: true }, target }) }
      catch (e) { const m = 'translate: ' + String(e.message).slice(0, 100); errs[m] = (errs[m] || 0) + 1; continue }
      try { new RegExp(details.pattern, details.flags) }
      catch (e) { fails++; const m = 'native: ' + String(e.message).slice(0, 120); errs[m] = (errs[m] || 0) + 1; if (examples.length < 3) examples.push({ flags: details.flags, src: p.slice(0, 160), out: details.pattern.slice(0, 200) }) }
    }
    out.compile[target] = { patterns: pats.length, nativeFailures: fails, errors: errs, examples }
  }
  const feats = {}
  for (const [name, src, flags] of [['v', 'a', 'v'], ['d', 'a', 'd'], ['lookbehind', '(?<=a)b', ''], ['modifiers', '(?i:a)', ''], ['dupNamed', '(?<n>a)|(?<n>b)', ''], ['unicodeSetsOps', '[\\p{L}--[a-z]]', 'v'], ['namedBackrefV', '(?<n>a)\\k<n>', 'v']]) {
    try { new RegExp(src, flags); feats[name] = true } catch (e) { feats[name] = String(e.message) }
  }
  out.features = feats
  return out
}
