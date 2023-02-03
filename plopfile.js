import { resolve } from 'path'

export default function (plop) {
  const rootPath = resolve(process.cwd(), pjson.lit?.basePath || '.')

  plop.setPrompt('fuzzypath', require('inquirer-fuzzy-path'))

  const baseActions = [
    {
      type: 'fuzzypath',
      name: 'directory',
      itemType: 'directory',
      excludePath: (nodePath) => {
        const exclude = ['.vscode', 'node_modules', '.git']
        return exclude.some((e) => nodePath.includes(e))
      },
      message: 'Choose a directory..',
      rootPath,
    },
  ]

  const context = {
    userConfig: pjson.lit,
  }

  const generators = ['component', 'directive', 'controller']

  for (const g of generators) {
    require(`./generators/${g}`)(plop, baseActions, context)
  }
}
