import { LitElement, html, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import styles from './stat.scss?inline'

export type StatTone = 'neutral' | 'positive' | 'negative' | 'warning'

/**
 * A compact KPI block with an optional icon and trend. Text can be supplied through attributes for simple cases or
 * replaced with slots when the value needs richer formatting.
 *
 * @tag c2-stat
 * @slot value - Replaces the `value` text.
 * @slot label - Replaces the `label` text.
 * @slot icon - Icon shown in the tinted leading container.
 * @slot trend - Badge or short trend text shown beside the value.
 * @slot description - Supporting context below the label.
 * @csspart container - The outer statistic layout container.
 * @csspart icon - Container wrapping the assigned leading `icon` slot.
 * @csspart value - Container wrapping the assigned primary `value` slot.
 * @csspart trend - Container wrapping the assigned `trend` slot badge or text.
 * @csspart label - Container wrapping the assigned statistic `label` slot.
 * @csspart description - Container wrapping the assigned supporting `description` slot.
 *
 * @cssproperty {padding} [--c2-stat--padding=16px]
 * @cssproperty {pixel} [--c2-stat--gap=12px]
 * @cssproperty {color} [--c2-stat--background=#ffffff]
 * @cssproperty {color} [--c2-stat--color=#18181b]
 * @cssproperty {border} [--c2-stat--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-stat--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-stat--box-shadow=none]
 * @cssproperty {pixel} [--c2-stat__icon--size=40px]
 * @cssproperty {color} [--c2-stat__icon--background=#f4f4f5]
 * @cssproperty {color} [--c2-stat__icon--color=#71717a]
 * @cssproperty {border-radius} [--c2-stat__icon--border-radius=8px]
 * @cssproperty {color} [--c2-stat__icon__positive--background=#dcfce7]
 * @cssproperty {color} [--c2-stat__icon__positive--color=#15803d]
 * @cssproperty {color} [--c2-stat__icon__negative--background=#fee2e2]
 * @cssproperty {color} [--c2-stat__icon__negative--color=#b91c1c]
 * @cssproperty {color} [--c2-stat__icon__warning--background=#fef3c7]
 * @cssproperty {color} [--c2-stat__icon__warning--color=#a16207]
 * @cssproperty {font-size} [--c2-stat__value--font-size=24px]
 * @cssproperty {font-weight} [--c2-stat__value--font-weight=600]
 * @cssproperty {pixel} [--c2-stat__value--line-height=32px]
 * @cssproperty {font-size} [--c2-stat__label--font-size=14px]
 * @cssproperty {color} [--c2-stat__label--color=#71717a]
 * @cssproperty {font-size} [--c2-stat__description--font-size=12px]
 * @cssproperty {color} [--c2-stat__description--color=#71717a]
 */
@customElement('c2-stat')
export class Stat extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Plain-text metric. Use the `value` slot for formatted markup. */
  @property() value = ''

  /** Plain-text label. Use the `label` slot for formatted markup. */
  @property() label = ''

  /** Semantic colour applied to the icon container. */
  @property({ reflect: true }) tone: StatTone = 'neutral'

  override render() {
    return html`
      <div class="c2-stat" part="container">
        <span class="icon" part="icon" aria-hidden="true"><slot name="icon"></slot></span>
        <div class="content">
          <div class="value-row">
            <div class="value" part="value"><slot name="value">${this.value}</slot></div>
            <div class="trend" part="trend"><slot name="trend"></slot></div>
          </div>
          <div class="label" part="label"><slot name="label">${this.label}</slot></div>
          <div class="description" part="description">
            <slot name="description"></slot>
          </div>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-stat': Stat
  }
}
