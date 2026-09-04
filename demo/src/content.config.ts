import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { componentSchema } from './schemas'

// Content Layer collection. `id` is derived from the file path (e.g. checkbox.mdx -> "checkbox"),
// which matches the `slug` the legacy collection used, so component URLs are unchanged.
export const componentCollection = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/components' }),
  schema: componentSchema,
})

export const collections = {
  components: componentCollection,
}
