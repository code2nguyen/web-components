import { z } from 'astro:content'

export const componentSchema = z.object({
  title: z.string(),
})
