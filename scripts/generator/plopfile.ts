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
      const packages = package_type === 'npm package' ? 'packages' : 'open-packages'
      const demo_content_folder = package_type === 'npm package' ? 'components' : 'oepn-components'
      const actions =
        package_type === 'npm package'
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
