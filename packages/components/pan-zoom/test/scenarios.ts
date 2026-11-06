// The app's languages: French, added as an app would.
import './translations.js'
import '../src/pan-zoom'

/**
 * A component that draws its content inside its own shadow root, as `c2-mind-map` does: the pan-zoom sits in that
 * shadow root and the topics are its slotted children there.
 */
class ShadowBoard extends HTMLElement {
  constructor() {
    super()
    const root = this.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>
        c2-pan-zoom { width: 600px; --c2-pan-zoom--height: 400px; --c2-pan-zoom--border: none; --c2-pan-zoom--transition-duration: 0ms; }
        .board { position: relative; width: 2000px; height: 1200px; }
        .topic { position: absolute; width: 120px; height: 40px; }
      </style>
      <c2-pan-zoom gestures="pan" bounds="none" no-keyboard no-double-click-zoom label="Board">
        <div class="board">
          <div class="topic" id="near" tabindex="0" style="left: 40px; top: 40px">Near</div>
          <div class="topic" id="far" tabindex="-1" style="left: 1800px; top: 1100px">Far</div>
        </div>
      </c2-pan-zoom>`
  }
}
customElements.define('test-shadow-board', ShadowBoard)

document.documentElement.dataset.modulesReady = 'true'
