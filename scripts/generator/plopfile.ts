import { NodePlopAPI } from 'plop'

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
      templateData.coreBuildDep = isNpmPackage ? '../../core:build' : '../../packages/core:build'
      templateData.cemPluginPath = isNpmPackage ? '../../../scripts/cem-plugin-customize/index' : '../../scripts/cem-plugin-customize/index'
      const actions = isNpmPackage
        ? [
            {
              type: 'append',
              path: '../../demo/src/store/component-manifests.ts',
              pattern: /\n/,
              separator: '',
              template: "import {{ camelCase name }} from '@c2n/{{ dashCase name }}/custom-elements.json'\n",
            },
            {
              type: 'append',
              path: '../../demo/src/store/component-manifests.ts',
              pattern: /const normalizedManifests: ComponentManifests = \[/,
              template: '    {{ camelCase name }},',
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
          type: 'add',
          path: `../../demo/src/content/${demo_content_folder}/{{dashCase name}}.mdx`,
          templateFile: 'files/demo-doc.mdx.hbs',
          skipIfExists: true,
        },

        {
          type: 'append',
          path: '../../package.json',
          pattern: /build.*\n?.*dependencies": \[/,
          template: `        "./${packages}/{{ dashCase name }}:build",`,
        },
      ]
    },
  })
}
