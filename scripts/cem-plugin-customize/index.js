/* eslint-disable no-case-declarations */
export function customLitCemPlugin() {
  const partDescription = (name) => `Shadow DOM styling hook for the ${name.replaceAll('-', ' ')} element.`

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
              }
            })
          })

          // The analyzer handles @csspart, but most c2n components already declare literal `part` attributes in
          // their Lit templates. Keep the manifest synchronized with those real hooks instead of requiring a second
          // hand-maintained list. Explicit @csspart descriptions win when present.
          const source = node.getText()
          const names = new Set()
          for (const match of source.matchAll(/\bpart\s*=\s*"([^"]+)"/g)) {
            for (const name of match[1].split(/\s+/)) if (/^[a-z][a-z0-9-]*$/.test(name)) names.add(name)
          }
          for (const match of source.matchAll(/\bpart\s*=\s*\$\{([^}]+)\}/g)) {
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
    // Runs once per module, after every analyze phase.
    moduleLinkPhase({ moduleDoc }) {
      for (const declaration of moduleDoc.declarations ?? []) {
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
