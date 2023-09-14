import { defineCollection } from 'astro:content'
import { componentSchema } from '../schemas'

// slug = componentId
export const componentCollection = defineCollection({
  type: 'content',
  schema: componentSchema,
})

export const collections = {
  components: componentCollection,
}
