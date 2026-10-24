/**
 * Shared contract between a swipe container — a `c2-list` — and the swipeable rows inside it (`c2-swipe-action`), so
 * neither package has to depend on the other. Either side may upgrade first, so the contract runs both ways: a row
 * asks with `SWIPE_REQUEST_EVENT` when it connects, and the container pushes `SWIPE_CONTAINER_EVENT` onto its rows
 * when it renders, when its rows change and when its setting changes. A row with no container swipes on its own terms.
 */

/**
 * Fired by a row when it connects, so a container around it can answer. Bubbles but is not composed: a row inside
 * another component's shadow root belongs to that component, not to a container outside it. The container answers
 * only a row of its own and stops the event.
 */
export const SWIPE_REQUEST_EVENT = 'c2-swipe-request'

export interface SwipeRequestEventDetail {
  /** The container calls this with whether its rows may swipe. */
  respond(swipeable: boolean): void
}

/**
 * Dispatched by a container on an element inside each row (its `c2-list-item`), from where it bubbles to the row
 * around it, which takes the setting and stops it. Not composed: it stays in the container's light DOM.
 */
export const SWIPE_CONTAINER_EVENT = 'c2-swipe-container'

export interface SwipeContainerEventDetail {
  /** Whether the rows of this container may swipe. */
  swipeable: boolean
}
