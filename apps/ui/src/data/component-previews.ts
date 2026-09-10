/**
 * Live preview markup for the component gallery on the landing page, keyed by doc id
 * (the `.mdx` filename in `src/content/components`). Markup is emitted as plain HTML and
 * upgraded client-side by the gallery's script, which imports every component package.
 */
export const componentPreviews: Record<string, string> = {
  accordion: `<c2-accordion style="width:240px">
  <c2-details label="Shipping" expanded>Delivered in 3–5 business days.</c2-details>
  <c2-details label="Returns">Return within 30 days.</c2-details>
</c2-accordion>`,
  avatar: `<div class="preview-row">
  <c2-avatar name="Nguyen Thai Vinh" status="online"></c2-avatar>
  <c2-avatar auto-color name="Elisa Jasmin" initial-count="2"></c2-avatar>
  <c2-avatar auto-color name="Ada Lovelace" initial-count="2"></c2-avatar>
  <c2-avatar name="Grace Hopper" src="/web-components/chat.avif"></c2-avatar>
</div>`,
  badge: `<div class="preview-row">
  <c2-badge tone="success">Active</c2-badge>
  <c2-badge tone="warning">Pending</c2-badge>
  <c2-badge tone="danger" count="120"></c2-badge>
  <c2-badge dot tone="success" pulse></c2-badge>
</div>`,
  breadcrumb: `<c2-breadcrumb>
  <c2-link-button href="#">Home</c2-link-button>
  <c2-link-button href="#">Library</c2-link-button>
  <c2-link-button href="#">Data</c2-link-button>
</c2-breadcrumb>`,
  button: `<div class="preview-row">
  <c2-button><svg slot="prefix-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>New item</c2-button>
  <c2-button running>Saving…</c2-button>
</div>`,
  'button-group': `<div style="display:grid;gap:12px;justify-items:start">
  <c2-button-group selection="single" value="week" style="--c2-button-group--border: 1px solid #d4d4d8; --c2-button-group__divider--color: #d4d4d8; --c2-button__container--background-color: transparent; --c2-button__container--color: #3f3f46; --c2-button__container__hover--background-color: #f4f4f5; --c2-button__container__selected--background-color: #edf1fe; --c2-button__container__selected--color: #0265dc">
    <c2-button value="day">Day</c2-button><c2-button value="week">Week</c2-button><c2-button value="month">Month</c2-button>
  </c2-button-group>
  <c2-button-group><c2-button>Save</c2-button><c2-button>Publish</c2-button></c2-button-group>
</div>`,
  card: `<c2-card style="width:220px">
  <div slot="header" style="font-size:14px;font-weight:600">Card title</div>
  <div style="font-size:12px;line-height:1.5;color:#71717a">Supporting text that describes what this card is about.</div>
</c2-card>`,
  'chat-input': `<c2-chat-input style="width:240px" placeholder="Type a message…"></c2-chat-input>`,
  'chat-message': `<c2-chat-message style="width:240px">
  <c2-avatar name="Elisa Jasmin" initial-count="2" slot="avatar"></c2-avatar>
  <div slot="title">Elisa</div>
  <div slot="header-time">17:29</div>
  <div slot="message">Bonjour 👋</div>
</c2-chat-message>`,
  checkbox: `<div class="preview-row">
  <c2-checkbox checked></c2-checkbox>
  <c2-checkbox indeterminate></c2-checkbox>
  <c2-checkbox></c2-checkbox>
  <c2-checkbox checked disabled></c2-checkbox>
</div>`,
  'code-viewer': `<c2-code-viewer style="width:240px" language="ts" line-numbers code="const greet = (name: string) =>\n  \`Hello, \${name}!\`"></c2-code-viewer>`,
  'color-area': `<c2-color-area hue="210" saturation="0.8" value="0.9" style="width:200px;height:100px"></c2-color-area>`,
  'color-select': `<div class="preview-row">
  <c2-color-select color="#2563eb"></c2-color-select>
  <c2-color-select color="#ff726b"></c2-color-select>
  <c2-color-select color="#efc94c"></c2-color-select>
  <c2-color-select color="#b280c1"></c2-color-select>
</div>`,
  'color-slider': `<c2-color-slider value="200" style="width:220px"></c2-color-slider>`,
  details: `<c2-details expanded style="width:240px" label="Shipping">
  <div style="font-size:12px;line-height:1.5;color:#52525b">Delivered in 3–5 business days. Free over $50.</div>
</c2-details>`,
  'feather-icons': `<div class="preview-row" style="gap:18px;--c2-feather-icon--size:26px">
  <c2-feather-heart></c2-feather-heart>
  <c2-feather-camera></c2-feather-camera>
  <c2-feather-settings></c2-feather-settings>
  <c2-feather-arrow-right></c2-feather-arrow-right>
</div>`,
  'icon-button': `<div class="preview-row">
  <c2-icon-button tooltip="Camera">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
  </c2-icon-button>
  <c2-icon-button tooltip="Favorite">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
  </c2-icon-button>
  <c2-icon-button tooltip="Settings">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
  </c2-icon-button>
</div>`,
  label: `<div class="preview-row">
  <c2-label for="preview-label-input">Email</c2-label>
  <c2-text-field id="preview-label-input" placeholder="you@example.com" style="width:170px"></c2-text-field>
</div>`,
  'list-item': `<div style="width:200px">
  <c2-list-item selected>Selected item</c2-list-item>
  <c2-list-item>Default item</c2-list-item>
  <c2-list-item disabled>Disabled item</c2-list-item>
</div>`,
  list: `<c2-list value="design" style="width:200px">
  <h6>Folders</h6>
  <c2-list-item value="inbox">Inbox</c2-list-item>
  <c2-list-item value="design">Design</c2-list-item>
  <hr />
  <c2-list-item value="archive">Archive</c2-list-item>
</c2-list>`,
  'mat-icon': `<div class="preview-row" style="gap:18px;font-size:26px">
  <c2-mat-icon>home</c2-mat-icon>
  <c2-mat-icon>favorite</c2-mat-icon>
  <c2-mat-icon>settings</c2-mat-icon>
  <c2-mat-icon>search</c2-mat-icon>
</div>`,
  modal: `<div class="preview-row">
  <c2-button onclick="this.nextElementSibling.show()">Open modal</c2-button>
  <c2-modal>
    <span slot="title">Invite your team</span>
    <div style="font-size:13px;color:#71717a">Share the link with your teammates.</div>
    <c2-button slot="footer" onclick="this.closest('c2-modal').close()">Done</c2-button>
  </c2-modal>
</div>`,
  overlay: `<div>
  <button class="preview-button" popovertarget="preview-overlay">Open overlay</button>
  <c2-overlay id="preview-overlay" popover="auto" placement="bottom-start">
    <div class="preview-popover">Anchored overlay content</div>
  </c2-overlay>
</div>`,
  radio: `<c2-radio-group value="pro" style="width:200px">
  <c2-radio value="free" label="Free"></c2-radio>
  <c2-radio value="pro" label="Pro"></c2-radio>
  <c2-radio value="team" label="Team" disabled></c2-radio>
</c2-radio-group>`,
  seperator: `<div style="display:grid;gap:14px;width:200px;font-size:12px;color:#71717a">
  <c2-seperator></c2-seperator>
  <c2-seperator>or</c2-seperator>
  <c2-seperator style="--c2-seperator--style: dashed"></c2-seperator>
</div>`,
  select: `<c2-select value="FR" placeholder="Select a country" style="width:190px">
  <c2-list-item value="US">United States</c2-list-item>
  <c2-list-item value="CA">Canada</c2-list-item>
  <c2-list-item value="FR">France</c2-list-item>
  <c2-list-item value="VN">Vietnam</c2-list-item>
</c2-select>`,
  'side-nav': `<div style="position:relative;width:240px;height:110px;border:1px solid var(--site-color-outline-variant);border-radius:8px;overflow:hidden">
  <c2-side-nav opened style="height:100%;--c2-side-nav__open--width:88px;--c2-side-nav--padding-top:10px;--c2-side-nav--padding-right:8px;--c2-side-nav--padding-bottom:10px;--c2-side-nav--padding-left:8px;--c2-side-nav--background-color:var(--site-color-surface-container-3);--c2-side-nav__divider--color:var(--site-color-outline-variant)">
    <div slot="side-nav-content" style="font-size:13px;line-height:1.9;padding-left:4px">Inbox<br>Drafts<br>Sent</div>
    <div style="padding:12px;font-size:13px">Main content</div>
  </c2-side-nav>
</div>`,
  slider: `<div style="display:grid;gap:12px;width:220px">
  <c2-slider value="40"></c2-slider>
  <c2-slider value="60" ticks step="20"></c2-slider>
</div>`,
  spinner: `<div class="preview-row">
  <c2-spinner></c2-spinner>
  <c2-spinner value="65" style="--c2-spinner--size: 32px"></c2-spinner>
  <c2-spinner>Loading…</c2-spinner>
</div>`,
  switch: `<div class="preview-row">
  <c2-switch checked></c2-switch>
  <c2-switch></c2-switch>
  <c2-switch checked>Notifications</c2-switch>
</div>`,
  tabs: `<c2-tabs selected-tab="tab2" style="width:240px">
  <c2-tab label="Overview" for="tab1"></c2-tab>
  <c2-tab label="Activity" for="tab2"></c2-tab>
  <c2-tab label="Settings" for="tab3" disabled></c2-tab>
  <div id="tab1" style="padding:8px 0;font-size:13px">Overview panel</div>
  <div id="tab2" style="padding:8px 0;font-size:13px">Activity panel</div>
</c2-tabs>`,
  'link-button': `<div class="preview-row">
  <c2-link-button href="#">Documentation</c2-link-button>
  <c2-link-button href="#" selected>Overview</c2-link-button>
  <c2-link-button href="#">Learn more<svg slot="suffix-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"></path></svg></c2-link-button>
</div>`,
  toast: `<c2-toast variant="success" heading="Changes saved" message="Your work is up to date." style="width:250px"></c2-toast>`,
  textarea: `<c2-textarea label="Message" placeholder="Write a message…" rows="2" style="width:220px"></c2-textarea>`,
  'text-field': `<c2-text-field placeholder="Your email" help="We never share it." style="width:220px"></c2-text-field>`,
  tooltip: `<button class="preview-button">Hover me<c2-tooltip>Helpful tooltip</c2-tooltip></button>`,
}
