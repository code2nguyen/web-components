/**
 * Typed `addEventListener` / `removeEventListener` signatures for a custom element.
 *
 * The DOM has a single global `HTMLElementEventMap`, so it cannot describe two components that fire the same
 * event name with different details — `selection-change` carries row keys on `c2-table` and option values on
 * `c2-list`. Declaring the map per element keeps both honest.
 *
 * A component publishes its events by merging an interface into its class declaration. The signatures are taken
 * as property types rather than through `extends`: an interface merged onto a class may not *extend* a second
 * type that redeclares a member of the class's own base (`HTMLElement.addEventListener`), but it may redeclare
 * that member itself.
 *
 * ```ts
 * export interface TableEventMap {
 *   'selection-change': CustomEvent<TableSelectionChangeEventDetail>
 * }
 *
 * export interface Table {
 *   addEventListener: TypedAddEventListener<Table, TableEventMap>
 *   removeEventListener: TypedRemoveEventListener<Table, TableEventMap>
 * }
 *
 * @customElement('c2-table')
 * export class Table extends LitElement { … }
 * ```
 *
 * Consumers then get the detail narrowed with no cast:
 *
 * ```ts
 * table.addEventListener('selection-change', (event) => event.detail.rows)
 * ```
 *
 * The native and catch-all signatures are kept, so every other event name still works.
 */
export interface TypedAddEventListener<Host extends EventTarget, EventMap extends { [Type in keyof EventMap]: Event }> {
  /**
   * Never present at runtime. It carries the event map in the element's type so {@link EventMapOf} can recover
   * it — the call signatures alone cannot be inferred back through.
   */
  readonly __eventMap?: EventMap

  <Type extends keyof EventMap & string>(type: Type, listener: (this: Host, event: EventMap[Type]) => void, options?: boolean | AddEventListenerOptions): void
  <Type extends keyof HTMLElementEventMap>(
    type: Type,
    listener: (this: Host, event: HTMLElementEventMap[Type]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void
  (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
}

/** The `removeEventListener` half of {@link TypedAddEventListener}. */
export interface TypedRemoveEventListener<Host extends EventTarget, EventMap extends { [Type in keyof EventMap]: Event }> {
  <Type extends keyof EventMap & string>(type: Type, listener: (this: Host, event: EventMap[Type]) => void, options?: boolean | EventListenerOptions): void
  <Type extends keyof HTMLElementEventMap>(
    type: Type,
    listener: (this: Host, event: HTMLElementEventMap[Type]) => void,
    options?: boolean | EventListenerOptions,
  ): void
  (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void
}

/**
 * The event map of a c2 element, for code that is generic over elements — a React hook that wires one listener,
 * say, or a helper that awaits an event.
 *
 * ```ts
 * function on<T extends HTMLElement, Type extends keyof EventMapOf<T> & string>(
 *   element: T,
 *   type: Type,
 *   listener: (event: EventMapOf<T>[Type]) => void,
 * ) {
 *   element.addEventListener(type, listener as EventListener)
 * }
 * ```
 *
 * Resolves to `HTMLElementEventMap` for an element that declares no map of its own, so the helper still works.
 */
export type EventMapOf<T extends EventTarget> = T extends { addEventListener: { __eventMap?: infer Map } }
  ? NonNullable<Map> & HTMLElementEventMap
  : HTMLElementEventMap
