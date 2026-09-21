import { readFileSync } from 'node:fs'

import Ajv2020 from 'ajv/dist/2020.js'

const decisions = new Set(['part', 'variables', 'assigned-content', 'delegated'])
const genericPartDescription = /^Shadow DOM styling hook for the .+ element\.$/
const schema = JSON.parse(readFileSync(new URL('../data/slot-styling-audit.schema.json', import.meta.url), 'utf8'))
const validateRegistrySchema = new Ajv2020({ allErrors: true }).compile(schema)

export function mergeSlotStylingAuditEntries(elements, reviewedEntries = []) {
  const reviewedBySlot = new Map(reviewedEntries.map((entry) => [key(entry.tag, entry.slot), entry]))
  const entries = []

  for (const element of [...elements].sort((a, b) => a.tag.localeCompare(b.tag))) {
    for (const slot of [...element.slots].sort()) {
      const reviewed = reviewedBySlot.get(key(element.tag, slot))
      if (reviewed) {
        entries.push(structuredClone(reviewed))
        continue
      }

      const candidates = slot ? [slot] : ['body', 'content']
      if (['empty', 'loading', 'error'].includes(slot)) candidates.push('state')
      const part = candidates.find((name) => element.parts[name] && !genericPartDescription.test(element.parts[name]))
      entries.push(
        part
          ? {
              tag: element.tag,
              slot,
              decision: 'part',
              parts: [part],
              reason: `The semantic ${part} region owns the ${slot || 'default'} slot's component-side presentation.`,
            }
          : {
              tag: element.tag,
              slot,
              decision: 'assigned-content',
              reason: `The ${slot || 'default'} slot projects consumer-owned light DOM; style the assigned node through its own class or public contract.`,
            },
      )
    }
  }

  return entries
}

export function manifestElements(packages) {
  const elements = []
  for (const manifest of packages) {
    for (const module of manifest.modules ?? []) {
      for (const declaration of module.declarations ?? []) {
        if (!declaration.tagName) continue
        elements.push({
          tag: declaration.tagName,
          slots: (declaration.slots ?? []).map((slot) => slot.name ?? ''),
          parts: Object.fromEntries((declaration.cssParts ?? []).map((part) => [part.name, part.description ?? ''])),
          variables: (declaration.cssProperties ?? []).map((property) => property.name),
        })
      }
    }
  }
  return elements
}

export function validateSlotStylingAudit({ registry, elements }) {
  const errors = []
  if (!validateRegistrySchema(registry)) {
    errors.push(...validateRegistrySchema.errors.map((error) => `Schema ${error.instancePath || '/'} ${error.message}.`))
  }
  if (!registry || registry.version !== 1 || !Array.isArray(registry.entries)) {
    return { errors: [...errors, 'Slot styling audit must have version 1 and an entries array.'], stats: { slots: 0, entries: 0, decisions: {} } }
  }

  const elementsByTag = new Map(elements.map((element) => [element.tag, element]))
  const slots = new Map()
  for (const element of elements) {
    for (const slot of element.slots ?? []) slots.set(key(element.tag, slot), { tag: element.tag, slot })
  }

  const entries = new Map()
  const slotsByPart = new Map()
  const decisionStats = Object.fromEntries([...decisions].map((decision) => [decision, 0]))

  for (const entry of registry.entries) {
    if (entry?.decision !== 'part') continue
    for (const part of entry.parts ?? []) {
      const partKey = `${entry.tag}\u0000${part}`
      slotsByPart.set(partKey, [...(slotsByPart.get(partKey) ?? []), entry.slot])
    }
  }

  for (const [index, entry] of registry.entries.entries()) {
    const label = display(entry?.tag, entry?.slot)
    if (!entry || typeof entry !== 'object') {
      errors.push(`Audit entry ${index + 1} must be an object.`)
      continue
    }
    if (typeof entry.tag !== 'string' || typeof entry.slot !== 'string') errors.push(`Audit entry ${index + 1} requires string tag and slot fields.`)
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) errors.push(`Audit entry ${label} requires a non-empty reason.`)
    if (!decisions.has(entry.decision)) {
      errors.push(`Audit entry ${label} has unknown decision ${JSON.stringify(entry.decision)}.`)
      continue
    }
    decisionStats[entry.decision] += 1

    const entryKey = key(entry.tag, entry.slot)
    if (entries.has(entryKey)) errors.push(`Duplicate audit entry for ${label}.`)
    else entries.set(entryKey, entry)

    if (!slots.has(entryKey)) errors.push(`Stale audit entry for ${label}; the published slot does not exist.`)

    const element = elementsByTag.get(entry.tag)
    validateDecision(entry, element, elementsByTag, slotsByPart, label, errors)
  }

  for (const { tag, slot } of slots.values()) {
    if (!entries.has(key(tag, slot))) errors.push(`Missing audit entry for ${display(tag, slot)}.`)
  }

  return {
    errors,
    stats: { slots: slots.size, entries: registry.entries.length, decisions: decisionStats },
  }
}

function validateDecision(entry, element, elementsByTag, slotsByPart, label, errors) {
  const present = (field) => Object.hasOwn(entry, field)
  const nonEmptyStrings = (value) => Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim())

  if (entry.decision === 'part') {
    if (!nonEmptyStrings(entry.parts)) errors.push(`Part decision ${label} requires a non-empty parts array.`)
    if (present('variables') || present('delegateTag')) errors.push(`Part decision ${label} forbids variables and delegateTag fields.`)
    for (const part of entry.parts ?? []) {
      if (!Object.hasOwn(element?.parts ?? {}, part)) {
        errors.push(`Part decision ${label} references unknown part ${part}.`)
        continue
      }
      const description = element.parts[part]?.trim() ?? ''
      if (!description) errors.push(`Part ${entry.tag}::${part} has no description.`)
      else if (genericPartDescription.test(description))
        errors.push(`Part ${entry.tag}::${part} has a generic description; describe its slot region and states explicitly.`)
      else validatePartDescription(entry.tag, part, slotsByPart.get(`${entry.tag}\u0000${part}`) ?? [entry.slot], description, errors)
    }
  } else if (entry.decision === 'variables') {
    if (!nonEmptyStrings(entry.variables)) errors.push(`Variables decision ${label} requires a non-empty variables array.`)
    if (present('parts') || present('delegateTag')) errors.push(`Variables decision ${label} forbids parts and delegateTag fields.`)
    for (const variable of entry.variables ?? []) {
      if (!(element?.variables ?? []).includes(variable)) errors.push(`Variables decision ${label} references unknown variable ${variable}.`)
    }
  } else if (entry.decision === 'delegated') {
    if (typeof entry.delegateTag !== 'string' || !entry.delegateTag.trim()) errors.push(`Delegated decision ${label} requires delegateTag.`)
    else if (!elementsByTag.has(entry.delegateTag)) errors.push(`Delegated decision ${label} references unknown tag ${entry.delegateTag}.`)
    if (present('parts') || present('variables')) errors.push(`Delegated decision ${label} forbids parts and variables fields.`)
  } else if (present('parts') || present('variables') || present('delegateTag')) {
    errors.push(`Assigned-content decision ${label} forbids parts, variables, and delegateTag fields.`)
  }
}

function validatePartDescription(tag, part, slots, description, errors) {
  const normalized = description.toLowerCase()
  const label = `${tag}::${part}`
  const missingSlots = slots.filter((slot) => {
    if (!slot) return !normalized.includes('default slot')
    if (slot.includes('*')) {
      const family = slot.replace(/\*+$/, '').replace(/[-_:]+$/, '')
      return !(normalized.includes('dynamic') && normalized.includes(family) && normalized.includes('slot'))
    }
    const escaped = slot.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return !new RegExp(`(?:${escaped}.{0,40}slot|slot.{0,40}${escaped})`).test(normalized)
  })
  if (missingSlots.length) {
    errors.push(`Part ${label} description must identify its related ${missingSlots.map((slot) => slot || 'default').join(', ')} slot.`)
  }
  if (!/(region|wrapper|container|column|row|layer|cell|boundary|panel|button|marker|indicator|bubble|box|control|content|placement|field|text|icon)/.test(normalized)) {
    errors.push(`Part ${label} description must identify the component-owned region it controls.`)
  }
  if (!/\bslots?\b/.test(normalized) || !/(wrap|contain|project|assign|fallback|replac|expos|placement|inside|around|from)/.test(normalized)) {
    errors.push(`Part ${label} description must explain slot placement and fallback versus assigned-content behavior.`)
  }
}

function key(tag, slot) {
  return `${tag}\u0000${slot}`
}

function display(tag, slot) {
  return `${tag ?? '(missing tag)'} slot ${slot ? JSON.stringify(slot) : '(default)'}`
}
