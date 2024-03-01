import type { ContextCallback, Context, ContextType } from '@lit/context'
import { ContextEvent } from '@lit/context'
import type { ReactiveController, ReactiveControllerHost } from '@lit/reactive-element'

export interface Options<C extends Context<unknown, unknown>> {
  context: C
  callback?: (value: ContextType<C>, dispose?: () => void) => void
  subscribe?: boolean
}

export class ContextConsumer<C extends Context<unknown, unknown>, HostElement extends ReactiveControllerHost & HTMLElement> implements ReactiveController {
  protected host: HostElement
  private context: C
  private callback?: (value: ContextType<C>, dispose?: () => void) => void
  private subscribe = false

  private provided = false

  value?: ContextType<C> = undefined

  constructor(host: HostElement, options: Options<C>)
  /** @deprecated Use new ContextConsumer(host, options) */
  constructor(host: HostElement, context: C, callback?: (value: ContextType<C>, dispose?: () => void) => void, subscribe?: boolean)
  constructor(host: HostElement, contextOrOptions: C | Options<C>, callback?: (value: ContextType<C>, dispose?: () => void) => void, subscribe?: boolean) {
    this.host = host
    // This is a potentially fragile duck-type. It means a context object can't
    // have a property name context and be used in positional argument form.
    if ((contextOrOptions as Options<C>).context !== undefined) {
      const options = contextOrOptions as Options<C>
      this.context = options.context
      this.callback = options.callback
      this.subscribe = options.subscribe ?? false
    } else {
      this.context = contextOrOptions as C
      this.callback = callback
      this.subscribe = subscribe ?? false
    }
    this.host.addController(this)
  }

  private unsubscribe?: () => void

  applyContext(): void {
    this.dispatchRequest()
  }

  unApplyContext() {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = undefined
    }
  }

  hostDisconnected(): void {
    this.unApplyContext()
  }

  private dispatchRequest() {
    this.host.dispatchEvent(new ContextEvent(this.context, this._callback, this.subscribe))
  }

  // This function must have stable identity to properly dedupe in ContextRoot
  // if this element connects multiple times.
  private _callback: ContextCallback<ContextType<C>> = (value, unsubscribe) => {
    // some providers will pass an unsubscribe function indicating they may provide future values
    if (this.unsubscribe) {
      // if the unsubscribe function changes this implies we have changed provider
      if (this.unsubscribe !== unsubscribe) {
        // cleanup the old provider
        this.provided = false
        this.unsubscribe()
      }
      // if we don't support subscription, immediately unsubscribe
      if (!this.subscribe) {
        this.unsubscribe()
      }
    }

    // store the value so that it can be retrieved from the controller
    this.value = value
    // schedule an update in case this value is used in a template
    this.host.requestUpdate()

    // only invoke callback if we are either expecting updates or have not yet
    // been provided a value
    if (!this.provided || this.subscribe) {
      this.provided = true
      if (this.callback) {
        this.callback(value, unsubscribe)
      }
    }

    this.unsubscribe = unsubscribe
  }
}
