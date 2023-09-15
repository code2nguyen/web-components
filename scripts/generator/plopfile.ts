import {NodePlopAPI} from 'plop';


export default function (plop: NodePlopAPI) {
    plop.setGenerator('wc', {
		description: 'generate web component',
		prompts: [{
			type: 'input',
			name: 'name',
			message: 'wc name(ex: Dropdown List):'			
		}],
		actions: [
			{
				type: 'addMany',
				destination: '../../packages/{{dashCase name}}',
				base: "files/wc",
				templateFiles: 'files/wc/**/*.*',
				skipIfExists: true
			},
			{
				type: 'add',
				path: '../../demo/src/content/components/{{dashCase name}}.mdx',
				templateFile: 'files/demo-doc.mdx.hbs',
				skipIfExists: true
			},
			{
				type: 'append',
				path: '../../demo/src/layouts/Layout.astro',
				pattern: "<script>",
				template: "			import '@c2n/{{ dashCase name }}';"
			}
		]
	});
  }