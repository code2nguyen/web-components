import { createConsumptionPath } from './style-contract-model.mjs'

/** A foreign variable read is legitimate only when it comes from a declared internal child's public contract or an exact host output write. */
export function classifyComposedCssRead({ parent, name, children }) {
  for (const childTag of parent.declaration.internalComponents ?? []) {
    if (!name.startsWith(`--${childTag}--`) && !name.startsWith(`--${childTag}__`)) continue
    const child = children.get(childTag)
    if (!child) continue
    if ((child.declaration.cssProperties ?? []).some((property) => property.name === name)) {
      return { mode: 'composed-child-public', childTag, name }
    }
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const producer = new RegExp(`\\bthis\\.style\\.setProperty\\(\\s*(['"])${escaped}\\1\\s*,`)
    if (producer.test(child.source)) return { mode: 'composed-child-output', childTag, name }
  }
  return null
}

/** Dynamic/inline uses are accepted only with an exact reviewed downstream sink. */
export function classifyNonCssConsumers({ tag, source, sourceFile, properties, mappings }) {
  const known = new Set(properties)
  const paths = []
  for (const mapping of mappings) {
    if (mapping.tag !== tag || !known.has(mapping.name)) continue
    if (!source.includes(mapping.name)) throw new Error(`${tag} ${mapping.name}: reviewed mapping is stale in ${sourceFile}`)
    if (!mapping.sink && mapping.mode !== 'delegated') throw new Error(`${tag} ${mapping.name}: reviewed mapping has no downstream sink`)
    paths.push(
      createConsumptionPath({
        tag,
        name: mapping.name,
        mode: mapping.mode,
        source: sourceFile,
        target: mapping.target,
        childTag: mapping.childTag,
        childProperty: mapping.childProperty,
        targetHost: mapping.targetHost,
      }),
    )
  }
  return paths
}
