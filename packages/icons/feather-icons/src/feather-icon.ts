import { LitElement, html, unsafeCSS, type TemplateResult } from 'lit'
import styles from './feather-icon.scss?inline'

type IconElementConstructor = new () => HTMLElement

/**
 * Registers an icon once and reuses the registered constructor if another bundle evaluates the module again.
 *
 * Astro can place the same icon in multiple independently hydrated islands. Those islands may receive separate
 * copies of an icon module, while the browser still has one shared CustomElementRegistry. Returning the constructor
 * already in that registry keeps both `customElements.define()` and `new Component()` safe.
 */
export function safeCustomElement(tagName: string) {
  return <T extends IconElementConstructor>(elementClass: T): T => {
    const registeredClass = customElements.get(tagName)
    if (registeredClass) return registeredClass as T
    const defineElement = customElements.define.bind(customElements)
    defineElement(tagName, elementClass)
    return elementClass
  }
}

/**
 * Shared base class for every generated `c2-feather-*` icon element.
 *
 * It owns the `<svg>` wrapper (Feather's 24x24 stroked canvas) and the theming
 * CSS custom properties; each generated subclass only supplies the inner SVG
 * markup via `renderIcon()`. This class is not registered as a custom element.
 */
export abstract class FeatherIcon extends LitElement {
  static override styles = unsafeCSS(styles)

  protected abstract renderIcon(): TemplateResult<2>

  override render() {
    return html`<svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      ${this.renderIcon()}
    </svg>`
  }
}
