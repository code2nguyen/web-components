# Feature: `c2-image` — image with lazy load, placeholder, fallback, click-to-load and preview

**Status**: Design (not started)
**Roadmap**: #41, section B, P2
**Related**: [007-markdown](../007-markdown/spec.md) renders every markdown image as a `c2-image`. `c2-image-viewer` (#42) will later take over the fullscreen preview. `c2-image-cropper` (#18) is a separate editing component and out of scope here.

## Problem

Every app re-implements the same four image states: loading (a skeleton or blurred preview), loaded (fading in), failed (a fallback) and not yet allowed (click to load).

The last state is a privacy feature. An image URL written by an LLM is a known data-exfiltration channel (ChatGPT 2023, Bard 2023, Copilot Chat 2024, EchoLeak CVE-2025-32711; see [markdown research §3](../007-markdown/research.md#3-sanitising)). Chat apps need images that make no request until the reader asks for one.

## Goals

1. Lazy loading by default, with the space reserved from `width`/`height` so the layout does not jump.
2. A placeholder while loading (shimmer or blurred preview) and a smooth fade to the image.
3. A fallback on error: the alt text plus an icon, or the author's own slot.
4. `loading="click"`: a placeholder showing the alt text and the image's host name, which loads only on activation. No request of any kind is made before that, not even a DNS prefetch.
5. Optional click-to-preview: the image opens fullscreen in a `c2-modal`.
6. Server rendering emits a real `<img>`, so the image works before JavaScript runs.

## Usage

```html
<c2-image src="/team.jpg" alt="The team at the offsite" width="1200" height="800" preview></c2-image>

<!-- untrusted origin, e.g. inside a chat answer -->
<c2-image loading="click" src="https://example.com/chart.png" alt="Revenue chart"></c2-image>
```

## Public API

| Property          | Attribute         | Type                           | Default  | Purpose                                                                                                                                                                              |
| ----------------- | ----------------- | ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src`             | `src`             | `string`                       | —        | Image URL                                                                                                                                                                            |
| `srcset`, `sizes` | `srcset`, `sizes` | `string`                       | —        | Passed to the inner `<img>`                                                                                                                                                          |
| `alt`             | `alt`             | `string`                       | `''`     | The alternative text. It is also the label for the placeholder and the fallback.                                                                                                     |
| `width`, `height` | `width`, `height` | `number`                       | —        | Intrinsic size: reserves the aspect ratio, as on a native `<img>`. This is image data, not styling. The displayed size is CSS.                                                       |
| `loading`         | `loading`         | `'lazy' \| 'eager' \| 'click'` | `'lazy'` | When to fetch. Named like native `<img loading>`, plus `click`, which makes no request until activation. (The first draft called it `load`, which clashed with the `load()` method.) |
| `placeholderSrc`  | `placeholder-src` | `string`                       | —        | A tiny low-quality preview (data URI or URL), blurred while the full image loads. Under `loading="click"` it is ignored unless it is a `data:` URI, which makes no request.          |
| `referrerPolicy`  | `referrerpolicy`  | `ReferrerPolicy`               | —        | Passed through. `c2-markdown` sets `no-referrer`.                                                                                                                                    |
| `crossOrigin`     | `crossorigin`     | `string`                       | —        | Passed through                                                                                                                                                                       |
| `preview`         | `preview`         | `boolean`                      | `false`  | Clicking the loaded image opens it fullscreen.                                                                                                                                       |

Methods:

- `load()` triggers the fetch under `loading="click"`.
- The `complete` getter reports whether the image has loaded.

Events:

| Event          | Detail            | Notes                                                                                                                                                     |
| -------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load`         | native            | Re-dispatched from the inner `<img>` with `redispatchEvent`                                                                                               |
| `error`        | native            | Re-dispatched. The fallback shows.                                                                                                                        |
| `load-request` | `{ src: string }` | Cancelable and composed. Fires when the reader activates a click-to-load placeholder. An app can cancel it to confirm first, or rewrite `src` to a proxy. |
| `preview-open` | `{ src: string }` | Cancelable. An app can open its own viewer instead.                                                                                                       |

Slots:

- `placeholder` replaces the loading shimmer.
- `fallback` replaces the error state.
- `load-label` replaces the click-to-load text, which defaults to "Load image · {host}" and is localisable through the slot.

Parts: `image`, `placeholder`, `fallback`, `load-button`.

## States and rendering

```
          ┌────────── loading="click" ──────────┐
          ▼                                  │ activate (load-request not cancelled)
     [blocked] ─────────────────────────────►┤
                                             ▼
   lazy/eager ─────────────────────────► [loading] ──load──► [loaded] ──click + preview──► modal
                                             └──error──► [error]
```

- **blocked**: a `c2-button`-styled placeholder with the alt text, an image icon and the host (`new URL(src).host`). The inner `<img>` is not rendered at all, so no request is possible. The placeholder is keyboard-focusable, and Enter or Space activates it.
- **loading**: the `<img>` is in the DOM with native `loading="lazy|eager"` and `opacity: 0`, under the placeholder (shimmer, or `placeholder-src` blurred).
- **loaded**: the image fades in (`--c2-image__enter--duration`), then the placeholder is removed.
- **error**: the fallback shows, with an icon and the alt text.
- **preview**: opens a `c2-modal` holding the image at `object-fit: contain`. `@c2n/modal` is imported lazily on the first preview. Once `c2-image-viewer` (#42) ships, it replaces the modal here.

Semantics: the inner `<img>` carries `alt`. In the blocked and error states, the alt text is real text. The host writes no attributes.

## Theming

`--c2-image--border-radius`, `--c2-image--object-fit=cover`, `--c2-image--aspect-ratio` (overrides the ratio from width and height), `--c2-image__placeholder--background`, `--c2-image__placeholder--color`, `--c2-image__placeholder--font-size=12px`, `--c2-image__shimmer--duration=1.2s`, `--c2-image__blur--radius=16px`, `--c2-image__enter--duration=200ms`, `--c2-image__fallback--background`, `--c2-image__fallback--color`, `--c2-image__load-button--border`, `--c2-image__load-button__hover--background`, `--c2-image__preview--backdrop`.

## Test plan

- `loading="click"`: a route intercept counts **zero** requests to the image host until activation, then exactly one.
- Cancelling `load-request` keeps the image blocked. Rewriting `src` inside the handler loads the new URL.
- Error: the fallback shows with the alt text, and `error` is re-dispatched.
- Lazy: an image below the fold is not requested until it is scrolled near.
- No layout shift: the box keeps the same size from placeholder to loaded image when `width` and `height` are set.
- `preview`: Enter on the focused image opens the modal and Escape closes it. Cancelling `preview-open` stops it.
- SSR output contains a plain `<img>` (lazy or eager) and no `<img>` when `loading="click"`.
