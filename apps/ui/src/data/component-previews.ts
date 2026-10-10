/**
 * Live preview markup for the component gallery on the landing page, keyed by doc id
 * (the `.mdx` filename in `src/content/components`). Markup is emitted as plain HTML and
 * upgraded client-side by the gallery's script, which imports every component package.
 */
export const componentPreviews: Record<string, string> = {
  accordion: `<c2-accordion style="width:240px;font-size:13px;--c2-details__header--padding-top:8px;--c2-details__header--padding-bottom:8px;--c2-details__header--font-size:14px;--c2-details__content--padding-bottom:8px">
  <c2-details label="Shipping" expanded>Ships in 3–5 days.</c2-details>
  <c2-details label="Returns">Free within 30 days.</c2-details>
</c2-accordion>`,
  'area-chart': `<c2-area-chart style="width:280px;height:132px;--c2-chart--padding:8px" x-field="t" curve="smooth" fill-opacity="0.22" legend="none" data='[{"t":1,"sessions":420},{"t":2,"sessions":510},{"t":3,"sessions":486},{"t":4,"sessions":623},{"t":5,"sessions":712},{"t":6,"sessions":690},{"t":7,"sessions":804}]'><c2-chart-series field="sessions" label="Sessions"></c2-chart-series></c2-area-chart>`,
  attachment: `<c2-attachment style="width:240px" name="project-brief.pdf" type="PDF" size="2.4 MB" status="uploading" progress="64" removable></c2-attachment>`,
  autocomplete: `<c2-autocomplete style="width:240px" aria-label="Search workspace" placeholder="Search people, files…" suggestions='[{"label":"Ada Lovelace"},{"label":"Product roadmap"}]'></c2-autocomplete>`,
  avatar: `<c2-avatar-group aria-label="Project contributors" style="width:170px;--c2-avatar-group--max-width:170px;--c2-avatar-group--overlap:6px">
  <c2-avatar name="Nguyen Thai Vinh" status="online"></c2-avatar>
  <c2-avatar auto-color name="Elisa Jasmin" initial-count="2"></c2-avatar>
  <c2-avatar auto-color name="Ada Lovelace" initial-count="2"></c2-avatar>
  <c2-avatar name="Grace Hopper" src="/web-components/chat.avif"></c2-avatar>
  <c2-avatar auto-color name="Katherine Johnson" initial-count="2"></c2-avatar>
  <c2-avatar auto-color name="Margaret Hamilton" initial-count="2"></c2-avatar>
</c2-avatar-group>`,
  badge: `<div class="preview-row">
  <c2-badge tone="success">Active</c2-badge>
  <c2-badge tone="warning">Pending</c2-badge>
  <c2-badge tone="danger" count="120"></c2-badge>
  <c2-badge dot tone="success" pulse></c2-badge>
</div>`,
  banner: `<c2-banner variant="info" heading="New" message="Dashboards can be shared." dismissible style="width:300px"></c2-banner>`,
  'bar-chart': `<c2-bar-chart style="width:280px;height:132px;--c2-chart--padding:8px" label-field="team" x-type="category" legend="none" data='[{"team":"Core","shipped":18},{"team":"Web","shipped":24},{"team":"Infra","shipped":11},{"team":"Data","shipped":16}]'><c2-chart-series field="shipped" label="Shipped"></c2-chart-series></c2-bar-chart>`,
  'border-beam': `<div style="position:relative;box-sizing:border-box;width:270px;overflow:hidden;padding:20px;border:1px solid var(--c2-theme--color-outline-variant, #e4e4e7);border-radius:12px;background:var(--c2-theme--color-surface, #ffffff);color:var(--c2-theme--color-on-surface, #18181b)"><strong style="display:block;margin-bottom:7px;font-size:14px">Workspace overview</strong><span style="color:var(--c2-theme--color-on-surface-variant, #71717a);font-size:12px;line-height:1.45">Review task status and deployment health.</span><c2-border-beam style="--c2-border-beam__beam--width:2px;--c2-border-beam__beam--size:140px;--c2-border-beam__beam--color-from:#3b82f6;--c2-border-beam__beam--color-to:#a5b4fc;--c2-border-beam__beam--opacity:1;--c2-border-beam__beam--filter:drop-shadow(0 0 6px rgba(59, 130, 246, 0.75));--c2-border-beam__beam--duration:4s"></c2-border-beam></div>`,
  breadcrumb: `<c2-breadcrumb>
  <c2-link-button href="#">Home</c2-link-button>
  <c2-link-button href="#">Library</c2-link-button>
  <c2-link-button href="#">Data</c2-link-button>
</c2-breadcrumb>`,
  'bubble-chart': `<c2-bubble-chart style="width:280px;height:132px;--c2-chart--padding:8px;--c2-chart__bubble--max-size:34px" aria-label="Life expectancy against GDP per capita, sized by population" x-field="gdp" y-field="life" size-field="pop" label-field="country" series-field="region" x-scale="log" legend="none" bubble-labels="none" data='[{"country":"Nigeria","region":"Africa","gdp":1620,"life":53.6,"pop":224},{"country":"Ethiopia","region":"Africa","gdp":1290,"life":65.6,"pop":127},{"country":"Egypt","region":"Africa","gdp":3510,"life":70.2,"pop":113},{"country":"United States","region":"Americas","gdp":81700,"life":78.4,"pop":335},{"country":"Brazil","region":"Americas","gdp":10040,"life":75.8,"pop":216},{"country":"Mexico","region":"Americas","gdp":13930,"life":75.0,"pop":129},{"country":"Canada","region":"Americas","gdp":53430,"life":81.7,"pop":40},{"country":"China","region":"Asia","gdp":12610,"life":78.6,"pop":1410},{"country":"India","region":"Asia","gdp":2480,"life":72.0,"pop":1429},{"country":"Indonesia","region":"Asia","gdp":4880,"life":71.2,"pop":278},{"country":"Japan","region":"Asia","gdp":33830,"life":84.7,"pop":124},{"country":"Pakistan","region":"Asia","gdp":1370,"life":67.6,"pop":240}]'></c2-bubble-chart>`,
  'butterfly-chart': `<c2-butterfly-chart style="width:280px;height:132px;--c2-chart--padding:4px;--c2-chart__gutter--width:44px" aria-label="Population by age band, men against women" label-field="age" legend="none" data='[{"age":"60+","men":1960,"women":2610},{"age":"40–59","men":2480,"women":2530},{"age":"20–39","men":2950,"women":2880},{"age":"0–19","men":2410,"women":2295}]'><c2-chart-series field="men" label="Men"></c2-chart-series><c2-chart-series field="women" label="Women"></c2-chart-series></c2-butterfly-chart>`,
  button: `<div class="preview-row">
  <c2-button><svg slot="prefix-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>New item</c2-button>
  <c2-button running>Saving…</c2-button>
</div>`,
  'button-group': `<div style="display:grid;gap:12px;justify-items:start">
  <c2-button-group appearance="segmented" value="week">
    <c2-button value="day">Day</c2-button><c2-button value="week">Week</c2-button><c2-button value="month">Month</c2-button>
  </c2-button-group>
  <c2-button-group><c2-button>Save</c2-button><c2-button>Publish</c2-button></c2-button-group>
</div>`,
  'candlestick-chart': `<c2-candlestick-chart style="width:280px;height:132px;--c2-chart--padding:8px" label-field="date" legend="none" data='[{"date":"M","open":248.3,"close":256.1,"low":248.1,"high":256.6},{"date":"T","open":255.9,"close":254.4,"low":253.6,"high":257.3},{"date":"W","open":255.2,"close":252.3,"low":251,"high":255.7},{"date":"T","open":253.2,"close":256.9,"low":252.4,"high":257.2},{"date":"F","open":254.1,"close":255.5,"low":253.1,"high":257.6}]'></c2-candlestick-chart>`,
  card: `<c2-card style="width:220px">
  <div slot="header" style="font-size:14px;font-weight:600">Card title</div>
  <div style="font-size:12px;line-height:1.5;color:var(--c2-theme--color-on-surface-variant, #71717a)">Supporting text that describes what this card is about.</div>
</c2-card>`,
  carousel: `<c2-carousel label="Preview" loop style="width:260px;--c2-carousel__control--size:28px;--c2-carousel__control--inset:8px">
  <div style="display:grid;place-items:center;height:120px;border-radius:8px;background:linear-gradient(135deg,#0265dc,#7c3aed);color:#fff;font-weight:600">1</div>
  <div style="display:grid;place-items:center;height:120px;border-radius:8px;background:linear-gradient(135deg,#db2777,#ea580c);color:#fff;font-weight:600">2</div>
  <div style="display:grid;place-items:center;height:120px;border-radius:8px;background:linear-gradient(135deg,#0f766e,#16a34a);color:#fff;font-weight:600">3</div>
</c2-carousel>`,
  cascader: `<c2-cascader aria-label="Choose a location" placeholder="Choose a district" options='[{"value":"zhejiang","label":"Zhejiang","children":[{"value":"hangzhou","label":"Hangzhou","children":[{"value":"west-lake","label":"West Lake"},{"value":"xiaoshan","label":"Xiaoshan"}]}]},{"value":"jiangsu","label":"Jiangsu","children":[{"value":"nanjing","label":"Nanjing"}]}]'></c2-cascader>`,
  'chat-input': `<c2-chat-input style="width:240px" aria-label="Message" placeholder="Ask anything…" value="Can you summarize this?"></c2-chat-input>`,
  'chat-message': `<c2-chat-message style="width:240px;--c2-chat-message__message--max-width:190px">
  <c2-avatar name="Nova AI" initials="AI" slot="avatar" style="--c2-avatar--background:#18181b"></c2-avatar>
  <span slot="title">Nova</span>
  <time slot="header-time">Now</time>
  <div>I found three ways to simplify this flow.</div>
</c2-chat-message>`,
  'chat-message-list': `<c2-chat-message-list style="width:260px;height:170px;border:1px solid var(--c2-theme--color-outline-variant, #e4e4e7);border-radius:8px;--c2-chat-message-list__content--padding:10px;--c2-chat-message-list__content--gap:10px">
  <c2-chat-message style="--c2-chat-message--font-size:13px"><c2-avatar name="Nova AI" initials="AI" slot="avatar" style="--c2-avatar--size:24px"></c2-avatar><div>How can I help today?</div></c2-chat-message>
  <c2-chat-message align="right" style="--c2-chat-message--font-size:13px"><div>Summarize my inbox.</div></c2-chat-message>
  <c2-chat-message style="--c2-chat-message--font-size:13px"><c2-avatar name="Nova AI" initials="AI" slot="avatar" style="--c2-avatar--size:24px"></c2-avatar><div>You have three threads waiting.</div></c2-chat-message>
</c2-chat-message-list>`,
  checkbox: `<div class="preview-row">
  <c2-checkbox checked></c2-checkbox>
  <c2-checkbox indeterminate></c2-checkbox>
  <c2-checkbox></c2-checkbox>
  <c2-checkbox checked disabled></c2-checkbox>
</div>`,
  'checkbox-group': `<c2-checkbox-group value="email;push" style="width:200px">
  <span slot="label">Notify me by</span>
  <c2-checkbox value="email">Email</c2-checkbox>
  <c2-checkbox value="sms">SMS</c2-checkbox>
  <c2-checkbox value="push">Push</c2-checkbox>
</c2-checkbox-group>`,
  chip: `<div class="preview-row">
  <c2-chip selectable selected>Open</c2-chip>
  <c2-chip selectable>Closed</c2-chip>
  <c2-chip removable>Status: Active</c2-chip>
</div>`,
  'chip-group': `<c2-chip-group style="width: 220px" aria-label="Topics">
  <c2-chip>Design</c2-chip>
  <c2-chip>Engineering</c2-chip>
  <c2-chip>Product</c2-chip>
  <c2-chip>Marketing</c2-chip>
</c2-chip-group>`,
  'code-editor': `<c2-code-editor style="width:300px;--c2-code-editor--min-height:132px;--c2-code-editor--font-size:12px" language="javascript" line-numbers aria-label="Example editor" value="const greet = (name) =>
  \`hello \${name}\`

// editable, highlighted
greet('world')"></c2-code-editor>`,
  'code-viewer': `<c2-code-viewer style="width:240px" language="ts" line-numbers code="const greet = (name: string) =>\n  \`Hello, \${name}!\`"></c2-code-viewer>`,
  'color-area': `<c2-color-area hue="210" saturation="0.8" value="0.9" style="width:200px;height:100px"></c2-color-area>`,
  'color-select': `<div class="preview-row">
  <c2-color-select color="#2563eb"></c2-color-select>
  <c2-color-select color="#ff726b"></c2-color-select>
  <c2-color-select color="#efc94c"></c2-color-select>
  <c2-color-select color="#b280c1"></c2-color-select>
</div>`,
  'color-slider': `<c2-color-slider value="200" style="width:220px"></c2-color-slider>`,
  command: `<c2-command style="width:260px;--c2-command__field--min-height:40px;--c2-command__list--max-height:150px">
  <c2-command-group heading="Suggestions">
    <c2-command-item value="calendar">Calendar</c2-command-item>
    <c2-command-item value="emoji">Search emoji</c2-command-item>
  </c2-command-group>
  <c2-command-group heading="Settings">
    <c2-command-item value="profile">Profile</c2-command-item>
  </c2-command-group>
</c2-command>`,
  'comparison-bar': `<c2-comparison-bar start-value="22.43" end-value="77.57" start-label="Bid" end-label="Ask" show-value style="width:240px"></c2-comparison-bar>`,
  'confirm-dialog': `<div class="preview-row">
  <c2-button onclick="this.nextElementSibling.show()" style="--c2-button__container--background-color:#dc2626;--c2-button__container__hover--background-color:#b91c1c">Delete project</c2-button>
  <c2-confirm-dialog destructive heading="Delete project?" message="This cannot be undone." confirm-label="Delete"></c2-confirm-dialog>
</div>`,
  'context-menu': `<c2-context-menu>
  <div style="display:grid;place-items:center;width:200px;height:96px;border:1px dashed var(--c2-theme--color-outline, #a1a1aa);border-radius:8px;color:var(--c2-theme--color-on-surface-variant, #71717a);font-size:13px">Right-click me</div>
  <c2-menu slot="menu" aria-label="Canvas">
    <c2-menu-item value="zoom-in">Zoom in</c2-menu-item>
    <c2-menu-item value="zoom-out">Zoom out</c2-menu-item>
    <hr />
    <c2-menu-item value="reset">Reset view</c2-menu-item>
  </c2-menu>
</c2-context-menu>`,
  'copy-button': `<div class="preview-row">
  <c2-copy-button reveal="always" value="npx -y @c2n/mcp"></c2-copy-button>
  <c2-copy-button reveal="always" value="14 Rue de Rivoli, 75001 Paris" style="--c2-copy-button__container--border: 1px solid var(--c2-theme--color-outline, #bcbcc6); --c2-copy-button__container__hover--background-color: var(--c2-theme--color-surface-container, #f4f4f5)">Copy</c2-copy-button>
</div>`,
  dashboard: `<c2-dashboard columns="1fr 1fr" rows="1fr 1fr" style="width:260px;height:150px;--c2-dashboard--gap:6px;--c2-dashboard--padding:6px;--c2-dashboard--background:var(--c2-theme--color-surface-container);--c2-dashboard--border-radius:10px;--c2-dash-card--background:var(--c2-theme--color-surface);--c2-dash-card--border:var(--c2-theme--border);--c2-dash-card--border-radius:6px;--c2-dash-card__header--font-size:11px;--c2-dash-card__header--min-height:0;--c2-dash-card__header--padding-block:6px;--c2-dash-card__header--padding-inline:8px">
  <c2-dash-card col="1" row="1" row-span="2"><span slot="header">Watchlist</span></c2-dash-card>
  <c2-dash-card col="2" row="1"><span slot="header">Price</span></c2-dash-card>
  <c2-dash-card col="2" row="2"><span slot="header">Orders</span></c2-dash-card>
</c2-dashboard>`,
  'date-input': `<c2-date-input value="2026-09-15" aria-label="Due date" style="width:220px"></c2-date-input>`,
  'date-selector': `<c2-date-selector months="1" from="2026-09-10" to="2026-09-15" locale="en-US" style="--c2-date-selector__day--size:30px;--c2-date-selector--padding:10px;--c2-date-selector--box-shadow:none"></c2-date-selector>`,
  'description-list': `<c2-description-list aria-label="Customer" style="width:280px;--c2-description-list__grid--min-column-width:120px;--c2-description-list__grid--columns:2"><c2-description-item label="Name">Ada Lovelace</c2-description-item><c2-description-item label="Plan">Business</c2-description-item><c2-description-item label="Email">ada@example.com</c2-description-item><c2-description-item label="Phone"></c2-description-item></c2-description-list>`,
  details: `<c2-details expanded style="width:240px" label="Shipping">
  <div style="font-size:12px;line-height:1.5;color:var(--c2-theme--color-on-surface-variant, #52525b)">Delivered in 3–5 business days. Free over $50.</div>
</c2-details>`,
  'feather-icons': `<div class="preview-row" style="gap:18px;--c2-feather-icon--size:26px">
  <c2-feather-heart></c2-feather-heart>
  <c2-feather-camera></c2-feather-camera>
  <c2-feather-settings></c2-feather-settings>
  <c2-feather-arrow-right></c2-feather-arrow-right>
</div>`,
  'filter-builder': `<c2-filter-builder compact-below="0" style="width:300px" fields='[{"id":"status","label":"Status","type":"enum","options":[{"value":"todo","label":"To do","color":"#a1a1aa","count":120},{"value":"doing","label":"In progress","color":"#0265dc","count":41},{"value":"review","label":"In review","color":"#d97706","count":9},{"value":"done","label":"Done","color":"#16a34a","count":142}]},{"id":"assignee","label":"Assignee","type":"person","summary":{"one":"person","other":"people"},"options":[{"value":"ana","label":"Ana Ng"},{"value":"ben","label":"Ben Kowalski"},{"value":"carla","label":"Carla Ruiz"}]},{"id":"labels","label":"Labels","type":"multi","options":[{"value":"bug","label":"Bug","color":"#dc2626"},{"value":"feature","label":"Feature","color":"#7c3aed"},{"value":"regression","label":"Regression","color":"#ea580c"}]},{"id":"title","label":"Title","type":"text"},{"id":"estimate","label":"Estimate","type":"number","unit":"pts"},{"id":"due","label":"Due","type":"date"},{"id":"blocked","label":"Blocked","type":"boolean"}]' value='{"op":"and","rules":[{"field":"status","operator":"eq","value":"doing"},{"field":"labels","operator":"has_any","value":["bug","regression"]}]}'></c2-filter-builder>`,
  flow: `<c2-flow aria-label="Pipeline" style="width:320px;--c2-flow--height:150px;--c2-flow__node--width:96px;--c2-flow__rank--gap:28px" nodes='[{"id":"build","label":"Build","status":"success","meta":"2m"},{"id":"test","label":"Test","status":"running"},{"id":"deploy","label":"Deploy","status":"pending"}]' edges='[{"source":"build","target":"test"},{"source":"test","target":"deploy"}]'></c2-flow>`,
  gantt: `<c2-gantt style="width:280px" hide-list today="2026-10-07" aria-label="Sprint">
  <c2-gantt-task task-id="a" start="2026-10-05" end="2026-10-07" progress="1" tone="success">Spec</c2-gantt-task>
  <c2-gantt-task task-id="b" start="2026-10-08" end="2026-10-14" progress="0.4" dependencies="a">Build</c2-gantt-task>
  <c2-gantt-task task-id="c" start="2026-10-15" milestone dependencies="b">Ship</c2-gantt-task>
</c2-gantt>`,
  'gauge-chart': `<c2-gauge-chart style="width:280px;height:132px;--c2-chart--padding:4px" aria-label="Services mix: 26.2%" min="0" max="40" precision="1" value-suffix="%" pointer="none" marks="none" split-number="1" legend="none" label-field="metric" data='[{"metric":"","value":26.23}]'><c2-chart-series field="value" label="Services mix"></c2-chart-series></c2-gauge-chart>`,
  'google-map': `<c2-google-map center="10.7769,106.7009" zoom="13" disable-default-ui style="width:260px;--c2-google-map__container--height:150px"><c2-google-map-marker position="10.7769,106.7009" label="Saigon Opera House"></c2-google-map-marker></c2-google-map>`,
  header: `<c2-header style="width:280px;--c2-header--padding:8px 12px;--c2-header--min-height:48px;--c2-header--gap:16px">
  <strong slot="brand">Northstar</strong>
  <span style="font-size:12px">Markets</span>
  <c2-button slot="actions" style="--c2-button__container--height:30px;--c2-button__container--padding-left:12px;--c2-button__container--padding-right:12px;--c2-button__container--font-size:13px;--c2-button__container--background-color:var(--c2-theme--color-surface-container, #f4f4f5);--c2-button__container--color:var(--c2-theme--color-on-surface, #18181b);--c2-button__container--border:1px solid var(--c2-theme--color-outline-variant, #e4e4e7);--c2-button__container__hover--background-color:var(--c2-theme--color-surface-container-low, #fafafa);--c2-button__container__active--background-color:var(--c2-theme--color-surface-container, #f4f4f5)">Sign in</c2-button>
</c2-header>`,
  'hover-card': `<c2-hover-card open-delay="200"><a slot="trigger" href="#" onclick="return false">@ada</a><strong>Ada Lovelace</strong><div style="color:var(--c2-theme--color-on-surface-variant, #71717a)">Wrote the first published algorithm.</div></c2-hover-card>`,
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
  image: `<div class="preview-row"><c2-image style="--c2-image--width:132px;--c2-image--border-radius:8px" src="/web-components/images/image-mountains.svg" alt="Mountains at sunset" width="800" height="600"></c2-image><c2-image style="--c2-image--width:132px;--c2-image--border-radius:8px" loading="click" src="/web-components/images/image-chart.svg" alt="Chart" width="640" height="480"></c2-image></div>`,
  indicator: `<div class="preview-row">
  <c2-indicator count="3" accessible-label="{count} unread"><c2-button>Inbox</c2-button></c2-indicator>
  <c2-indicator tone="success" position="bottom-end" accessible-label="Online" style="--c2-indicator--offset-x: 14.6%; --c2-indicator--offset-y: 14.6%"><c2-avatar name="Ada Lovelace" initial-count="2"></c2-avatar></c2-indicator>
  <c2-indicator tone="primary" pulse accessible-label="New"><c2-button>Changelog</c2-button></c2-indicator>
</div>`,
  'inline-edit': `<div class="preview-row"><c2-inline-edit label="Page title" value="Q4 launch plan" style="--c2-inline-edit--font-size:16px;--c2-inline-edit--font-weight:600;--c2-inline-edit__edit-icon--opacity:1"></c2-inline-edit></div>`,
  'json-viewer': `<c2-json-viewer style="width: 100%; --c2-json-viewer--max-height: 180px" data='{"id":"ord_8421","paid":true,"total":129.5,"coupon":null,"items":[{"sku":"KB-01","qty":1}]}'></c2-json-viewer>`,
  kanban: `<c2-kanban editable aria-label="Sprint board" style="--c2-kanban--gap:6px;--c2-kanban-column--width:116px;--c2-kanban-column--padding:5px;--c2-kanban-column--gap:5px;--c2-kanban-column__cards--gap:5px;--c2-kanban-column__card--padding:6px 8px;--c2-kanban-column__card--font-size:11px;--c2-kanban-column__label--font-size:12px;--c2-kanban-column__count--font-size:11px;--c2-kanban-column__empty--padding:8px 4px;--c2-kanban-column__empty--font-size:12px" items='[{"id":"1","column":"todo","title":"Search empty state"},{"id":"2","column":"todo","title":"Date input focus"},{"id":"3","column":"doing","title":"Tree drag handles"}]'><c2-kanban-column column-id="todo" label="To do"></c2-kanban-column><c2-kanban-column column-id="doing" label="Doing" limit="1"></c2-kanban-column></c2-kanban>`,
  kbd: `<div class="preview-row">
  <c2-kbd>⌘</c2-kbd>
  <c2-kbd>K</c2-kbd>
  <c2-kbd>Ctrl + Shift + P</c2-kbd>
  <c2-kbd>Esc</c2-kbd>
</div>`,
  'key-value-editor': `<c2-key-value-editor masked style="width: 100%; --c2-key-value-editor__header--display: none; --c2-key-value-editor__field--height: 28px; --c2-key-value-editor__button--size: 28px; --c2-key-value-editor__field--font-size: 12px" entries='[{"key":"DATABASE_URL","value":"postgres://app@db/app"},{"key":"NODE_ENV","value":"production","masked":false}]'></c2-key-value-editor>`,
  label: `<div class="preview-row">
  <c2-label for="preview-label-input">Email</c2-label>
  <c2-text-field id="preview-label-input" placeholder="you@example.com" style="width:170px"></c2-text-field>
</div>`,
  'line-chart': `<c2-line-chart style="width:280px;height:132px;--c2-chart--padding:8px" x-field="month" data='[{"month":1,"revenue":128,"cost":74},{"month":2,"revenue":141,"cost":79},{"month":3,"revenue":132,"cost":81},{"month":4,"revenue":167,"cost":88},{"month":5,"revenue":183,"cost":92},{"month":6,"revenue":204,"cost":97}]'><c2-chart-series field="revenue" label="Revenue"></c2-chart-series><c2-chart-series field="cost" label="Cost"></c2-chart-series></c2-line-chart>`,
  'link-button': `<div class="preview-row">
  <c2-link-button href="#">Documentation</c2-link-button>
  <c2-link-button href="#" selected>Overview</c2-link-button>
  <c2-link-button href="#">Learn more<svg slot="suffix-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"></path></svg></c2-link-button>
</div>`,
  list: `<c2-list value="design" style="width:200px">
  <h6>Folders</h6>
  <c2-list-item value="inbox">Inbox</c2-list-item>
  <c2-list-item value="design">Design</c2-list-item>
  <hr />
  <c2-list-item value="archive">Archive</c2-list-item>
</c2-list>`,
  'list-item': `<div style="width:200px">
  <c2-list-item selected>Selected item</c2-list-item>
  <c2-list-item>Default item</c2-list-item>
  <c2-list-item disabled>Disabled item</c2-list-item>
</div>`,
  'log-viewer': `<c2-log-viewer data-log-viewer-demo="preview" wrap aria-label="Store server log" style="height:180px;width:300px"></c2-log-viewer>`,
  'map-chart': `<c2-map-chart style="width:280px;height:132px;--c2-chart--padding:8px" aria-label="Revenue by country" legend="none" region-field="country" value-field="revenue" value-label="Revenue ($M)" data='[{"country":"USA","revenue":4820},{"country":"CAN","revenue":910},{"country":"MEX","revenue":640},{"country":"BRA","revenue":1270},{"country":"ARG","revenue":310},{"country":"CHL","revenue":220},{"country":"COL","revenue":260},{"country":"PER","revenue":140},{"country":"GBR","revenue":1730},{"country":"FRA","revenue":1390},{"country":"DEU","revenue":2210},{"country":"ESP","revenue":780},{"country":"ITA","revenue":870},{"country":"NLD","revenue":690},{"country":"SWE","revenue":420},{"country":"NOR","revenue":360},{"country":"POL","revenue":450},{"country":"IRL","revenue":380},{"country":"PRT","revenue":190},{"country":"CHE","revenue":520},{"country":"AUT","revenue":280},{"country":"BEL","revenue":330},{"country":"DNK","revenue":300},{"country":"FIN","revenue":210},{"country":"TUR","revenue":340},{"country":"ZAF","revenue":290},{"country":"NGA","revenue":120},{"country":"EGY","revenue":160},{"country":"KEN","revenue":70},{"country":"MAR","revenue":90},{"country":"SAU","revenue":610},{"country":"ARE","revenue":540},{"country":"ISR","revenue":330},{"country":"IND","revenue":1460},{"country":"CHN","revenue":2950},{"country":"JPN","revenue":1880},{"country":"KOR","revenue":960},{"country":"IDN","revenue":410},{"country":"VNM","revenue":230},{"country":"THA","revenue":270},{"country":"PHL","revenue":150},{"country":"MYS","revenue":200},{"country":"AUS","revenue":1120},{"country":"NZL","revenue":180}]'></c2-map-chart>`,
  marker: `<p style="max-width:240px;margin:0;font-size:15px;line-height:1.8;text-align:center">Deploys are <c2-marker>fully automated</c2-marker>, <c2-marker variant="underline">reviewed</c2-marker> and <c2-marker variant="circle">reversible</c2-marker>.</p>`,
  masonry: `<c2-masonry style="width:260px;color:var(--c2-theme--color-on-surface, #18181b);font-size:12px;--c2-masonry--gap:6px;--c2-masonry--row-height:9px;--c2-masonry--padding:6px;--c2-masonry--background:var(--c2-theme--color-surface-container, #f4f4f5);--c2-masonry--border-radius:8px;--c2-masonry-item--background:var(--c2-theme--color-surface, #ffffff);--c2-masonry-item--border:1px solid var(--c2-theme--color-outline-variant, #e4e4e7);--c2-masonry-item--border-radius:6px;--c2-masonry-item__content--padding:8px">
  <c2-masonry-item item-id="traffic" label="Traffic" rows="5" cols="3">Traffic · 18.4k</c2-masonry-item>
  <c2-masonry-item item-id="orders" label="Orders" rows="5" cols="2">Orders · 142</c2-masonry-item>
</c2-masonry>`,
  'mat-icon': `<div class="preview-row" style="gap:18px;font-size:26px">
  <c2-mat-icon>home</c2-mat-icon>
  <c2-mat-icon>favorite</c2-mat-icon>
  <c2-mat-icon>settings</c2-mat-icon>
  <c2-mat-icon>search</c2-mat-icon>
</div>`,
  menu: `<c2-menu aria-label="Row actions">
  <c2-button slot="trigger">Actions</c2-button>
  <c2-menu-item value="edit"><c2-feather-edit-2 slot="prefix-icon"></c2-feather-edit-2>Edit</c2-menu-item>
  <c2-menu-item value="duplicate"><c2-feather-copy slot="prefix-icon"></c2-feather-copy>Duplicate</c2-menu-item>
  <hr />
  <c2-menu-item value="delete" destructive><c2-feather-trash-2 slot="prefix-icon"></c2-feather-trash-2>Delete</c2-menu-item>
</c2-menu>`,
  mermaid: `<c2-mermaid style="width:260px;--c2-mermaid--font-size:12px" value="flowchart LR
  Cart --> Pay{Paid?}
  Pay -- yes --> Ship"></c2-mermaid>`,
  modal: `<div class="preview-row">
  <c2-button onclick="this.nextElementSibling.show()">Open modal</c2-button>
  <c2-modal>
    <span slot="title">Invite your team</span>
    <div style="font-size:13px;color:var(--c2-theme--color-on-surface-variant, #71717a)">Share the link with your teammates.</div>
    <c2-button slot="footer" onclick="this.closest('c2-modal').close()">Done</c2-button>
  </c2-modal>
</div>`,
  'month-planner': `<c2-month-planner month="2026-09" locale="en-US" style="width:540px;max-width:none;zoom:0.44;--c2-month-planner--padding:13px;--c2-month-planner--font-size:20px;--c2-month-planner__day--min-height:60px;--c2-month-planner__day--font-size:16px;--c2-month-planner__event--height:23px;--c2-month-planner__event--font-size:16px;--c2-month-planner__navigation--size:40px" events='[{"title":"Vacation","start":"2026-09-10","end":"2026-09-18","color":"#0f766e"},{"title":"Review","start":"2026-09-24"}]'></c2-month-planner>`,
  'navigation-menu': `<c2-navigation-menu aria-label="Main">
  <c2-navigation-menu-item value="products">
    Products
    <div style="display:grid;gap:2px;width:200px" slot="panel">
      <c2-navigation-menu-link href="#analytics">Analytics<span slot="description">Realtime dashboards</span></c2-navigation-menu-link>
      <c2-navigation-menu-link href="#warehouse">Warehouse<span slot="description">Columnar storage</span></c2-navigation-menu-link>
    </div>
  </c2-navigation-menu-item>
  <c2-navigation-menu-item value="docs" href="#docs">Docs</c2-navigation-menu-item>
  <c2-navigation-menu-item value="pricing" href="#pricing" current>Pricing</c2-navigation-menu-item>
</c2-navigation-menu>`,
  notepad: `<c2-notepad label="Groceries" style="width:240px;--c2-notepad__sheet--min-height:150px;--c2-notepad__writing--font-size:16px;--c2-notepad__rule--spacing:24px;--c2-notepad__margin--inset:36px" value="- [x] Oat milk&#10;- [ ] **Sourdough**&#10;remember the ==blue== bag"></c2-notepad>`,
  'number-input': `<c2-number-input value="4" min="0" max="12" aria-label="Quantity" style="width:190px"><span slot="suffix">items</span></c2-number-input>`,
  'otp-input': `<c2-otp-input value="4827" group="3" aria-label="Verification code" style="--c2-otp-input__cell--width:32px;--c2-otp-input__cell--height:38px;--c2-otp-input__cell--font-size:16px;--c2-otp-input--gap:6px"></c2-otp-input>`,
  'overlap-chart': `<c2-overlap-chart style="width:280px;height:132px;--c2-chart--padding:4px;--c2-chart__region-label--font-size:11px;--c2-chart__set-label--font-size:11px" set-labels="around" legend="none" data='[{"sets":["web"],"size":18420},{"sets":["mobile"],"size":12960},{"sets":["api"],"size":4310},{"sets":["web","mobile"],"size":6880},{"sets":["web","api"],"size":2150},{"sets":["mobile","api"],"size":1020},{"sets":["web","mobile","api"],"size":740}]'><c2-chart-series field="web" label="Web"></c2-chart-series><c2-chart-series field="mobile" label="Mobile"></c2-chart-series><c2-chart-series field="api" label="API"></c2-chart-series></c2-overlap-chart>`,
  overlay: `<div>
  <button class="preview-button" popovertarget="preview-overlay">Open overlay</button>
  <c2-overlay id="preview-overlay" popover="auto" placement="bottom-start">
    <div class="preview-popover">Anchored overlay content</div>
  </c2-overlay>
</div>`,
  'page-editor': `<c2-page-editor label="Notes" style="width:260px;--c2-page-editor__content--min-height:0;--c2-page-editor__content--font-size:13px;--c2-page-editor__content--padding:4px 8px 4px 24px;--c2-page-editor__heading2--font-size:17px;--c2-page-editor__block--margin-top:2px" value="## Launch plan&#10;&#10;Ship **Friday**, <span data-color=&quot;red&quot;>no slips</span>.&#10;&#10;- [x] Freeze the API&#10;- [ ] Write the docs"></c2-page-editor>`,
  pagination: `<c2-pagination total-pages="9" page="3" hide-nav-labels></c2-pagination>`,
  'password-field': `<c2-password-field placeholder="New password" autocomplete="new-password" meter value="Sunrise7!" style="width:220px"></c2-password-field>`,
  'phone-input': `<c2-phone-input value="+33612345678" style="width:240px"></c2-phone-input>`,
  'phosphor-icons': `<div class="preview-row" style="gap:18px;--c2-phosphor-icon--size:26px">
  <c2-phosphor-heart weight="fill"></c2-phosphor-heart>
  <c2-phosphor-camera></c2-phosphor-camera>
  <c2-phosphor-gear weight="duotone"></c2-phosphor-gear>
  <c2-phosphor-arrow-right weight="bold"></c2-phosphor-arrow-right>
</div>`,
  'pie-chart': `<c2-pie-chart style="width:280px;height:132px;--c2-chart--padding:8px" label-field="channel" inner-radius="0.58" legend="none" data='[{"channel":"Direct","revenue":4200},{"channel":"Search","revenue":3100},{"channel":"Social","revenue":1800},{"channel":"Email","revenue":900}]'><c2-chart-series field="revenue" label="Revenue"></c2-chart-series></c2-pie-chart>`,
  popconfirm: `<c2-popconfirm heading="Delete this task?" confirm-label="Delete"><c2-button slot="trigger">Delete task</c2-button>This cannot be undone.</c2-popconfirm>`,
  progress: `<div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:16px;width:240px">
  <div style="display:grid;gap:12px">
    <c2-progress value="72" show-value>Uploading</c2-progress>
    <c2-progress style="--c2-progress--height:4px"></c2-progress>
  </div>
  <c2-progress variant="circular" value="67" show-value label="Readiness" style="--c2-progress--size:56px;--c2-progress--height:6px"></c2-progress>
</div>`,
  'pyramid-chart': `<c2-pyramid-chart style="width:280px;height:132px;--c2-chart--padding:4px" label-field="plan" legend="none" data='[{"plan":"Enterprise","accounts":42},{"plan":"Business","accounts":318},{"plan":"Team","accounts":1260},{"plan":"Starter","accounts":4870}]'><c2-chart-series field="accounts" label="Accounts"></c2-chart-series></c2-pyramid-chart>`,
  'qr-code': `<c2-qr-code value="https://github.com/code2nguyen/web-components" size="132" aria-label="Project QR code"></c2-qr-code>`,
  'query-input': `<c2-query-input style="width: 280px" aria-label="Log query" value='service:web -status:>=500 "timed out"'></c2-query-input>`,
  questionnaire: `<c2-questionnaire style="zoom:0.5;width:448px" questions='[{"id":"direction","title":"What should the agent build next?","description":"Choose a direction or describe another task.","options":[{"value":"timeline","label":"Tool call timeline"},{"value":"approvals","label":"Approval checkpoints"},{"value":"handoffs","label":"Sub-agent handoffs"}]},{"id":"updates","title":"What should every progress update include?","type":"multiple","skippable":true,"options":[{"value":"progress","label":"Progress"},{"value":"decisions","label":"Decisions"},{"value":"risks","label":"Risks"}]},{"id":"timing","title":"When should work begin?","options":[{"value":"now","label":"Start now"},{"value":"cycle","label":"Next development cycle"}]}]'></c2-questionnaire>`,
  'radar-chart': `<c2-radar-chart style="width:280px;height:132px;--c2-chart--padding:4px" label-field="metric" max="100" points="none" data='[{"metric":"Quality","current":82,"target":90},{"metric":"Speed","current":74,"target":85},{"metric":"Reliability","current":91,"target":88},{"metric":"Efficiency","current":68,"target":80},{"metric":"Coverage","current":77,"target":84}]'><c2-chart-series field="current" label="Current"></c2-chart-series><c2-chart-series field="target" label="Target"></c2-chart-series></c2-radar-chart>`,
  radio: `<c2-radio-group value="pro" style="width:200px">
  <c2-radio value="free" label="Free"></c2-radio>
  <c2-radio value="pro" label="Pro"></c2-radio>
  <c2-radio value="team" label="Team" disabled></c2-radio>
</c2-radio-group>`,
  rate: `<div class="preview-row"><c2-rate aria-label="Rating" value="3"></c2-rate><c2-rate aria-label="Precise rating" value="4.5" allow-half></c2-rate></div>`,
  'relative-time': `<div class="preview-row"><span>Edited <c2-relative-time date="2026-09-30T14:20:00Z"></c2-relative-time></span><span>Renews <c2-relative-time format="short" date="2027-03-01T00:00:00Z"></c2-relative-time></span></div>`,
  'reorder-list': `<c2-reorder-list editable aria-label="Release queue" style="width:240px;--c2-reorder-list--container-gap:6px">
  <div data-reorder-key="scope" style="padding:8px 12px;border:1px solid var(--c2-theme--color-outline-variant, #e4e4e7);border-radius:6px;background:var(--c2-theme--color-surface, #ffffff);color:var(--c2-theme--color-on-surface, #18181b);font-size:13px">Confirm scope</div>
  <div data-reorder-key="test" style="padding:8px 12px;border:1px solid var(--c2-theme--color-outline-variant, #e4e4e7);border-radius:6px;background:var(--c2-theme--color-surface, #ffffff);color:var(--c2-theme--color-on-surface, #18181b);font-size:13px">Run tests</div>
  <div data-reorder-key="build" style="padding:8px 12px;border:1px solid var(--c2-theme--color-outline-variant, #e4e4e7);border-radius:6px;background:var(--c2-theme--color-surface, #ffffff);color:var(--c2-theme--color-on-surface, #18181b);font-size:13px">Build packages</div>
  <div data-reorder-key="publish" style="padding:8px 12px;border:1px solid var(--c2-theme--color-outline-variant, #e4e4e7);border-radius:6px;background:var(--c2-theme--color-surface, #ffffff);color:var(--c2-theme--color-on-surface, #18181b);font-size:13px">Publish packages</div>
</c2-reorder-list>`,
  'scatter-chart': `<c2-scatter-chart style="width:280px;height:132px;--c2-chart--padding:8px" aria-label="Weekly active hours against 90-day retention by plan" x-field="hours" legend="none" symbol-size="7" data='[{"hours":2.5,"starter":33.2},{"hours":4.2,"starter":32.6},{"hours":4.9,"starter":35.9},{"hours":5.7,"starter":34.9},{"hours":7.4,"starter":42.8},{"hours":7.9,"starter":32.1},{"hours":9.1,"starter":44.6},{"hours":10.3,"growth":45.9},{"hours":11.0,"starter":28.8},{"hours":11.5,"growth":51.9},{"hours":12.5,"starter":51.1},{"hours":13.3,"starter":43.9},{"hours":13.7,"growth":62.3},{"hours":13.9,"starter":30.7},{"hours":15.3,"growth":58.7},{"hours":15.4,"starter":33.1},{"hours":16.7,"growth":60.2},{"hours":18.2,"growth":52.2},{"hours":20.5,"growth":70.6},{"hours":21.8,"growth":64.8},{"hours":22.5,"growth":54.1},{"hours":23.4,"scale":81.1},{"hours":23.5,"scale":67.5},{"hours":23.9,"growth":51.4},{"hours":26.1,"growth":60.7},{"hours":26.4,"scale":74.9},{"hours":27.8,"growth":61.5},{"hours":28.0,"scale":74.4},{"hours":28.1,"scale":79.4},{"hours":30.7,"scale":73.3},{"hours":31.1,"scale":75.0},{"hours":33.9,"scale":85.9},{"hours":34.2,"scale":75.1},{"hours":35.7,"scale":72.0},{"hours":38.2,"scale":76.2},{"hours":39.3,"scale":82.7}]'><c2-chart-series field="starter" label="Starter"></c2-chart-series><c2-chart-series field="growth" label="Growth"></c2-chart-series><c2-chart-series field="scale" label="Scale"></c2-chart-series></c2-scatter-chart>`,
  'search-field': `<c2-search-field placeholder="Search issues" shortcut="/" style="width:220px"></c2-search-field>`,
  select: `<c2-select value="FR" placeholder="Select a country" style="width:190px">
  <c2-list-item value="US">United States</c2-list-item>
  <c2-list-item value="CA">Canada</c2-list-item>
  <c2-list-item value="FR">France</c2-list-item>
  <c2-list-item value="VN">Vietnam</c2-list-item>
</c2-select>`,
  separator: `<div style="display:grid;gap:14px;width:200px;font-size:12px;color:var(--c2-theme--color-on-surface-variant, #71717a)">
  <c2-separator></c2-separator>
  <c2-separator>or</c2-separator>
  <c2-separator style="--c2-separator--style: dashed"></c2-separator>
</div>`,
  sheet: `<div class="preview-row">
  <c2-button onclick="this.nextElementSibling.show()">Open sheet</c2-button>
  <c2-sheet>
    <span slot="title">Filters</span>
    <div style="font-size:13px;color:var(--c2-theme--color-on-surface-variant, #71717a)">A panel pinned to the edge of the screen.</div>
    <c2-button slot="footer" onclick="this.closest('c2-sheet').close()">Apply</c2-button>
  </c2-sheet>
</div>`,
  shortcut: `<div class="preview-row">
  <c2-kbd>mod + K</c2-kbd>
  <c2-kbd>G</c2-kbd><c2-kbd>D</c2-kbd>
  <c2-kbd>?</c2-kbd>
</div>`,
  'side-nav': `<div style="position:relative;width:240px;height:110px;border:1px solid var(--site-color-outline-variant);border-radius:8px;overflow:hidden">
  <c2-side-nav opened style="height:100%;--c2-side-nav__open--width:88px;--c2-side-nav--padding-top:10px;--c2-side-nav--padding-right:8px;--c2-side-nav--padding-bottom:10px;--c2-side-nav--padding-left:8px;--c2-side-nav--background-color:var(--site-color-surface-container-3);--c2-side-nav__divider--color:var(--site-color-outline-variant)">
    <div slot="side-nav-content" style="font-size:13px;line-height:1.9;padding-left:4px">Inbox<br>Drafts<br>Sent</div>
    <div style="padding:12px;font-size:13px">Main content</div>
  </c2-side-nav>
</div>`,
  skeleton: `<div style="display:flex;align-items:center;gap:12px;width:220px">
  <c2-skeleton variant="circle"></c2-skeleton>
  <c2-skeleton variant="text" lines="2" style="flex:1"></c2-skeleton>
</div>`,
  slider: `<div style="display:grid;gap:12px;width:220px">
  <c2-slider value="40"></c2-slider>
  <c2-slider value="60" ticks step="20"></c2-slider>
</div>`,
  sparkline: `<div class="preview-row"><c2-sparkline style="--c2-chart--width:120px" data="[12, 19, 14, 22, 18, 27, 31]" tone="auto"></c2-sparkline><c2-sparkline style="--c2-chart--width:120px" data="[9, 7, 8, 5, 6, 4, 2]" tone="auto" type="area"></c2-sparkline></div>`,
  spinner: `<div class="preview-row">
  <c2-spinner></c2-spinner>
  <c2-spinner value="65" style="--c2-spinner--size: 32px"></c2-spinner>
  <c2-spinner>Loading…</c2-spinner>
</div>`,
  'split-panel': `<c2-split-panel position="35" style="width:260px;--c2-split-panel__divider--opacity:1;height:130px;border:1px solid var(--c2-theme--color-outline-variant, #e4e4e7);border-radius:8px;overflow:hidden;font-size:12px">
  <div slot="start" style="padding:8px">Inbox</div>
  <div slot="end" style="padding:8px;color:var(--c2-theme--color-on-surface-variant, #71717a)">Message</div>
</c2-split-panel>`,
  stat: `<c2-stat style="width:240px" value="$18.4M" label="Assets under management" tone="positive">
  <span slot="trend" style="color:#15803d;font-size:12px;font-weight:600">+12%</span>
</c2-stat>`,
  'state-timeline': `<c2-state-timeline style="width: 100%; --c2-state-timeline__label--width: 64px; --c2-state-timeline__row--height: 16px; --c2-state-timeline__summary--width: 52px" hide-axis hide-legend aria-label="Service health" end="2026-10-08T12:00:00Z" states='[{"value":"ok","label":"Operational","tone":"success","baseline":true},{"value":"degraded","label":"Degraded","tone":"warning"},{"value":"down","label":"Outage","tone":"danger"},{"value":"maintenance","label":"Maintenance","tone":"primary"}]' series='[{"label":"API","segments":[{"start":"2026-10-08T09:00:00Z","state":"ok"},{"start":"2026-10-08T10:05:00Z","state":"degraded"},{"start":"2026-10-08T10:40:00Z","state":"ok"}]},{"label":"Database","segments":[{"start":"2026-10-08T09:00:00Z","state":"ok"},{"start":"2026-10-08T10:15:00Z","state":"down"},{"start":"2026-10-08T10:35:00Z","state":"degraded"},{"start":"2026-10-08T10:55:00Z","state":"ok"}]},{"label":"Search","segments":[{"start":"2026-10-08T09:00:00Z","state":"ok"},{"start":"2026-10-08T11:20:00Z","state":"maintenance"},{"start":"2026-10-08T11:45:00Z","state":"ok"}]}]'></c2-state-timeline>`,
  'status-panel': `<c2-status-panel status="success" heading="Workspace ready" description="Everything is set up and ready to use." style="--c2-status-panel__container--min-height:170px;--c2-status-panel__container--padding:20px;--c2-status-panel__container--gap:14px;--c2-status-panel__media--size:48px;--c2-status-panel__media-icon--size:24px;--c2-status-panel__title--font-size:16px;--c2-status-panel__title--line-height:22px"></c2-status-panel>`,
  steps: `<c2-steps style="width:300px;--c2-steps--background:color-mix(in srgb, var(--c2-theme--color-on-surface, #18181b) 2%, var(--c2-theme--color-surface, #ffffff));--c2-steps--border:1px solid color-mix(in srgb, var(--c2-theme--color-on-surface, #18181b) 10%, var(--c2-theme--color-surface, #ffffff));--c2-steps--border-radius:8px;--c2-steps--padding-block:2px;--c2-step__row--border-bottom:1px solid color-mix(in srgb, var(--c2-theme--color-on-surface, #18181b) 8%, var(--c2-theme--color-surface, #ffffff));--c2-step__marker--size:12px;--c2-step__row--padding-block:5px;--c2-step__label--font-size:12px;--c2-step__label--font-weight:400;--c2-step__success--color:color-mix(in srgb, var(--c2-theme--color-on-surface, #18181b) 80%, var(--c2-theme--color-surface, #ffffff))" aria-label="Run trace">
  <c2-step status="success" label="build" trailing="24 s"></c2-step>
  <c2-step label="test">
    <c2-step status="success" label="unit" trailing="8 s"></c2-step>
    <c2-step status="running" label="e2e"></c2-step>
  </c2-step>
  <c2-step status="pending" label="ship"></c2-step>
</c2-steps>`,
  switch: `<div class="preview-row">
  <c2-switch checked></c2-switch>
  <c2-switch></c2-switch>
  <c2-switch checked>Notifications</c2-switch>
</div>`,
  symbols: `<div class="preview-row" style="gap:10px;--c2-symbol--size:84px">
  <c2-symbol-celebration></c2-symbol-celebration>
  <c2-symbol-no-results></c2-symbol-no-results>
  <c2-symbol-payment-success></c2-symbol-payment-success>
</div>`,
  table: `<c2-table sortable stripe row-key="id" style="height:180px;width:100%" rows='[
  {"id":"1","name":"Ada Lovelace","team":"Analytics","score":128000},
  {"id":"2","name":"Grace Hopper","team":"Compilers","score":96500},
  {"id":"3","name":"Alan Turing","team":"Research","score":87200},
  {"id":"4","name":"Radia Perlman","team":"Networks","score":74800}
]'>
  <c2-table-column field="name" header="Name" width="2fr" sortable></c2-table-column>
  <c2-table-column field="team" header="Team" width="1fr"></c2-table-column>
  <c2-table-column field="score" header="Score" width="90px" align="end" format="number" sortable></c2-table-column>
</c2-table>`,
  tabs: `<c2-tabs selected-tab="tab2" style="width:240px">
  <c2-tab label="Overview" for="tab1"></c2-tab>
  <c2-tab label="Activity" for="tab2"></c2-tab>
  <c2-tab label="Settings" for="tab3" disabled></c2-tab>
  <div id="tab1" style="padding:8px 0;font-size:13px">Overview panel</div>
  <div id="tab2" style="padding:8px 0;font-size:13px">Activity panel</div>
</c2-tabs>`,
  'tag-input': `<c2-tag-input aria-label="Recipients" placeholder="Add recipients" value="ann@example.com;bob@example.com" style="width:260px"></c2-tag-input>`,
  'task-icons': `<div class="preview-row" style="gap:18px;--c2-task-icon--size:28px;color:#0265dc">
  <c2-task-icon-mail></c2-task-icon-mail>
  <c2-task-icon-run style="color:#ea580c"></c2-task-icon-run>
  <c2-task-icon-cook style="color:#0f766e"></c2-task-icon-cook>
  <c2-task-icon-meditate style="color:#7c3aed"></c2-task-icon-meditate>
</div>`,
  'text-field': `<c2-text-field placeholder="Your email" help="We never share it." style="width:220px"></c2-text-field>`,
  textarea: `<c2-textarea label="Message" placeholder="Write a message…" rows="2" style="width:220px"></c2-textarea>`,
  'theme-select': `<div class="preview-row"><c2-theme-select manual></c2-theme-select><c2-theme-select manual show-label style="--c2-theme-select__trigger--border:1px solid var(--c2-theme--color-outline, #bcbcc6);--c2-theme-select__trigger--border-radius:6px"></c2-theme-select><c2-theme-select manual modes="light,dark" style="--c2-theme-select__trigger--border-radius:999px;--c2-theme-select__trigger--background:var(--c2-theme--color-surface-container, #f4f4f5)"></c2-theme-select></div>`,
  'time-input': `<c2-time-input value="09:30" aria-label="Meeting time" style="width:160px"></c2-time-input>`,
  timeline: `<c2-timeline aria-label="Order history" style="width:240px"><c2-timeline-item label="Order placed" timestamp="Sep 12, 09:14" tone="success"></c2-timeline-item><c2-timeline-item label="Shipped" timestamp="Sep 13, 16:02" tone="primary"></c2-timeline-item><c2-timeline-item label="Out for delivery" timestamp="Expected Sep 15"></c2-timeline-item></c2-timeline>`,
  toast: `<c2-toast variant="success" heading="Changes saved" message="Your work is up to date." style="width:250px"></c2-toast>`,
  'todo-list': `<c2-todo-list heading="This week" readonly style="width:280px;--c2-todo-list__container--padding:14px;--c2-todo-list__container--gap:10px;--c2-todo-list__row--padding:3px 6px;--c2-todo-list__mark--size:22px;--c2-todo-list__ring--size:36px;--c2-todo-list__heading--font-size:15px;--c2-todo-list__label--font-size:13px" tasks='[{"label":"Send the invoice","done":true},{"label":"Renew passport","highlight":"yellow"},{"label":"Call the plumber","dropped":true}]'></c2-todo-list>`,
  tooltip: `<button class="preview-button">Hover me<c2-tooltip>Helpful tooltip</c2-tooltip></button>`,
  'trace-waterfall': `<c2-trace-waterfall style="width: 100%; --c2-trace-waterfall__name--width: 140px; --c2-trace-waterfall__row--height: 22px; --c2-trace-waterfall__bar--height: 8px" spans='[{"id":"a","name":"POST /checkout","service":"web","start":0,"duration":842},{"id":"b","parentId":"a","name":"cart.load","service":"cart","start":48,"duration":126},{"id":"c","parentId":"b","name":"SELECT items","service":"postgres","start":56,"duration":71},{"id":"d","parentId":"a","name":"payments.charge","service":"payments","start":182,"duration":512,"status":"error"},{"id":"e","parentId":"a","name":"orders.create","service":"orders","start":702,"duration":118}]'></c2-trace-waterfall>`,
  tree: `<c2-tree style="width:200px" aria-label="Files" expanded-items="src" value="app">
  <c2-tree-item value="src" label="src">
    <c2-tree-item value="app" label="app.ts"></c2-tree-item>
    <c2-tree-item value="main" label="main.ts"></c2-tree-item>
  </c2-tree-item>
  <c2-tree-item value="readme" label="README.md"></c2-tree-item>
</c2-tree>`,
  truncate: `<c2-truncate expandable style="max-width: 240px; --c2-truncate__content--line-clamp: 2">Quarterly revenue grew 18% year over year, led by the enterprise segment, while churn in the self-serve tier fell again.</c2-truncate>`,
  upload: `<c2-upload style="--c2-upload--width:270px;--c2-upload__dropzone--padding:18px 14px" multiple max-files="5" aria-label="Upload files"><span slot="prompt">Drop files or <strong>browse</strong></span><span slot="hint">Up to 5 files</span></c2-upload>`,
  'virtual-list': `<c2-virtual-list aria-label="People" style="width:240px;height:132px" item-key="id" label-field="name" description-field="team" items='[{"id":"1","name":"Ada Lovelace","team":"Analytics"},{"id":"2","name":"Grace Hopper","team":"Compilers"},{"id":"3","name":"Alan Turing","team":"Research"},{"id":"4","name":"Katherine Johnson","team":"Flight"},{"id":"5","name":"Radia Perlman","team":"Networks"},{"id":"6","name":"Barbara Liskov","team":"Research"},{"id":"7","name":"Margaret Hamilton","team":"Flight"}]'></c2-virtual-list>`,
  'week-planner': `<c2-week-planner locale="en-US" start-hour="8" end-hour="14" style="width:720px;max-width:none;zoom:0.34;--c2-week-planner--padding:16px;--c2-week-planner__hour--height:36px;--c2-week-planner__hour-label--font-size:16px;--c2-week-planner__day-header--font-size:18px;--c2-week-planner__event--font-size:16px" events='[{"title":"Stand-up","day":"mon","start":"08:30","end":"09:00"},{"title":"Workshop","day":"tue","start":"10:00","end":"12:00","color":"#b45309"},{"title":"Kids","day":"wed","start":"11:00","end":"14:00","color":"#0f766e"},{"title":"Stand-up","day":"thu","start":"08:30","end":"09:00"},{"title":"Football","day":"sat","start":"09:00","end":"12:00","color":"#0f766e"}]'></c2-week-planner>`,
  'working-indicator': `<div class="preview-row" style="flex-direction:column;align-items:flex-start">
  <c2-working-indicator messages='["Scheming","Pondering","Brewing"]' elapsed style="--c2-working-indicator__indicator--color:#d97757;--c2-working-indicator__label--color:#d97757;--c2-working-indicator__label--highlight-color:color-mix(in srgb, #d97757 45%, var(--c2-theme--color-on-surface, #18181b))"></c2-working-indicator>
  <c2-working-indicator indicator="dots" effect="wave" label="Generating"></c2-working-indicator>
  <c2-working-indicator state="done" done-label="Done in 14s"></c2-working-indicator>
</div>`,
}
