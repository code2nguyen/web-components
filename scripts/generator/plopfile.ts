import type { ActionConfig, NodePlopAPI } from 'plop'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { insertIntoJson, insertIntoText, registries } from './sorted-lists.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { version: packageVersion } = JSON.parse(readFileSync(resolve(repositoryRoot, 'lerna.json'), 'utf8')) as { version: string }

type Registry = keyof typeof registries
type RegisterConfig = { registry: Registry; template?: string; key?: string; value?: unknown }
// plop types its built-in actions only; a custom type rides on the base config.
const register = (config: RegisterConfig) => ({ type: 'register', ...config }) as ActionConfig

export default function (plop: NodePlopAPI) {
  // Adds an entry to one of the registries every new component joins, at its alphabetical place, so two component PRs
  // open at once touch different lines (see sorted-lists.ts). `template` is the line of a source list or the string of
  // a JSON array; a JSON object such as `dependencies` takes `key` and `value` instead.
  plop.setActionType('register', (answers, config) => {
    const { registry, template, key, value } = config as unknown as RegisterConfig
    const target = registries[registry]
    const file = resolve(repositoryRoot, target.file)
    const text = readFileSync(file, 'utf8')
    const render = (source: string) => plop.renderString(source, answers)
    const next =
      'list' in target
        ? insertIntoText(text, target.list, render(template!))
        : insertIntoJson(text, target.path, key === undefined ? render(template!) : [render(key), value])
    writeFileSync(file, next)
    return `${target.file}: ${registry}`
  })

  plop.setGenerator('example', {
    description: 'generate a plain HTML example application',
    prompts: [
      { type: 'input', name: 'name', message: 'example id (ex: market-overview):' },
      { type: 'input', name: 'title', message: 'display title:' },
      { type: 'input', name: 'description', message: 'description:' },
    ],
    actions: [
      {
        type: 'addMany',
        destination: '../../apps/examples/{{dashCase name}}',
        base: 'files/example',
        templateFiles: 'files/example/**/*.*',
        skipIfExists: true,
      },
      register({ registry: 'examplesBuild', template: './apps/examples/{{ dashCase name }}:build' }),
    ],
  })

  plop.setGenerator('wc', {
    description: 'generate web component',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'wc name(ex: Status Panel):',
      },
      {
        type: 'list',
        name: 'package_type',
        message: 'Select package type',
        choices: ['npm package', 'open package'],
      },
    ],
    actions: function (data) {
      const { package_type } = data as { package_type: string }
      const isNpmPackage = package_type === 'npm package'
      // npm packages live at packages/components/<name>, open packages at open-packages/<name>,
      // so the two differ by one directory level for every repo-relative path below.
      const packages = isNpmPackage ? 'packages/components' : 'open-packages'
      const demo_content_folder = isNpmPackage ? 'components' : 'oepn-components'
      const templateData = data as Record<string, unknown>
      templateData.packageVersion = packageVersion
      templateData.coreBuildDep = isNpmPackage ? '../../core:build' : '../../packages/core:build'
      templateData.cemPluginPath = isNpmPackage ? '../../../scripts/cem-plugin-customize/index' : '../../scripts/cem-plugin-customize/index'
      // Everything below is UI-app wiring, which only exists for npm packages: `open-packages/*` are not an Astro
      // collection (see the caveat in the new-component skill).
      const actions = isNpmPackage
        ? [
            register({ registry: 'manifestImports', template: "import {{ camelCase name }} from '@c2n/{{ dashCase name }}/custom-elements.json'" }),
            register({ registry: 'normalizedManifests', template: '    {{ camelCase name }},' }),
            // Without this the app resolves the package only by workspace hoisting, and `npm run ui:build`
            // fails on a clean install with "failed to resolve import @c2n/<name>/custom-elements.json".
            register({ registry: 'uiDependencies', key: '@c2n/{{ dashCase name }}', value: '*' }),
            // Registers the element for pages that render markup as plain HTML instead of hydrating islands.
            register({ registry: 'componentModules', template: "import '@c2n/components/{{ dashCase name }}'" }),
            // Quoted because a dash-cased id is not a bare identifier; prettier drops the quotes when it can.
            register({ registry: 'componentPreviews', template: "  '{{ dashCase name }}': `<c2-{{ dashCase name }}></c2-{{ dashCase name }}>`," }),
            {
              type: 'add',
              path: '../../apps/ui/src/content/gallery/{{dashCase name}}.mdx',
              templateFile: 'files/gallery-doc.mdx.hbs',
              skipIfExists: true,
            },
          ]
        : []
      return [
        ...actions,
        {
          type: 'addMany',
          destination: `../../${packages}/{{dashCase name}}`,
          base: 'files/wc',
          templateFiles: 'files/wc/**/*.*',
          skipIfExists: true,
        },
        {
          type: 'addMany',
          destination: `../../${packages}/{{dashCase name}}/test`,
          base: 'files/wc-test',
          templateFiles: 'files/wc-test/**/*.*',
          skipIfExists: true,
        },
        {
          type: 'add',
          path: `../../apps/ui/src/content/${demo_content_folder}/{{dashCase name}}.mdx`,
          templateFile: 'files/demo-doc.mdx.hbs',
          skipIfExists: true,
        },

        register({ registry: 'rootBuild', template: `./${packages}/{{ dashCase name }}:build` }),
        // @c2n/theme reads every component manifest, so its build must run after the new component's build.
        register({ registry: 'themeBuild', template: `${isNpmPackage ? '../../components' : '../../../open-packages'}/{{ dashCase name }}:build` }),
      ]
    },
  })
}
