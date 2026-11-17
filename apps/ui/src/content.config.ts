import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { blogSchema, componentSchema, exampleSchema, gallerySchema, guideSchema, iconSetSchema, labReportSchema, labRunSchema, labSpecSchema } from './schemas'

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

// Blog articles live in Markdown so they can be written independently from their page layout.
export const blogCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blogs' }),
  schema: blogSchema,
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

// The component lab (lab/ at the repository root): run records, specs and build reports, read by the /lab pages. The
// site reads this data and nothing else of the lab; the lab's own scripts write it.
export const labRunCollection = defineCollection({
  loader: glob({ pattern: '*.json', base: '../../lab/runs' }),
  schema: labRunSchema,
})

// Specs are identified by the `id` in their front matter (lab/specs/<size>/<id>.md); README and TEMPLATE are not specs.
export const labSpecCollection = defineCollection({
  loader: glob({
    pattern: ['**/*.md', '!README.md', '!TEMPLATE.md'],
    base: '../../lab/specs',
    generateId: ({ entry }) => entry.replace(/^.*\//, '').replace(/\.md$/, ''),
  }),
  schema: labSpecSchema,
})

// Build reports, one per spec and direction: lab/reports/<spec>/<direction>.md, id `<spec>/<direction>`.
export const labReportCollection = defineCollection({
  loader: glob({ pattern: '*/*.md', base: '../../lab/reports', generateId: ({ entry }) => entry.replace(/\.md$/, '') }),
  schema: labReportSchema,
})

export const collections = {
  components: componentCollection,
  icons: iconCollection,
  gallery: galleryCollection,
  guides: guideCollection,
  blogs: blogCollection,
  examples: exampleCollection,
  labRuns: labRunCollection,
  labSpecs: labSpecCollection,
  labReports: labReportCollection,
}
