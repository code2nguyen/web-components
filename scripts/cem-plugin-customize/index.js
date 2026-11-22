/* eslint-disable no-case-declarations */
export function customLitCemPlugin() {
  const partDescription = (name) => `Shadow DOM styling hook for the ${name.replaceAll('-', ' ')} element.`
  // Classes tagged `@owntemplate` extend a component but draw a template of their own (`c2-image-uploader` over
  // `c2-upload`): the superclass's slots, CSS parts and CSS variables do not reach their shadow DOM, so the manifest
  // keeps only what the class documents itself. Members, attributes and events are still inherited.
  // Declaration → the slot, CSS part and CSS variable names it documents itself, taken before inheritance.
  const ownTemplates = new Map()

  return {
    // Make sure to always give your plugins a name, this helps when debugging
    name: 'custom-lit-cem-plugin',
    // Runs for each module
    analyzePhase({ ts, node, moduleDoc }) {
      switch (node.kind) {
        case ts.SyntaxKind.ClassDeclaration:
          const className = node.name.getText()
          const classDeclaration = moduleDoc.declarations.find((declaration) => declaration.name === className)
          if (!classDeclaration) break
          node.jsDoc?.forEach((jsDoc) => {
            jsDoc.tags?.forEach((tag) => {
              if (tag.tagName.getText() === 'internalcomponent') {
                classDeclaration.internalComponents = classDeclaration.internalComponents ?? []
                classDeclaration.internalComponents.push(tag.comment)
              } else if (tag.tagName.getText() === 'slotcomponent') {
                classDeclaration.slotComponents = classDeclaration.slotComponents ?? []
                classDeclaration.slotComponents.push(tag.comment)
              } else if (tag.tagName.getText() === 'owntemplate') {
                ownTemplates.set(classDeclaration, undefined)
              }
            })
          })

          // The analyzer handles @csspart, but most c2n components already declare literal `part` attributes in
          // their Lit templates. Keep the manifest synchronized with those real hooks instead of requiring a second
          // hand-maintained list. Explicit @csspart descriptions win when present.
          const source = node.getText()
          const names = new Set()
          for (const match of source.matchAll(/(?<![\w-])part\s*=\s*"([^"]+)"/g)) {
            for (const name of match[1].split(/\s+/)) if (/^[a-z][a-z0-9-]*$/.test(name)) names.add(name)
          }
          for (const match of source.matchAll(/(?<![\w-])part\s*=\s*\$\{([^}]+)\}/g)) {
            for (const quoted of match[1].matchAll(/['"]([^'"]+)['"]/g)) {
              // A conditional binding can contain quoted comparison values that are not part names, e.g.
              // `part=${state === 'ready' ? 'editor' : nothing}`. Only collect strings that can contribute to the
              // binding's result; otherwise `ready` would be documented as a CSS part that never exists.
              const before = match[1].slice(0, quoted.index)
              if (/(?:===|!==|==|!=)\s*$/.test(before)) continue
              for (const name of quoted[1].split(/\s+/)) if (/^[a-z][a-z0-9-]*$/.test(name)) names.add(name)
            }
          }
          if (names.size) {
            classDeclaration.cssParts = classDeclaration.cssParts ?? []
            for (const name of names) {
              if (!classDeclaration.cssParts.some((part) => part.name === name)) {
                classDeclaration.cssParts.push({ name, description: partDescription(name) })
              }
            }
          }
      }
    },
    // Runs once for the whole package, after inheritance has been applied.
    packageLinkPhase() {
      for (const [declaration, own] of ownTemplates) {
        for (const key of ['slots', 'cssParts', 'cssProperties']) {
          if (!declaration[key]) continue
          declaration[key] = declaration[key].filter((entry) => own?.has(`${key}:${entry.name}`))
          for (const entry of declaration[key]) delete entry.inheritedFrom
          if (declaration[key].length === 0) delete declaration[key]
        }
      }
    },
    // Runs once per module, after every analyze phase.
    moduleLinkPhase({ moduleDoc }) {
      for (const declaration of moduleDoc.declarations ?? []) {
        if (ownTemplates.has(declaration)) {
          const keys = ['slots', 'cssParts', 'cssProperties'].flatMap((key) => (declaration[key] ?? []).map((entry) => `${key}:${entry.name}`))
          ownTemplates.set(declaration, new Set(keys))
        }
        // `dispatchEvent(new CustomEvent(COLUMN_CHANGE_EVENT))` is recorded under the constant's *name*, since the
        // analyzer does not resolve identifiers. Every such event is an undocumented protocol between a component
        // and its parent (`c2-table-column` → `c2-table`, a pager → its host), not public API — a documented one has
        // an `@event` line with its real name — so the manifest drops it rather than publish a name nobody fires.
        if (declaration.events) {
          declaration.events = declaration.events.filter((event) => !/^[A-Z_$][A-Z0-9_$]*$/.test(event.name ?? ''))
          if (declaration.events.length === 0) delete declaration.events
        }
        for (const attribute of declaration.attributes ?? []) {
          // The analyzer names an attribute after the field when `@property()` carries no explicit `attribute`
          // option, but Lit derives the observed attribute by *lowercasing* the property name: `readOnly` is
          // observed as `readonly`, `maxLength` as `maxlength`. Emitting the property spelling makes anything
          // generating markup from the manifest (framework types, IDE metadata, an agent) write a name the
          // component never sees; it only ever appeared to work because HTML lowercases attributes too.
          // `fieldName` keeps the property spelling, so both names stay available.
          if (attribute.name === attribute.fieldName && attribute.name !== attribute.name.toLowerCase()) {
            attribute.name = attribute.name.toLowerCase()
          }
        }
      }
    },
  }
}
