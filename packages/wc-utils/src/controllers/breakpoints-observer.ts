import type { ReactiveController, ReactiveControllerHost } from '@lit/reactive-element'

export type Callback = (isInitial?: boolean) => void

export class BreakpointsObserver implements ReactiveController {
  private mqls: MediaQueryList[] = []

  previousBreakpoint: string = ''
  currentBreakpoint: string = ''

  constructor(
    private host: ReactiveControllerHost,
    private mediaQueries: string[],
    private callback: Callback,
  ) {
    this.host.addController(this)
  }

  hostConnected(): void {
    this.mediaQueries.forEach((query) => {
      const mql = window.matchMedia(query)
      if (mql.matches) {
        this.currentBreakpoint = query
        this.callback(true)
      }
      mql.addEventListener('change', this.handleMediaChange)
      this.mqls.push(mql)
    })
  }

  hostDisconnected(): void {
    this.mqls.forEach((item) => item.removeEventListener('change', this.handleMediaChange))
  }

  handleMediaChange = (event: MediaQueryListEvent) => {
    if (event.matches) {
      this.previousBreakpoint = this.currentBreakpoint
      this.currentBreakpoint = event.media
      this.callback()
    }
  }
}
