import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { componentSchema, exampleSchema, gallerySchema, guideSchema, iconSetSchema } from './schemas'

// Content Layer collections. `id` is derived from the file path (e.g. checkbox.mdx -> "checkbox").
export const componentCollection = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/components' }),
  schema: componentSchema,
})

// Icon sets get their own section of the site (/icons/<id>), separate from UI components.
export const iconCollection = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/icons' }),
  schema: iconSetSchema,
})

// Gallery of styled variants per component, served at /components/<id>/gallery. The id must match a `components` entry.
export const galleryCollection = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/gallery' }),
  schema: gallerySchema,
})

// Guides (/guides/<id>): theming, the application workflow, framework notes.
export const guideCollection = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/guides' }),
  schema: guideSchema,
})

// Example apps (/examples/<id>): complete applications under apps/examples/*, loaded straight from each app's
// own app.config.json so the metadata has exactly one home. The id is the app's directory name.
export const exampleCollection = defineCollection({
  loader: glob({
    pattern: '*/app.config.json',
    base: '../examples',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: exampleSchema,
})

export const collections = {
  components: componentCollection,
  icons: iconCollection,
  gallery: galleryCollection,
  guides: guideCollection,
  examples: exampleCollection,
}
