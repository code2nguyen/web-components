import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import '@c2n/text-field'
import '@c2n/checkbox'

@customElement('demo-size-config')
export class SizeConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;

        --c2-checkbox-uncheckmark-color: var(--primary-text-color);
        --c2-checkbox-checkmark-color: var(--primary-text-color);
        --c2-checkbox-container-border-width: 0px;
        --c2-checkbox-state-layer-hover-unselected-color: transparent;
        --c2-checkbox-container-enabled-selected-color: transparent;
        --c2-checkbox-state-layer-hover-selected-color: transparent;
        --c2-checkbox-touch-target-size: 16px;
        --c2-checkbox-container-height: 16px;
        --c2-checkbox-checkmark-size: 16px;
        --c2-checkbox-uncheckmark-size: 16px;
        --c2-checkbox-state-layer-size: 16px;
        --c2-text-field-padding-left: 0px;
        --c2-text-field-border-top: 1px solid transparent;
        --c2-text-field-border-left: 1px solid transparent;
        --c2-text-field-border-bottom: 1px solid transparent;
        --c2-text-field-border-right: 1px solid transparent;
        --c2-text-field-bg-color: transparent;

        --c2-text-field-focus-border-top: 1px solid var(--logo-color-1);
        --c2-text-field-focus-border-left: 1px solid var(--logo-color-1);
        --c2-text-field-focus-border-bottom: 1px solid var(--logo-color-1);
        --c2-text-field-focus-border-right: 1px solid var(--logo-color-1);
      }
      .text-prefix {
        padding: 0px 4px;
      }
      .container {
        display: grid;
        grid-template-columns: 1fr 1fr 18px;
        grid-auto-flow: column;
        align-items: center;
        gap: 4px;
      }
    `,
  ]

  render() {
    return html` <div class="container">
      <c2-text-field>
        <span class="text-prefix" slot="prefix-icon">W</span>
      </c2-text-field>
      <c2-text-field>
        <span class="text-prefix" slot="prefix-icon">H</span>
      </c2-text-field>
      <c2-checkbox>
        <svg slot="checkmark" fill="currentColor" viewBox="0 0 256 256">
          <path
            d="M137.54,186.36a8,8,0,0,1,0,11.31l-9.94,10A56,56,0,0,1,48.38,128.4L72.5,104.28A56,56,0,0,1,149.31,102a8,8,0,1,1-10.64,12,40,40,0,0,0-54.85,1.63L59.7,139.72a40,40,0,0,0,56.58,56.58l9.94-9.94A8,8,0,0,1,137.54,186.36Zm70.08-138a56.08,56.08,0,0,0-79.22,0l-9.94,9.95a8,8,0,0,0,11.32,11.31l9.94-9.94a40,40,0,0,1,56.58,56.58L172.18,140.4A40,40,0,0,1,117.33,142,8,8,0,1,0,106.69,154a56,56,0,0,0,76.81-2.26l24.12-24.12A56.08,56.08,0,0,0,207.62,48.38Z"
          ></path>
        </svg>
        <svg slot="uncheckmark" fill="currentColor" viewBox="0 0 256 256">
          <path
            d="M232,80a55.67,55.67,0,0,1-16.4,39.6l-30.07,30.06a8,8,0,0,1-11.31-11.32l30.07-30.06a40,40,0,1,0-56.57-56.56L117.66,81.77a8,8,0,0,1-11.32-11.32L136.4,40.4A56,56,0,0,1,232,80Zm-93.66,94.22-30.06,30.06a40,40,0,1,1-56.56-56.57l30.05-30.05a8,8,0,0,0-11.32-11.32L40.4,136.4a56,56,0,0,0,79.2,79.2l30.06-30.07a8,8,0,0,0-11.32-11.31Z"
          ></path>
        </svg>
      </c2-checkbox>
    </div>`
  }
}
