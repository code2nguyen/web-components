import { createApprovedException, propertyKey } from './style-contract-model.mjs'

function validDate(value, field, identity) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${identity}: invalid ${field} date`)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${identity}: invalid ${field} date`)
  return value
}

/** Exceptions do not waive source/manifest agreement or a normal component-owned CSS path. */
export function validateApprovedExceptions({ exceptions, inventory, cssPaths = [], now = new Date().toISOString().slice(0, 10) }) {
  const known = new Set(inventory.map((property) => propertyKey(property.tag, property.name)))
  const seen = new Set()
  validDate(now, 'current', 'exception review')
  return exceptions.map((entry) => {
    const exception = createApprovedException(entry)
    const identity = `${exception.tag} ${exception.name}`
    const key = propertyKey(exception.tag, exception.name)
    if (!known.has(key)) throw new Error(`${identity}: stale exception property`)
    if (seen.has(key)) throw new Error(`${identity}: duplicate exception property`)
    seen.add(key)
    const reviewed = validDate(exception.reviewedOn, 'reviewedOn', identity)
    const reassess = validDate(exception.reassessOn, 'reassessOn', identity)
    if (reassess <= reviewed) throw new Error(`${identity}: reassessOn must be after review date`)
    if (reviewed > now) throw new Error(`${identity}: review date is in the future`)
    if (reassess < now) throw new Error(`${identity}: expired exception review`)
    if (cssPaths.some((path) => path.tag === exception.tag && path.name === exception.name)) {
      throw new Error(`${identity}: ordinary component-owned shadow styling cannot receive an exception`)
    }
    return exception
  })
}
