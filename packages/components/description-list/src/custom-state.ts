/**
 * Adds or removes a custom state; a browser without custom states, or the server shim, just skips it.
 */
export function toggleDescriptionState(internals: ElementInternals, name: string, on: boolean) {
  try {
    if (on) internals.states.add(name)
    else internals.states.delete(name)
  } catch {
    /* unsupported */
  }
}
