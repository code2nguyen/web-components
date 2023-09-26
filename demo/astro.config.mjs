import { defineConfig } from 'astro/config'
import tailwind from '@astrojs/tailwind'
import mdx from '@astrojs/mdx';
import lit from '@astrojs/lit';
import { MDXCodeBlockRemark } from './plugin/mdx-codeblock-remark.mjs';

export default defineConfig({
  site: 'https://code2nguyen.github.io',
  base: '/web-components',
  markdown: {
    remarkPlugins: [MDXCodeBlockRemark]
  },
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
    mdx(),
    lit()
  ],
  scopedStyleStrategy: 'class',
})
