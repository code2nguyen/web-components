import { z } from 'astro:content'

export const COMPONENT_CATEGORIES = ['Inputs', 'Buttons', 'Navigation', 'Layout', 'Data display', 'Feedback', 'Chat'] as const

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number]

export const componentSchema = z.object({
  title: z.string(),
  description: z.string().default(''),
  category: z.enum(COMPONENT_CATEGORIES).default('Layout'),
  /** npm package name, e.g. `@c2n/checkbox`. Defaults to `@c2n/<id>` when omitted. */
  package: z.string().optional(),
})

export const iconSetSchema = z.object({
  title: z.string(),
  description: z.string().default(''),
  package: z.string().optional(),
})

/** Gallery pages (`src/content/gallery/<component-id>.mdx`): styled variants of a component, one MdxCodeBlock fence per card. */
export const gallerySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
})

/** Guide pages (`src/content/guides/<id>.mdx`): long-form documentation such as theming and the application workflow. */
export const guideSchema = z.object({
  title: z.string(),
  description: z.string().default(''),
  /** Sidebar order, ascending. */
  order: z.number().default(100),
})
