import { html, nothing, unsafeCSS } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { NumberInput, type NumberInputEventMap } from './number-input.js'
import { unitInputMessages } from './unit-input-messages.js'
import styles from './unit-input.scss?inline'

/** One unit the user may pick, as `units` lists it. */
export interface UnitInputUnit {
  /** The code set as `unit` and submitted under `unit-name` (`dozen`, `kg`). */
  value: string
  /** Text shown in the picker and in the equivalent. Default: `value`. */
  label?: string
  /**
   * How many base units one of this unit holds: `12` for a dozen when the base is `ea`, `0.45359237` for `lb` when
   * the base is `kg`. The base unit has `1`. A unit without a factor is a label only: picking it keeps the number.
   */
  factor?: number
  /** The step while this unit is selected, in place of `step`. A converted number is rounded to its decimals. */
  step?: string
}

export interface UnitInputUnitChangeDetail {
  /** The unit now selected. */
  unit: string
  /** The unit selected before. */
  previousUnit: string
}

/** Events fired by {@link UnitInput}: those of `c2-number-input`, and the user picking a unit. */
export interface UnitInputEventMap extends NumberInputEventMap {
  'unit-change': CustomEvent<UnitInputUnitChangeDetail>
}

export interface UnitInput {
  addEventListener: TypedAddEventListener<UnitInput, UnitInputEventMap>
  removeEventListener: TypedRemoveEventListener<UnitInput, UnitInputEventMap>
}

// Reads `units`: a JSON array of units, or a `;`-separated list of codes, each with an optional `=factor`
// (`ea=1;dozen=12;case=144`). A unit without a code, and a factor that is not a positive number, are dropped.
function parseUnits(value: unknown): UnitInputUnit[] {
  let list = value
  if (typeof value === 'string') {
    list = value.split(';')
    if (value.trim().startsWith('[')) {
      try {
        list = JSON.parse(value)
      } catch {
        // Not JSON: a `;`-separated list that happens to start with a bracket.
      }
    }
  }
  if (!Array.isArray(list)) return []
  return list.flatMap((item: unknown): UnitInputUnit[] => {
    const unit = typeof item === 'string' ? { value: item.split('=')[0], factor: item.split('=')[1] } : (item as Record<string, unknown> | null)
    const code = String(unit?.value ?? '').trim()
    if (!unit || !code) return []
    const factor = Number(unit.factor)
    return [
      {
        value: code,
        label: typeof unit.label === 'string' ? unit.label : undefined,
        factor: unit.factor !== undefined && unit.factor !== '' && factor > 0 && Number.isFinite(factor) ? factor : undefined,
        step: unit.step === undefined || unit.step === null || unit.step === '' ? undefined : String(unit.step),
      },
    ]
  })
}

const unitsConverter = {
  fromAttribute: parseUnits,
  toAttribute: (units: UnitInputUnit[]) => JSON.stringify(units),
  fromProperty: parseUnits,
}

// Decimals a converted number keeps: those of the unit's step (`0.25`, `1e-3`), or 6 when it has none.
function decimalsOf(step: string | undefined) {
  const amount = Number(step)
  if (!step || !Number.isFinite(amount) || amount <= 0) return 6
  const [digits, exponent] = amount.toExponential().split('e')
  return Math.max(0, (digits.split('.')[1] ?? '').length - Number(exponent))
}

// The quantity `amount` of a unit holds in base units, without the float noise of the product (`0.30000000000000004`).
function toBase(amount: number, factor: number) {
  return factor === 1 ? amount : Number((amount * factor).toPrecision(15))
}

/**
 * A quantity with its unit of measure: a number field with a unit picker, the units field of an inventory or purchase
 * form (each, dozen, case; kg and lb). It is `c2-number-input` with units added, so the field, the step controls,
 * validation and every `--c2-number-input--*` variable work the same.
 *
 * `units` lists the units, each with the number of base units it holds (`factor`): as JSON
 * (`[{"value":"ea","factor":1},{"value":"dozen","label":"Dozen","factor":12}]`), or as the short form
 * `ea=1;dozen=12;case=144`. With two or more units a native picker follows the number; with one, its label does.
 *
 * Picking another unit converts the number (24 ea becomes 2 dozen) and fires `unit-change`, then `input` and
 * `change` when the number moved. Setting `unit` from code selects a unit without converting, which is what loading a
 * saved record needs; `convertTo()` converts. While a unit other than the base one (`factor: 1`) is selected, the
 * equivalent in the base unit is shown after the number (`= 24 ea`) and read with it.
 *
 * `value`, `min`, `max` and `step` are in the selected unit; a unit's own `step` replaces `step` while it is
 * selected, and a converted number is rounded to that step's decimals (6 without one). A conversion never rounds a
 * quantity away: 5 ea in a unit of whole dozens is 0.416667 dozen, which reports `stepMismatch` like any number off
 * the step until the user corrects it. `baseValue` reads and writes the quantity in the base unit. The number is submitted under `name`, the unit under `unit-name`.
 *
 * @tag c2-unit-input
 *
 * @slot chevron-icon - Replaces the chevron of the unit picker.
 *
 * @csspart unit - The unit's label after the number, when `units` holds a single unit.
 * @csspart equivalent - The number in the base unit (`= 24 ea`), shown while another unit is selected.
 * @csspart picker - The box around the unit picker.
 * @csspart chevron-icon - The box of the picker's chevron, placed over the right end of the picker.
 *
 * @event {CustomEvent<UnitInputUnitChangeDetail>} unit-change - The user picked another unit. Does not bubble; listen on the element.
 *
 * @cssproperty {color} [--c2-unit-input__unit--color=#71717a]
 * @cssproperty {font-size} [--c2-unit-input__unit--font-size=14px]
 * @cssproperty {display} [--c2-unit-input__equivalent--display=inline] - `none` hides the equivalent in the base unit from view; a screen reader still reads it with the number.
 * @cssproperty {color} [--c2-unit-input__equivalent--color=#71717a]
 * @cssproperty {font-size} [--c2-unit-input__equivalent--font-size=12px]
 * @cssproperty {padding} [--c2-unit-input__picker--padding=0 30px 0 10px] - Space around the unit in the picker; the right side holds the chevron.
 * @cssproperty {color} [--c2-unit-input__picker--color=#18181b]
 * @cssproperty {color} [--c2-unit-input__picker--background=transparent]
 * @cssproperty {color} [--c2-unit-input__picker__hover--background=#f4f4f5]
 * @cssproperty {font-size} [--c2-unit-input__picker--font-size=14px]
 * @cssproperty {font-weight} [--c2-unit-input__picker--font-weight=500]
 * @cssproperty {border} [--c2-unit-input__picker--border-left=1px solid #e4e4e7] - Line between the step controls and the unit picker.
 * @cssproperty {outline} [--c2-unit-input__picker__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Keyboard focus ring of the unit picker.
 * @cssproperty {pixel} [--c2-unit-input__icon--size=16px]
 * @cssproperty {color} [--c2-unit-input__icon--color=#71717a]
 */
@customElement('c2-unit-input')
export class UnitInput extends NumberInput {
  static override styles = [NumberInput.styles, unsafeCSS(styles)]

  private readonly unitMsg = new LocalizeController(this, unitInputMessages)
  private defaultUnit = ''
  private defaultUnitCaptured = false
  // The exact base quantity of the last conversion, so converting back and forth does not drift (5 ea → dozen → ea).
  private carried?: { value: string; unit: string; base: number }
  private equivalent = ''
  private _units: UnitInputUnit[] = []

  /**
   * The units the user may pick from. As an attribute, a JSON array of `{ value, label?, factor?, step? }` or the
   * short form `ea=1;dozen=12;case=144`.
   */
  @property({ converter: unitsConverter })
  get units(): UnitInputUnit[] {
    return this._units
  }
  set units(next: UnitInputUnit[]) {
    const old = this._units
    // A string assigned to the property (the attribute's JSON or short form) is read like the attribute.
    this._units = parseUnits(next)
    // A conversion remembered under the old units would give `baseValue` the old factor.
    this.carried = undefined
    this.requestUpdate('units', old)
  }
  /** The `value` of the selected unit. Empty, or a code `units` does not hold, selects the first unit. Setting it does not convert the number. */
  @property({ type: String }) unit = ''
  /** Form field name of the unit. Empty submits the number only. */
  @property({ attribute: 'unit-name' }) unitName = ''
  /** Accessible name of the unit picker, when several fields with pickers sit together ("Order unit"). Default: "Unit". */
  @property({ attribute: 'unit-label' }) unitLabel = ''

  /** The selected unit, or `undefined` while `units` is empty. */
  get selectedUnit(): UnitInputUnit | undefined {
    return this.units.find((unit) => unit.value === this.unit) ?? this.units[0]
  }
  /** The unit whose `factor` is 1, which the equivalent and `baseValue` are in. */
  get baseUnit(): UnitInputUnit | undefined {
    return this.units.find((unit) => unit.factor === 1)
  }
  /** The quantity in the base unit (`24` for 2 dozen), or `NaN` when the field is empty or the unit has no factor. Setting it writes `value` in the selected unit, rounded to its step, and does nothing while the unit has no factor. */
  get baseValue(): number {
    const unit = this.selectedUnit
    const amount = Number(this.value)
    if (this.value === '' || !unit?.factor || !Number.isFinite(amount)) return Number.NaN
    const carried = this.carried
    return carried && carried.value === this.value && carried.unit === unit.value ? carried.base : toBase(amount, unit.factor)
  }
  set baseValue(base: number) {
    const unit = this.selectedUnit
    if (!unit?.factor) return
    this.value = Number.isFinite(base) ? this.express(base, unit, unit.factor) : ''
  }

  override connectedCallback() {
    super.connectedCallback()
    if (!this.defaultUnitCaptured) {
      this.defaultUnit = this.getAttribute('unit') ?? ''
      this.defaultUnitCaptured = true
    }
  }

  /** Selects another unit and converts the number into it (24 ea becomes 2 dozen). Fires no event. */
  convertTo(unit: string) {
    const to = this.units.find((item) => item.value === unit)
    if (!to) return
    const base = this.baseValue
    if (to.factor && Number.isFinite(base)) this.value = this.express(base, to, to.factor)
    this.unit = to.value
  }

  override formResetCallback() {
    super.formResetCallback()
    this.unit = this.defaultUnit
    this.carried = undefined
  }
  override formStateRestoreCallback(state: string | File | FormData | null) {
    if (!(state instanceof FormData)) return super.formStateRestoreCallback(state)
    // The state holds the number and the unit whatever `name` and `unit-name` are (see `formState`).
    const unit = state.get('unit')
    const value = state.get('value')
    if (typeof unit === 'string') this.unit = unit
    if (typeof value === 'string') this.value = value
    this.carried = undefined
  }

  protected override get effectiveStep() {
    return this.selectedUnit?.step || this.step
  }

  protected override formValue(): string | FormData {
    if (!this.unitName) return this.value
    const data = new FormData()
    if (this.name) data.append(this.name, this.value)
    data.append(this.unitName, this.selectedUnit?.value ?? '')
    return data
  }

  protected override formState(): FormData {
    const state = new FormData()
    state.append('value', this.value)
    state.append('unit', this.selectedUnit?.value ?? '')
    return state
  }

  protected override ownsClick(target: HTMLElement) {
    return !!target.closest('.picker')
  }

  protected override descriptionIds() {
    return [...(this.units.length ? ['unit-name'] : []), ...(this.equivalent ? ['equivalent'] : [])]
  }

  // `base` written in `unit`, rounded to the unit's step, remembering the exact base for the next conversion.
  private express(base: number, unit: UnitInputUnit, factor: number) {
    const value = String(Number((base / factor).toFixed(decimalsOf(unit.step))))
    this.carried = { value, unit: unit.value, base }
    return value
  }

  private equivalentText() {
    const unit = this.selectedUnit
    const base = this.baseUnit
    const amount = this.baseValue
    if (!unit || !base || unit === base || !Number.isFinite(amount)) return ''
    const digits = base.step ? decimalsOf(base.step) : 3
    const text = new Intl.NumberFormat(this.unitMsg.locale, { maximumFractionDigits: digits }).format(amount)
    return this.unitMsg.t(Number(amount.toFixed(digits)) === amount ? 'equivalent' : 'approximately', text, base.label || base.value)
  }

  private async handleUnitChange(event: Event) {
    event.stopPropagation()
    const previousUnit = this.selectedUnit?.value ?? ''
    const before = this.value
    this.convertTo((event.target as HTMLSelectElement).value)
    // Read now: another pick or a write from code may land while the update is pending.
    const unit = this.unit
    const moved = this.value !== before
    await this.updateComplete
    this.dispatchEvent(new CustomEvent<UnitInputUnitChangeDetail>('unit-change', { detail: { unit, previousUnit } }))
    if (moved) {
      this.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText' }))
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    }
  }

  override render() {
    // The base render reads the equivalent twice (its text and the number's description), after the language resolved.
    this.equivalent = this.equivalentText()
    return super.render()
  }

  protected override renderValueEnd() {
    const unit = this.selectedUnit
    if (!unit) return nothing
    const label = unit.label || unit.value
    return html`${
      this.units.length === 1 ? html`<span id="unit-name" class="unit" part="unit">${label}</span>` : html`<span id="unit-name" hidden>${label}</span>`
    }${this.equivalent ? html`<span id="equivalent" class="equivalent" part="equivalent">${this.equivalent}</span>` : nothing}`
  }

  protected override renderFieldEnd() {
    if (this.units.length < 2) return nothing
    const current = this.selectedUnit
    // The picker's own `input` and `change` are composed and would read as edits of the number; the field fires its
    // own when a pick converts the number.
    return html`<span class="picker" part="picker">
      <select
        aria-label=${this.unitLabel || this.unitMsg.t('unit')}
        ?disabled=${this.effectiveDisabled || this.readOnly}
        @change=${this.handleUnitChange}
        @focusin=${this.handleFocusIn}
        @focusout=${this.handleFocusOut}
        @input=${(event: Event) => event.stopPropagation()}
      >
        ${this.units.map((unit) => html`<option value=${unit.value} ?selected=${unit === current} .selected=${unit === current}>${unit.label || unit.value}</option>`)}
      </select>
      <span class="chevron" part="chevron-icon" aria-hidden="true">
        <slot name="chevron-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6"></path>
          </svg>
        </slot>
      </span>
    </span>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-unit-input': UnitInput
  }
}
