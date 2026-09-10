/** Number of example cards in a gallery MDX body (one ```html tag=MdxCodeBlock fence per card). */
export function countGalleryExamples(body: string | undefined): number {
  return (body?.match(/^```html tag=MdxCodeBlock/gm) ?? []).length
}
