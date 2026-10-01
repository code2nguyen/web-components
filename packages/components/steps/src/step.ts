import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { StepStatus, StepsMarker, StepsOrientation } from './step-types.js'
import { STATUS_ICONS, STATUS_LABELS } from './step-icons.js'
import styles from './step.scss?inline'

export type { StepStatus, StepsMarker, StepsOrientation } from './step-types.js'

/**
 * Parent/child protocol: a selectable row asks its `c2-steps` to select it. Not public API — the list answers with
 * `selection-change`, which is the event to listen for.
 */
export const STEP_SELECT_EVENT = 'c2-step-select'

/** Detail of the {@link STEP_SELECT_EVENT} protocol event. */
export interface StepSelectRequestDetail {
  /** The step's `value`, or its dotted path when it has none. */
  value: string
}

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
 * **In an `interactive` list a row is a button.** Pressing it selects the step — the list keeps one selected step and
 * says so with `selection-change` — so a view can show what belongs to it: the log of the step that ran, the result
 * of the step that produced one. A group's row stays its disclosure; `disabled` keeps a step from being selected.
 *
 * The step never sets its own depth, position, marker mode, orientation or selection: the parent `c2-steps` writes
 * them on every pass, so a step used on its own renders as a single root-level row.
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
 * @csspart row - The row itself: toggle, marker, text and trailing content. A group's row is its `<summary>`, and a selectable row in an `interactive` list is a `<button>`.
 * @csspart toggle - Disclosure region containing the assigned `toggle` slot for a group.
 * @csspart marker - Round marker region containing the `marker` slot or status fallback at the start of the row.
 * @csspart rail - The connector between this marker and the next.
 * @csspart label - Primary-text region containing the `label` slot or property fallback.
 * @csspart detail - Secondary-text region containing the `detail` slot or property fallback.
 * @csspart trailing - End-aligned text region containing the `trailing` slot or property fallback.
 * @csspart children - The box holding the sub-steps.
 *
 * @cssproperty {pixel} [--c2-step__row--gap=10px] - Space between the marker, the text and the trailing content.
 * @cssproperty {padding} [--c2-step__row--padding-block=7px]
 * @cssproperty {padding} [--c2-step__row--padding-inline=12px]
 * @cssproperty {pixel} [--c2-step__row--indent=calc(var(--c2-step__marker--size, 16px) + var(--c2-step__row--gap, 10px))] - Extra inset per level of nesting. The default puts a sub-step's marker under its parent's label, which is what makes the nesting read without drawing anything.
 * @cssproperty {border-radius} --c2-step__row--border-radius
 * @cssproperty {color} --c2-step__row--background
 * @cssproperty {color} --c2-step__row__hover--background - Set it to make the rows respond to the pointer.
 * @cssproperty {border} [--c2-step__row--border-bottom=1px solid #e4e4e7] - The hairline under each row.
 * @cssproperty {border} [--c2-step__row--outline=2px solid rgb(2, 101, 220)] - Focus ring of a row that is a button: a group's, and every selectable one.
 * @cssproperty {color} --c2-step__row__selected--background - Background of the selected row in an `interactive` list. None by default: the label colour alone marks the selection.
 * @cssproperty {box-shadow} --c2-step__row__selected--box-shadow - An indicator for the selected row — `inset 0 -2px 0 currentColor` underlines it.
 * @cssproperty {opacity} [--c2-step__row__disabled--opacity=0.38] - A `disabled` step in an `interactive` list.
 * @cssproperty {border} [--c2-step__row__horizontal--border-bottom=none] - The hairline under each step of a horizontal list, which has none by default.
 * @cssproperty {pixel} [--c2-step__row__horizontal--min-width=96px] - The narrowest a step of a horizontal list gets before the list scrolls.
 * @cssproperty {grid-template-areas} [--c2-step__row__horizontal--grid-template-areas="marker rail rail" "text text text" "trailing trailing trailing"] - Where the text sits around the marker in a horizontal list. The cells are `marker`, `rail`, `text` and `trailing`, over three columns sized `auto auto 1fr`; the rail always takes the last one and runs on to the next step. Text over the marker: `"text text text" "trailing trailing trailing" "marker rail rail"`, with `--c2-step__row__horizontal--align-content: end`. Beside it: `"marker text rail" ". trailing ."`. Before it: `"text marker rail" "trailing . ."`.
 * @cssproperty {align-content} [--c2-step__row__horizontal--align-content=start] - Which end of a horizontal step its rows pack to when a neighbour is taller. `end` with the text over the marker keeps every marker on one line.
 * @cssproperty {pixel} [--c2-step__row__horizontal--row-gap=8px] - Space between the marker's line and the text above or below it in a horizontal list.
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
 * @cssproperty {pixel} [--c2-step__rail__horizontal--width=2px] - Thickness of the connector in a horizontal list, which always links one step to the next: it runs from this step's marker (or its label, when the label comes after the marker) through the gap to where the next step starts, one `--c2-step__rail--gap` short of it at each end.
 *
 * @cssproperty {color} [--c2-step__label--color=#18181b]
 * @cssproperty {font-size} [--c2-step__label--font-size=13px]
 * @cssproperty {font-weight} [--c2-step__label--font-weight=500]
 * @cssproperty {font-family} [--c2-step__label--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {color} [--c2-step__label__selected--color=rgb(2, 101, 220)] - Label colour of the selected row: what marks the selection by default.
 * @cssproperty {font-weight} --c2-step__label__selected--font-weight - Label weight of the selected row. Falls back to the label weight.
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

  // Semantics live on ElementInternals, not host attributes: an attribute the element writes on itself is one the
  // server never rendered, and React reports it as a hydration mismatch. An author-set attribute still wins.
  private readonly internals = this.attachInternals()

  /** State of the step. Drives the marker glyph and the accent colour, and reopens a folded group. */
  @property({ reflect: true }) status: StepStatus = 'pending'

  /** Primary text, when the `label` slot is empty. */
  @property() label = ''

  /** Dimmed secondary text beside the label, when the `detail` slot is empty. */
  @property() detail = ''

  /** Text at the end of the row, when the `trailing` slot is empty. */
  @property() trailing = ''

  /**
   * What the parent `c2-steps` calls this step in `selected` and `selection-change`. Without one, the step is
   * called by its dotted path — `2` for the second top-level step.
   */
  @property() value = ''

  /** In an `interactive` list, keeps the step from being selected. Its row stays visible, and its status still shows. */
  @property({ type: Boolean, reflect: true }) disabled = false

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

  /** Layout of the list, written by the parent `c2-steps`. A horizontal step is one column and draws no sub-steps. */
  @property({ attribute: false }) orientation: StepsOrientation = 'vertical'

  /** Whether the row is a button that selects the step. Written by the parent from its `interactive`. */
  @property({ attribute: false }) interactive = false

  /** Whether this is the list's selected step. Written by the parent from its `selected`; set that instead. */
  @property({ attribute: false }) selected = false

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

  private readonly slotPresence = new SlotPresenceController(this, ['detail', 'trailing', 'toggle'])

  override connectedCallback() {
    super.connectedCallback()
    this.internals.role = 'listitem'
    // The arrival animation runs on the host, the settling one on the marker inside the shadow root — and an
    // animation event from in there does not cross the boundary, so both ends need a listener.
    this.addEventListener('animationend', this.handleAnimationEnd)
    this.renderRoot.addEventListener('animationend', this.handleAnimationEnd)
    this.syncHasChildren()
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
    void name
    this.slotPresence.handleSlotChange(event)
  }

  /** Astro wraps an island in `<astro-island>`, so a sub-step is rarely a literal child — look right through. */
  private syncHasChildren() {
    this.hasChildren = !!this.querySelector('c2-step')
  }

  private handleToggle(event: Event) {
    this.collapsed = !(event.target as HTMLDetailsElement).open
  }

  /** The list owns the selection; the row only asks for it. */
  private handleSelect() {
    if (this.disabled) return
    this.dispatchEvent(
      new CustomEvent<StepSelectRequestDetail>(STEP_SELECT_EVENT, { detail: { value: this.value || this.path }, bubbles: true, composed: true }),
    )
  }

  /** A horizontal step is one column, so a group there is a plain step: its sub-steps roll up but are not drawn. */
  private get isDisclosure() {
    return this.hasChildren && this.orientation !== 'horizontal'
  }

  private renderMarker() {
    if (this.marker === 'none') return nothing
    const glyph = this.marker === 'number' ? html`${this.path}` : (STATUS_ICONS[this.status] ?? nothing)
    return html`<span class="c2-step__marker" part="marker" aria-hidden="true"><slot name="marker">${glyph}</slot></span>`
  }

  /** The row's content, identical whether it is a plain row or a group's summary. */
  private renderRowContent(): TemplateResult {
    const detail = this.detail || this.slotPresence.has('detail')
    const trailing = this.trailing || this.slotPresence.has('trailing')
    return html`
      <span class="c2-step__toggle" part="toggle" aria-hidden="true" ?hidden=${!this.slotPresence.has('toggle')}>
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

  /** A leaf's row: a button in an `interactive` list, which is what makes it focusable and pressable. */
  private renderLeafRow(rowClass: ReturnType<typeof classMap>): TemplateResult {
    if (!this.interactive) return html`<div class=${rowClass} part="row">${this.renderRowContent()}</div>`
    return html`<button
      type="button"
      class=${rowClass}
      part="row"
      ?disabled=${this.disabled}
      aria-current=${this.selected ? 'true' : 'false'}
      @click=${this.handleSelect}
    >
      ${this.renderRowContent()}
    </button>`
  }

  override render() {
    const rowClass = classMap({ 'c2-step__row': true, [`is-${this.status}`]: true, 'is-selected': this.interactive && this.selected })
    const frameClass = classMap({ 'c2-step__frame': true, 'is-horizontal': this.orientation === 'horizontal' })
    // A leaf is a row; a group is a disclosure, which `<details>` gives correct keyboard and expanded-state
    // semantics for free. The slot lives in both branches, or a leaf could never find out it has children.
    // One frame around both, so a step arriving in a running trace has a single box to grow from.
    return html`
      <div class=${frameClass} part="frame">
        ${
          this.isDisclosure
            ? html`
                <details class="c2-step__details" ?open=${!this.collapsed} @toggle=${this.handleToggle}>
                  <summary class=${rowClass} part="row">${this.renderRowContent()}</summary>
                  ${this.renderChildren()}
                </details>
              `
            : html`${this.renderLeafRow(rowClass)} ${this.renderChildren()}`
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
