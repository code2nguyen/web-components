export type ReviewedProperty = { tag: string; name: string; type?: string | { text?: string } }

export function validateReviewedRegistry(registry: unknown, inventory: ReviewedProperty[]): unknown
