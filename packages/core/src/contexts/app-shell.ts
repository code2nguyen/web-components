import { createContext } from '@lit/context'

/**
 * Shared contract between `c2-app-shell` and the toggles inside it (`c2-app-shell-toggle`), so a toggle slotted into
 * the shell's header (a `c2-header` in its light DOM) knows the shell's state without an id or a script. The shell
 * provides a new object whenever any field changes.
 */

/** How the navigation is presented: beside main, collapsed to icons, or as a modal drawer. */
export type AppShellMode = 'side' | 'rail' | 'over'

/** The shell's width class: below 600px, 600–959px, 960px and up. */
export type AppShellBreakpoint = 'phone' | 'tablet' | 'desktop'

export interface AppShellContext {
  mode: AppShellMode
  breakpoint: AppShellBreakpoint
  navigationOpened: boolean
  asideOpened: boolean
  /** Opens or closes the navigation as the user would (fires `navigation-opened-change`). */
  toggleNavigation(force?: boolean): void
  /** Opens or closes the aside as the user would (fires `aside-opened-change`). */
  toggleAside(force?: boolean): void
}

/** `undefined` outside a shell. */
export const appShellContext = createContext<AppShellContext | undefined>(Symbol('c2-app-shell'))
