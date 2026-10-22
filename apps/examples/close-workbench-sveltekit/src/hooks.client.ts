import type { ClientInit } from '@sveltejs/kit/hooks'

/**
 * Registers every `c2-*` element before SvelteKit hydrates the prerendered page. Svelte decides between a property
 * and an attribute with `key in element`, so the elements must be defined by the time the first binding runs; `init`
 * is awaited before hydration, which makes that ordering a guarantee. The module never runs on the server, where
 * there is no `customElements`.
 */
export const init: ClientInit = async () => {
  await import('#lib/c2n.ts')
}
