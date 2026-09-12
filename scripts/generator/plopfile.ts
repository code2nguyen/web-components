import { NodePlopAPI } from 'plop'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { version: packageVersion } = JSON.parse(readFileSync(resolve(repositoryRoot, 'lerna.json'), 'utf8')) as { version: string }

export default function (plop: NodePlopAPI) {
  plop.setGenerator('wc', {
    description: 'generate web component',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'wc name(ex: Dropdown List):',
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
            {
              type: 'append',
              path: '../../apps/ui/src/store/component-manifests.ts',
              pattern: /\n/,
              separator: '',
              template: "import {{ camelCase name }} from '@c2n/{{ dashCase name }}/custom-elements.json'\n",
            },
            {
              type: 'append',
              path: '../../apps/ui/src/store/component-manifests.ts',
              pattern: /const normalizedManifests: ComponentManifests = \[/,
              template: '    {{ camelCase name }},',
            },
            {
              // Without this the app resolves the package only by workspace hoisting, and `npm run ui:build`
              // fails on a clean install with "failed to resolve import @c2n/<name>/custom-elements.json".
              type: 'append',
              path: '../../apps/ui/package.json',
              pattern: /"dependencies": \{/,
              template: '    "@c2n/{{ dashCase name }}": "*",',
            },
            {
              // Registers the element for pages that render markup as plain HTML instead of hydrating islands.
              type: 'append',
              path: '../../apps/ui/src/data/component-modules.ts',
              pattern: /^ \*\/$/m,
              template: "import '@c2n/{{ dashCase name }}'",
            },
            {
              type: 'append',
              path: '../../apps/ui/src/data/component-previews.ts',
              pattern: /export const componentPreviews: Record<string, string> = \{/,
              // Quoted because a dash-cased id is not a bare identifier; prettier drops the quotes when it can.
              template: "  '{{ dashCase name }}': `<c2-{{ dashCase name }}></c2-{{ dashCase name }}>`,",
            },
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

        {
          type: 'append',
          path: '../../package.json',
          pattern: /build.*\n?.*dependencies": \[/,
          template: `        "./${packages}/{{ dashCase name }}:build",`,
        },
        {
          // @c2n/theme reads every component manifest, so its build must run after the new component's build.
          type: 'append',
          path: '../../packages/tools/theme/package.json',
          pattern: /"dependencies": \[\n\s*"type-check",/,
          template: `        "${isNpmPackage ? '../../components' : '../../../open-packages'}/{{ dashCase name }}:build",`,
        },
      ]
    },
  })
}
