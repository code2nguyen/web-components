import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { StepStatus, StepsMarker } from './step-types.js'
import { STATUS_ICONS, STATUS_LABELS } from './step-icons.js'
import styles from './step.scss?inline'

export type { StepStatus, StepsMarker } from './step-types.js'

/** Detail of {@link StepEventMap.step-toggle}. */
export interface StepToggleEventDetail {
  /** Whether the group is now folded away. */
  collapsed: boolean
  /** Dotted position of the step through the tree, so a listener on `c2-steps` knows which one moved. */
  path: string
}

export interface StepEventMap {
  /**
   * A group opened or closed — by a click, by the keyboard, or because the run reopened it. Bubbles, so one
   * listener on `c2-steps` hears every group; `event.target` is the step and `detail.path` says where it sits.
   */
  'step-toggle': CustomEvent<StepToggleEventDetail>
}

export interface Step {
  addEventListener: TypedAddEventListener<Step, StepEventMap>
  removeEventListener: TypedRemoveEventListener<Step, StepEventMap>
}

/** The statuses that bring a folded-away stage back into view. Nothing ever folds one away on its own. */
const STATUS_REOPENS = new Set<StepStatus>(['running', 'current', 'error', 'warning'])

/**
 * One row of a {@link Steps} list: a marker, a label with optional dimmed `detail`, and `trailing` text at the end
 * of the row — a duration, a count, a timestamp.
 *
 * **A step with sub-steps is a group.** Nest `c2-step` children and the row becomes the summary of a disclosure
 * and the children its detail, so a long run collapses to the shape of the task rather than to a wall of lines.
 * There is no second element to learn: the same tag is a leaf or a group depending on what is inside it.
 *
 * **Every step is a row, and every row is visible.** A group starts expanded and nothing ever folds one away on
 * its own: the chevron is there for the reader, and `collapsed` in the markup starts a stage folded. The run only
 * ever brings a stage *back* into view — a folded one reopens when it starts running (`running`, `current`) or
 * when something in it goes wrong (`error`, `warning`).
 *
 * **A step is one row.** Label, detail and trailing text sit on a single line and truncate with an ellipsis rather
 * than wrapping, so a hundred-step trace stays scannable, and a sub-step is indented far enough that its marker
 * lands under its parent's label. `--c2-step__text--flex-direction: column` still stacks the detail under the
 * label, which a wizard's descriptions want — that is two lines on purpose, and each of them is still one line.
 *
 * The step never sets its own depth, position or marker mode: the parent `c2-steps` writes them on every pass, so
 * a step used on its own renders as a single root-level row.
 *
 * @tag c2-step
 *
 * @slot - Sub-steps. A step that has them is a group.
 * @slot label - Primary text. Falls back to the `label` attribute.
 * @slot detail - Secondary text beside the label. Falls back to the `detail` attribute.
 * @slot trailing - Content at the end of the row. Falls back to the `trailing` attribute.
 * @slot marker - Replaces the whole marker: a custom icon, an avatar, a number of your own.
 * @slot toggle - A disclosure affordance of your own — a chevron, a caret. Empty by default: a trace is a list of rows, and the row is already clickable. It is filled per step, so give a leaf an empty `<span slot="toggle"></span>` to keep its rows lined up with the groups above them.
 *
 * @event {CustomEvent<StepToggleEventDetail>} step-toggle - A group was folded away or brought back. Bubbles.
 *
 * @csspart frame - The box around the whole step, which is what grows when a new step arrives.
 * @csspart row - The row itself: toggle, marker, text and trailing content. A group's row is its `<summary>`.
 * @csspart toggle - The disclosure chevron of a group.
 * @csspart marker - The round marker at the start of the row.
 * @csspart rail - The connector between this marker and the next.
 * @csspart label - The primary text.
 * @csspart detail - The dimmed secondary text.
 * @csspart trailing - The text at the end of the row.
 * @csspart children - The box holding the sub-steps.
 *
 * @cssproperty {pixel} [--c2-step__row--gap=10px] - Space between the marker, the text and the trailing content.
 * @cssproperty {padding} [--c2-step__row--padding-block=7px]
 * @cssproperty {padding} [--c2-step__row--padding-inline=12px]
 * @cssproperty {pixel} [--c2-step__row--indent=marker size + row gap] - Extra inset per level of nesting. The default puts a sub-step's marker under its parent's label, which is what makes the nesting read without drawing anything.
 * @cssproperty {border-radius} --c2-step__row--border-radius
 * @cssproperty {color} --c2-step__row--background
 * @cssproperty {color} --c2-step__row__hover--background - Set it to make the rows respond to the pointer.
 * @cssproperty {border} [--c2-step__row--border-bottom=1px solid #e4e4e7] - The hairline under each row.
 * @cssproperty {border} [--c2-step__row--outline=2px solid rgb(2, 101, 220)] - Focus ring of a group's row, which is a button.
 *
 * @cssproperty {pixel} [--c2-step__toggle--size=14px] - Width of the `toggle` slot's column, when it is filled.
 * @cssproperty {pixel} [--c2-step__toggle--gap=4px] - Space between that column and the marker.
 * @cssproperty {color} [--c2-step__toggle--color=#a1a1aa]
 *
 * @cssproperty {color} [--c2-step__guide--color=#e4e4e7] - A vertical rule at each ancestor's depth, for a file-tree look. Off by default.
 * @cssproperty {pixel} [--c2-step__guide--width=0px] - Width of that rule. `1px` turns the guides on.
 *
 * @cssproperty {pixel} [--c2-step__marker--size=16px]
 * @cssproperty {font-size} [--c2-step__marker--font-size=10px] - Size of the dotted path in `marker="number"`.
 * @cssproperty {padding} [--c2-step__marker--padding-inline=3px] - Breathing room either side of a dotted path, which is what turns the circle into a pill when the number is long. Only `marker="number"` uses it.
 * @cssproperty {font-weight} [--c2-step__marker--font-weight=600]
 * @cssproperty {border-radius} [--c2-step__marker--border-radius=999px]
 * @cssproperty {border} [--c2-step__marker--border=1px solid #bcbcc6] - The ring, drawn for the states that have no glyph of their own (`pending`, `current`, `running`) and for every `marker="number"` step. A finished step is its glyph, so it has no ring.
 * @cssproperty {color} [--c2-step__marker--background=transparent]
 * @cssproperty {color} [--c2-step__marker--color=#71717a]
 *
 * @cssproperty {pixel} [--c2-step__rail--width=0px] - Width of the connector. `0px` is the trace look; `2px` gives a stepper its rail.
 * @cssproperty {color} [--c2-step__rail--color=#e4e4e7]
 * @cssproperty {pixel} [--c2-step__rail--gap=4px] - Space between the marker and the rail.
 *
 * @cssproperty {color} [--c2-step__label--color=#18181b]
 * @cssproperty {font-size} [--c2-step__label--font-size=13px]
 * @cssproperty {font-weight} [--c2-step__label--font-weight=500]
 * @cssproperty {font-family} [--c2-step__label--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {color} [--c2-step__detail--color=#71717a]
 * @cssproperty {font-size} --c2-step__detail--font-size - Falls back to the label size.
 * @cssproperty {font-weight} [--c2-step__detail--font-weight=400]
 * @cssproperty {pixel} [--c2-step__detail--gap=8px] - Space between the label and the detail when they share a line.
 * @cssproperty {pixel} [--c2-step__detail--row-gap=2px] - Space between them when they are stacked.
 * @cssproperty {flex-direction-row} [--c2-step__text--flex-direction=row] - `column` puts the detail on its own line under the label, which a wizard's descriptions want. It is the only variable that switch needs: the gap and the alignment follow it.
 * @cssproperty {align-items} [--c2-step__text--align-items=baseline] - How the label and the detail line up across the row. Stacked, they are flush left whatever this says.
 * @cssproperty {color} [--c2-step__trailing--color=#71717a]
 * @cssproperty {font-size} --c2-step__trailing--font-size - Falls back to the label size.
 * @cssproperty {font-weight} [--c2-step__trailing--font-weight=400]
 *
 * @cssproperty {color} [--c2-step__success--color=#16a34a] - Marker colour when the step succeeded.
 * @cssproperty {color} [--c2-step__error--color=#dc2626]
 * @cssproperty {color} [--c2-step__warning--color=#d97706]
 * @cssproperty {color} [--c2-step__running--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-step__current--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-step__skipped--color=#71717a] - Marker and label colour when the step was skipped.
 * @cssproperty {time} [--c2-step--transition-duration=150ms] - Colour transitions, and the beat a marker gives when its status settles.
 * @cssproperty {time} [--c2-step--enter-duration=260ms] - How long a step arriving in a running trace takes to grow into place. `0s` turns the animation off.
 * @cssproperty {translate} [--c2-step--enter-translate=-4px] - How far it slides while it does.
 */
@customElement('c2-step')
export class Step extends LitElement {
  static override styles = unsafeCSS(styles)

  /** State of the step. Drives the marker glyph and the accent colour, and reopens a folded group. */
  @property({ reflect: true }) status: StepStatus = 'pending'

  /** Primary text, when the `label` slot is empty. */
  @property() label = ''

  /** Dimmed secondary text beside the label, when the `detail` slot is empty. */
  @property() detail = ''

  /** Text at the end of the row, when the `trailing` slot is empty. */
  @property() trailing = ''

  /**
   * Whether this group is folded away. A group is expanded by default — every step in the list is a row you can
   * see — and only the reader, the markup or a reopening status ever changes that.
   */
  @property({ type: Boolean, reflect: true }) collapsed = false

  /** Depth of nesting. Written by the parent `c2-steps`; setting it by hand only changes the indent. */
  @property({ attribute: false }) level = 0

  /** 1-based position among its siblings. Written by the parent. */
  @property({ attribute: false }) position = 1

  /** Dotted position through the tree — `3.1` for the first child of the third step. Shown by `marker="number"`. */
  @property({ attribute: false }) path = '1'

  /** Whether this is the last step of its group, so the rail stops here. Written by the parent. */
  @property({ attribute: false }) last = false

  /** Marker mode, written by the parent `c2-steps`. */
  @property({ attribute: false }) marker: StepsMarker = 'icon'

  /**
   * Whether the list holds any group at all, written by the parent. A list of plain rows drops the chevron column
   * rather than leaving every row inset by an empty one.
   */
  @property({ attribute: false }) grouped = false

  /**
   * Whether this step has sub-steps, and so is a group. Written by the parent `c2-steps`, which walks the tree
   * anyway; a step on its own works it out for itself.
   */
  @property({ attribute: false }) hasChildren = false

  @state() private hasDetailSlot = false
  @state() private hasTrailingSlot = false
  @state() private hasToggleSlot = false

  override connectedCallback() {
    super.connectedCallback()
    this.setAttribute('role', 'listitem')
    // The arrival animation runs on the host, the settling one on the marker inside the shadow root — and an
    // animation event from in there does not cross the boundary, so both ends need a listener.
    this.addEventListener('animationend', this.handleAnimationEnd)
    this.renderRoot.addEventListener('animationend', this.handleAnimationEnd)
  }

  override disconnectedCallback() {
    this.removeEventListener('animationend', this.handleAnimationEnd)
    this.renderRoot.removeEventListener('animationend', this.handleAnimationEnd)
    super.disconnectedCallback()
  }

  /**
   * `entering` is written by the parent on a step that arrived after the list was already on screen, and it is
   * the whole of the enter animation. It comes off again the moment that animation is done, so a step is never
   * left in a state that would replay it — the spinner is ignored here because it never ends.
   */
  private readonly handleAnimationEnd = (event: Event) => {
    const name = (event as AnimationEvent).animationName
    if (name.includes('step-enter') && event.target === this) this.removeAttribute('entering')
    if (name.includes('step-settle')) this.removeAttribute('settling')
  }

  protected override firstUpdated() {
    // Server-side rendering hands the element a declarative shadow root whose slots were assigned while the page
    // was parsed, so that first `slotchange` fired long before hydration attached a listener for it. Asking the
    // light DOM directly is the only way a hydrated group finds out it has sub-steps.
    this.syncHasChildren()
  }

  protected override willUpdate(changed: PropertyValues) {
    // Only a real change reopens a stage. The old value is `undefined` on the first pass, where `status` is merely
    // the one the step was born with — the author's, not the run's, so a `collapsed` stage stays folded.
    if (!changed.has('status') || changed.get('status') === undefined) return
    if (STATUS_REOPENS.has(this.status)) this.collapsed = false
  }

  protected override updated(changed: PropertyValues) {
    // The beat is for a status that *changed*. On the first pass `status` is merely the one the step was born
    // with, and a trace drawn complete should sit still rather than pop one marker per row.
    if (changed.has('status') && changed.get('status') !== undefined) this.toggleAttribute('settling', true)
    if (changed.has('level')) this.style.setProperty('--level', String(this.level))
    if (changed.has('last')) this.toggleAttribute('last', this.last)
    if (changed.has('marker')) this.setAttribute('marker', this.marker)
    if (changed.has('grouped')) this.toggleAttribute('grouped', this.grouped)
    if (changed.has('hasChildren')) this.toggleAttribute('has-children', this.hasChildren)
    if (changed.has('collapsed') && changed.get('collapsed') !== undefined && this.hasChildren) {
      this.dispatchEvent(new CustomEvent<StepToggleEventDetail>('step-toggle', { detail: { collapsed: this.collapsed, path: this.path }, bubbles: true }))
    }
  }

  /** These three collapse when empty, so their rows have to know whether the slot was filled. */
  private handleSlotChange(name: 'detail' | 'trailing' | 'toggle', event: Event) {
    const filled = (event.target as HTMLSlotElement)
      .assignedNodes({ flatten: true })
      .some((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent ?? '').trim() !== '')
    if (name === 'detail') this.hasDetailSlot = filled
    else if (name === 'trailing') this.hasTrailingSlot = filled
    else this.hasToggleSlot = filled
  }

  /** Astro wraps an island in `<astro-island>`, so a sub-step is rarely a literal child — look right through. */
  private syncHasChildren() {
    this.hasChildren = !!this.querySelector('c2-step')
  }

  private handleToggle(event: Event) {
    this.collapsed = !(event.target as HTMLDetailsElement).open
  }

  private renderMarker() {
    if (this.marker === 'none') return nothing
    const glyph = this.marker === 'number' ? html`${this.path}` : (STATUS_ICONS[this.status] ?? nothing)
    return html`<span class="c2-step__marker" part="marker" aria-hidden="true"><slot name="marker">${glyph}</slot></span>`
  }

  /** The row's content, identical whether it is a plain row or a group's summary. */
  private renderRowContent(): TemplateResult {
    const detail = this.detail || this.hasDetailSlot
    const trailing = this.trailing || this.hasTrailingSlot
    return html`
      <span class="c2-step__toggle" part="toggle" aria-hidden="true" ?hidden=${!this.hasToggleSlot}>
        <slot name="toggle" @slotchange=${(event: Event) => this.handleSlotChange('toggle', event)}></slot>
      </span>
      <span class="c2-step__gutter">
        ${this.renderMarker()}
        <span class="c2-step__rail" part="rail" aria-hidden="true"></span>
      </span>
      <span class="c2-step__text">
        <span class="c2-step__label" part="label">
          <slot name="label">${this.label}</slot>
        </span>
        <span class="c2-step__detail" part="detail" ?hidden=${!detail}>
          <slot name="detail" @slotchange=${(event: Event) => this.handleSlotChange('detail', event)}>${this.detail}</slot>
        </span>
      </span>
      <span class="c2-step__trailing" part="trailing" ?hidden=${!trailing}>
        <slot name="trailing" @slotchange=${(event: Event) => this.handleSlotChange('trailing', event)}>${this.trailing}</slot>
      </span>
      <!-- The marker is a glyph, so the state is spelled out for assistive technology. -->
      <span class="c2-step__status-text">${STATUS_LABELS[this.status]}</span>
    `
  }

  private renderChildren(): TemplateResult {
    return html`
      <div class="c2-step__children" part="children" role="list" ?hidden=${!this.hasChildren}>
        <slot @slotchange=${this.syncHasChildren}></slot>
      </div>
    `
  }

  override render() {
    const rowClass = classMap({ 'c2-step__row': true, [`is-${this.status}`]: true })
    // A leaf is a row; a group is a disclosure, which `<details>` gives correct keyboard and expanded-state
    // semantics for free. The slot lives in both branches, or a leaf could never find out it has children.
    // One frame around both, so a step arriving in a running trace has a single box to grow from.
    return html`
      <div class="c2-step__frame" part="frame">
        ${
          this.hasChildren
            ? html`
                <details class="c2-step__details" ?open=${!this.collapsed} @toggle=${this.handleToggle}>
                  <summary class=${rowClass} part="row">${this.renderRowContent()}</summary>
                  ${this.renderChildren()}
                </details>
              `
            : html`<div class=${rowClass} part="row">${this.renderRowContent()}</div>
                ${this.renderChildren()}`
        }
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-step': Step
  }
}
