/* eslint-disable no-case-declarations */
export function customLitCemPlugin() {
  return {
    // Make sure to always give your plugins a name, this helps when debugging
    name: 'custom-lit-cem-plugin',
    // Runs for each module
    analyzePhase({ ts, node, moduleDoc, context }) {
      switch (node.kind) {
        case ts.SyntaxKind.ClassDeclaration:
          const className = node.name.getText()
          const classDeclaration = moduleDoc.declarations.find((declaration) => declaration.name === className)
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
      }
    },
  }
}
