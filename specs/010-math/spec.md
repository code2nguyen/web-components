# Feature: `c2-math` — TeX formulas rendered as native MathML

**Status**: Design (not started)
**Roadmap**: new row proposed with this spec (section B). No earlier roadmap item covers it.
**Related**: [007-markdown](../007-markdown/spec.md) renders `$…$`, `$$…$$`, `\(…\)` and `\[…\]` through `c2-math`.

## Problem

Technical chat answers, docs and finance reports contain formulas. The usual options are KaTeX (77 kB gzipped plus a CSS file and about 20 font files) and MathJax (heavier still). Since 2023, every engine renders **MathML Core** natively (Chrome 109+, Firefox, Safari), so a TeX-to-MathML converter is enough. The browser handles layout, fonts and accessibility.

## Choice: Temml

[Temml](https://temml.org) 0.14.0 (MIT, about 59 kB gzipped) is the MathML-only descendant of KaTeX, with the same TeX coverage and settings. Three properties make it a fit:

- **No `innerHTML`.** `temml.render(tex, element)` builds DOM nodes (`toNode()` → `createElementNS`), checked in its 0.14.0 dist.
- **Safe defaults.** `trust: false` rejects `\href`, `\url`, `\includegraphics`, `\class`, `\id`, `\style` and `\data`. `maxExpand: 1000` stops macro-expansion bombs. `maxSize` caps `\rule` and `\kern`.
- **No font CSS.** It uses the system math font through `font-family: math`.

KaTeX was rejected for its weight and its HTML+CSS output, and MathJax for its weight.

## Usage

```html
<p>The area is <c2-math>\pi r^2</c2-math>.</p>

<c2-math display> \int_0^\infty e^{-x^2}\,dx = \frac{\sqrt\pi}{2} </c2-math>
```

## Public API

| Property  | Attribute | Type                     | Default | Purpose                                                                                                                                             |
| --------- | --------- | ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`   | `value`   | `string \| undefined`    | —       | TeX source. When unset, the element's text content is used (in a `<script type="math/tex">` child or as plain text).                                |
| `display` | `display` | `boolean`                | `false` | Block (display) style, centred on its own line. Inline when false. Sets MathML `display="block"`, which is a semantic difference, not a visual one. |
| `macros`  | —         | `Record<string, string>` | —       | App macros (`{ '\\RR': '\\mathbb{R}' }`). A shared default can be set once with `configureMath({ macros })`.                                        |

Methods and getters:

- The `text` getter returns the TeX source.
- The `mathml` getter returns the serialised MathML, for export.

Events:

| Event        | Detail                                   | Notes                                                                                             |
| ------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `math-error` | `{ message: string, position?: number }` | The source failed to parse. The element shows the source in the error style rather than throwing. |

Behaviour:

- **Copy.** When a selection lies entirely inside one formula, `copy` puts the TeX in `text/plain` and the MathML in `text/html`, as Wikipedia does. Pasting into a chat or an editor then keeps the formula.
- **Overflow.** A display formula wider than its container scrolls horizontally. The scroller becomes focusable (`tabindex="0"`) only when it overflows.
- **SSR.** The server emits the TeX source in a styled `<code>`. The client renders MathML on upgrade. Temml's `renderToString` would work on the server, but it is a string, and the no-`innerHTML` rule wins. This was decided on 2026-10-10 (see below).

## Theming

`--c2-math--font-family=math`, `--c2-math--font-size=1.1em` (math fonts run small next to text), `--c2-math--color=inherit`, `--c2-math__display--margin=12px 0`, `--c2-math__display--text-align=center`, `--c2-math__error--color` (maps to the error token), `--c2-math__error--background`, `--c2-math__error--font-family` (monospace).

## Accessibility

Native MathML is exposed to VoiceOver, NVDA (with MathCAT) and JAWS. The element adds no ARIA of its own. If the source fails to parse, the TeX text stays readable.

## Bundle

`temml` becomes a runtime dependency of `@c2n/math`, imported statically: the element exists to render math. `c2-markdown` imports `@c2n/math` lazily, so markdown without math does not load Temml.

## Test plan

- A fixture set (fractions, matrices, `\begin{aligned}`, accents, `\operatorname`) produces a `<math>` element with the expected structure. Snapshot the structure, not the pixels.
- Untrusted commands (`\href{javascript:…}`, `\includegraphics`, `\style`, `\class`) give `math-error` and no link or image.
- A macro bomb (`\def\a{\a\a}\a`) gives `math-error` quickly, not a hang.
- Copy puts the TeX in `text/plain`.
- `display` changes the MathML `display` attribute. An overflowing display formula is scrollable and focusable.

## Decision (2026-10-10)

- SSR renders the TeX source in a styled `<code>`, and the client upgrades it to MathML. Real MathML on the server (`renderToString` through `unsafeHTML`, or a token-to-template port) can come later if it is needed.
