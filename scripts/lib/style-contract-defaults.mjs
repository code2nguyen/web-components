function normalizeHex(value) {
  return value.replace(/#([0-9a-f]{3})(?![0-9a-f])/gi, (_, short) => `#${[...short.toLowerCase()].map((digit) => digit + digit).join('')}`)
}

function normalizeRgb(value) {
  const hex = (red, green, blue) => `#${[red, green, blue].map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`
  return value
    .replace(
      /rgb\(\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*\/\s*(\d+(?:\.\d+)?)%\s*\)/gi,
      (_, red, green, blue, alpha) => `${hex(red, green, blue)} / ${Number(alpha) / 100}`,
    )
    .replace(
      /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d+(?:\.\d+)?)\s*\)/gi,
      (_, red, green, blue, alpha) => `${hex(red, green, blue)} / ${Number(alpha)}`,
    )
    .replace(/rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/gi, (_, red, green, blue) => hex(red, green, blue))
}

/** Normalize only CSS spellings whose equivalence is deterministic without layout or inheritance. */
export function normalizeCssValue(value) {
  if (value == null) return null
  return normalizeRgb(
    normalizeHex(
      String(value)
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*,\s*/g, ', '),
    ),
  ).toLowerCase()
}

export function resolveEffectiveDefaults(properties) {
  const byName = new Map(properties.map((property) => [property.name, property]))
  const resolved = new Map()
  const visiting = new Set()

  function resolve(name) {
    if (resolved.has(name)) return resolved.get(name)
    const property = byName.get(name)
    if (!property) throw new Error(`unresolved fallback reference ${name}`)
    if (visiting.has(name)) throw new Error(`cyclic fallback reference ${name}`)
    if (!Object.hasOwn(property, 'authoredDefault')) throw new Error(`${name}: authoredDefault must be explicit`)
    visiting.add(name)
    const authored = property.authoredDefault
    let effective = authored == null ? null : normalizeCssValue(authored)
    if (effective == null) {
      for (const reference of property.fallbackReferences ?? []) {
        const fallback = resolve(reference)
        if (fallback.effective != null) {
          effective = fallback.effective
          break
        }
      }
    } else {
      for (const reference of property.fallbackReferences ?? []) resolve(reference)
    }
    visiting.delete(name)
    const record = { authored, effective }
    resolved.set(name, record)
    return record
  }

  for (const property of properties) resolve(property.name)
  return resolved
}

/** Read the fallback belonging to one exact var() call, including nested fallback chains. */
export function compiledFallbacks(value, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = new RegExp(`var\\(\\s*${escaped}\\s*,`, 'g')
  const fallbacks = []
  for (const match of value.matchAll(expression)) {
    const start = match.index + match[0].length
    let depth = 1
    for (let index = start; index < value.length; index++) {
      if (value[index] === '(') depth++
      else if (value[index] === ')' && --depth === 0) {
        fallbacks.push(value.slice(start, index).trim())
        break
      }
    }
  }
  return fallbacks
}

function directReference(value) {
  const match = /^var\(\s*(--c2-[a-z0-9_-]+)\s*(?:,|\))/i.exec(value)
  return match?.[1] ?? null
}

function compiledEffective(fallback, resolved) {
  const reference = directReference(fallback)
  if (!reference) return normalizeCssValue(fallback)
  const nested = compiledFallbacks(fallback, reference)[0]
  return nested ? compiledEffective(nested, resolved) : (resolved.get(reference)?.effective ?? null)
}

function normalizeBoxDefault(value, property) {
  if (!['padding', 'margin'].includes(property.type) && !/--(?:padding|margin)$/.test(property.name)) return value
  if (value == null) return value
  const tokens = value.split(' ')
  return tokens.length > 1 && tokens.every((token) => token === tokens[0]) ? tokens[0] : value
}

/** Compare source defaults with the fallbacks actually shipped in rendered CSS declarations. */
export function compareCompiledDefaults({ tag, properties, paths }) {
  const failures = []
  const known = new Set(properties.map((property) => property.name))
  const candidates = new Map()
  for (const property of properties) {
    const ownPaths = paths.filter((path) => path.name === property.name && path.fallbackOrder?.[0] === property.name)
    const fallbacks = [...new Set(ownPaths.flatMap((path) => compiledFallbacks(path.value, property.name)))]
    candidates.set(property.name, { paths: ownPaths, fallbacks })
  }
  let resolved
  try {
    resolved = resolveEffectiveDefaults(
      properties.map((property) => ({
        name: property.name,
        authoredDefault: property.default ?? null,
        fallbackReferences: (candidates.get(property.name)?.fallbacks ?? []).map(directReference).filter((reference) => reference && known.has(reference)),
      })),
    )
  } catch (error) {
    failures.push({ tag, name: '', category: 'invalid-fallback', source: 'compiled CSS', observed: error.message })
    return failures
  }
  for (const property of properties) {
    if (property.default == null || property.default.includes('var(')) continue
    const expected = normalizeBoxDefault(resolved.get(property.name)?.effective ?? null, property)
    const { paths: ownPaths, fallbacks } = candidates.get(property.name)
    for (const fallback of fallbacks) {
      const reference = directReference(fallback)
      if (reference && !known.has(reference)) continue // External public contract: validated by its owning package.
      const observed = normalizeBoxDefault(compiledEffective(fallback, resolved), property)
      if (observed === expected) continue
      failures.push({
        tag,
        name: property.name,
        category: 'default-mismatch',
        source: ownPaths[0]?.source ?? 'compiled CSS',
        expected,
        observed,
        authored: property.default ?? null,
        compiled: fallback,
      })
    }
  }
  return failures
}
