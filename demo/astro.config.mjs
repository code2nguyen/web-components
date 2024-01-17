import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import lit from '@astrojs/lit'
import { MDXCodeBlockRemark } from './plugin/mdx-codeblock-remark.mjs'

export default defineConfig({
  site: 'https://code2nguyen.github.io',
  base: '/web-components',
  markdown: {
    remarkPlugins: [MDXCodeBlockRemark],
  },
  integrations: [mdx(), lit()],
  scopedStyleStrategy: 'class',
})
