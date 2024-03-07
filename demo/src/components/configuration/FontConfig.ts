import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import '@c2n/select'
import '@c2n/text-field'

@customElement('demo-font-config')
export class FontConfig extends LitElement {
  static styles = [
    css`
      :host {
        display: block;
      }
      .font-config {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .font-config-content {
        display: flex;
        flex-wrap: wrap;
        align-item: center;
        padding: 0px 0px;
        gap: 4px;
        --c2-select__button--padding-left: 4px;
        --c2-select__button--padding-right: 4px;
        --c2-select__button--font-size: 0.7rem;
        --c2-select__button--padding-top: 4px;
        --c2-select__button--padding-bottom: 4px;
        --c2-select__default-icon--size: 16px;
        --c2-list-item--font-size: 0.7rem;
      }
      #font-family {
        width: 69%;
      }
      #font-size {
        width: 29%;
      }
      #font-style {
        width: 120px;
      }
      #font-weight {
        width: 100px;
      }
    `,
  ]

  render() {
    return html`<div class="font-config">
      <div>font</div>
      <div class="font-config-content">
        <c2-select id="font-family" placeholder="font-family">
          <c2-list-item value="Anonymous Pro">Anonymous Pro</c2-list-item>
          <c2-list-item value="Caveat">Caveat</c2-list-item>
          <c2-list-item value="Crimson Text">Crimson Text</c2-list-item>
          <c2-list-item value="Figma Hand">Figma Hand</c2-list-item>
          <c2-list-item value="IMB Plex Mono">IBM Plex Mono</c2-list-item>
          <c2-list-item value="Inter">Inter</c2-list-item>
          <c2-list-item value="Pacifico">Pacifico</c2-list-item>
          <c2-list-item value="Playfair Display">Playfair Display</c2-list-item>
          <c2-list-item value="Roboto">Roboto</c2-list-item>
          <c2-list-item value="Roboto Mono">Roboto Mono</c2-list-item>
          <c2-list-item value="Source Serif Pro">Source Serif Pro</c2-list-item>
        </c2-select>
        <c2-text-field placeholder="font-size" id="font-size"></c2-text-field>

        <c2-select id="font-style" placeholder="font-style">
          <c2-list-item value="normal">Normal</c2-list-item>
          <c2-list-item value="italic">Italic</c2-list-item>
          <c2-list-item value="oblique">Oblique</c2-list-item>
        </c2-select>

        <c2-select id="font-weight" placeholder="font-weight">
          <c2-list-item value="normal">Normal</c2-list-item>
          <c2-list-item value="bold">Bold</c2-list-item>
          <c2-list-item value="lighter">Lighter</c2-list-item>
          <c2-list-item value="bolder">Bolder</c2-list-item>
          <c2-list-item value="100">100</c2-list-item>
          <c2-list-item value="200">200</c2-list-item>
          <c2-list-item value="300">300</c2-list-item>
          <c2-list-item value="400">400</c2-list-item>
          <c2-list-item value="500">500</c2-list-item>
          <c2-list-item value="600">600</c2-list-item>
          <c2-list-item value="700">700</c2-list-item>
          <c2-list-item value="800">800</c2-list-item>
          <c2-list-item value="900">900</c2-list-item>
        </c2-select>
      </div>
    </div>`
  }
}

async function getLocalFonts() {
  const availableFonts = await window.queryLocalFonts()
}
