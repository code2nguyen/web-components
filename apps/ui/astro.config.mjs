import { defineConfig } from 'astro/config'
import { unified } from '@astrojs/markdown-remark'
import mdx from '@astrojs/mdx'
import lit from '@astrojs/lit'
import { MDXCodeBlockRemark } from './plugin/mdx-codeblock-remark.mjs'
import { MDXTableExtends } from './plugin/mdx-table-extends.mjs'
import { HTMLElement } from '@lit-labs/ssr-dom-shim'

// `@astrojs/lit` with its server renderer wrapped by plugin/lit-server.mjs, which keeps Astro's island bootstrap out of
// named slots. Swapping the entrypoint keeps a single Lit renderer, so `client:only` still needs no hint.
function litIntegration() {
  const integration = lit()
  const setup = integration.hooks['astro:config:setup']
  integration.hooks['astro:config:setup'] = (options) =>
    setup({
      ...options,
      addRenderer: (renderer) => options.addRenderer({ ...renderer, serverEntrypoint: new URL('./plugin/lit-server.mjs', import.meta.url) }),
    })
  return integration
}

export default defineConfig({
  site: 'https://code2nguyen.github.io',
  base: '/web-components',
  markdown: {
    processor: unified({ remarkPlugins: [MDXCodeBlockRemark, MDXTableExtends] }),
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
    litIntegration(),
  ],
  scopedStyleStrategy: 'class',
})
