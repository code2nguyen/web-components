import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { componentSchema, gallerySchema, guideSchema, iconSetSchema } from './schemas'

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

export const collections = {
  components: componentCollection,
  icons: iconCollection,
  gallery: galleryCollection,
  guides: guideCollection,
}
