/*global globalThis*/

import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import lit from '@astrojs/lit'
import { MDXCodeBlockRemark } from './plugin/mdx-codeblock-remark.mjs'
import { MDXTableExtends } from './plugin/mdx-table-extends.mjs'
import { HTMLElement } from '@lit-labs/ssr-dom-shim'

export default defineConfig({
  site: 'https://code2nguyen.github.io',
  base: '/web-components',
  markdown: {
    remarkPlugins: [MDXCodeBlockRemark, MDXTableExtends],
  },
  integrations: [
    {
      name: 'fix:lit',
      hooks: {
        'astro:config:setup': () => {
          if (!globalThis.HTMLElement) globalThis.HTMLElement = HTMLElement
        },
      },
    },
    mdx(),
    lit(),
  ],
  scopedStyleStrategy: 'class',
})
