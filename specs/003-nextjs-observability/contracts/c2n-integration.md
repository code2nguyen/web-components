# Contract: c2n Integration in Next.js

## Registration

- Each runtime package is registered exactly once through an owned client-side module.
- The root registry covers globally used shell/form/feedback elements; route registries may isolate large optional chart modules.
- Compound package entrypoints register their documented child tags; duplicate child imports are avoided.
- Development and production tests fail on duplicate-registration warnings.

## JSX typing

- `types/c2-elements.d.ts` imports the generated `@c2n/<package>/react` declaration for every directly consumed package.
- Generated declarations are treated as intrinsic-element types, not React wrappers.
- Removed or renamed public properties must fail type checking.

## Server-rendered values

- Use the real manifest attribute spelling (`row-key`, `page-size`, `storage-key`, and similar) in server-rendered markup.
- Use attributes for strings, numbers, booleans, and documented serialized formats.
- Use JSON strings only when the component contract explicitly documents a converter that behaves the same for attributes and properties.
- Do not place callbacks, functions, class instances, or non-serializable data in server markup.
- Initial light-DOM headings, labels, KPIs, table context, and chart summaries remain meaningful before upgrade.

## Client property assignment

- Arrays, objects, renderer callbacks, and property-only APIs are assigned through typed element refs after the definition is available.
- Assignment helpers must be idempotent under React Strict Mode and clean up subscriptions/timers.
- A new object identity is supplied when the component compares property values by identity; documented revision APIs may be used for intentional in-place mutation.
- The client initial value must match the server-visible baseline to avoid hydration mismatch.

## Events

- Kebab-case custom events, non-bubbling events, and c2 form-control `input`/`change` events use typed `addEventListener` subscriptions.
- Hooks retain the latest callback without resubscribing on every render and remove the exact listener during cleanup.
- Native `click` may use React handling only when the component contract behaves as a normal bubbling click target.
- Event details are consumed through the component's declared event map; avoid `any` and unchecked casts.

## Styling and composition

- Import `@c2n/theme/theme.css` once.
- App variants use documented `--c2-*` custom properties, CSS parts, and slots.
- Never query or mutate a component's shadow root.
- Delete host box styling that would duplicate the component's own border, padding, background, height, or focus ring.
- Consumer-owned slot content uses application classes; nested component internals remain encapsulated.
- Any missing hook becomes either a same-change component fix with synchronized contracts/tests or an evaluation finding and root feedback entry.

## Accessibility composition

- Application labels and descriptions supplement, not replace, component semantics.
- Canvas charts receive a meaningful accessible name plus adjacent text summary and data/details alternative.
- Status is never conveyed by color alone.
- Modal/sheet trigger focus is restored after close.
- Dashboard visual order and document order stay aligned after reordering.
- Move and size actions include the panel name and announce the resulting position/size in one polite status region.
- Reduced-motion users receive the same outcomes without decorative movement.

## Component usage registry

Each actually shipped tag has one registry record:

```text
{
  tag,
  packageName,
  purpose,
  regions,
  docsPath,
  sourcePaths
}
```

The registry:

1. Powers each page's Built with c2n panel.
2. Provides documentation and representative source links.
3. Produces the distinct component count for FR-020/SC-004.
4. Supplies the expected inventory for the final evaluation coverage test.

Importing an unused element does not count as component usage.

## Verification

- Type-check all intrinsic tags and public values.
- Assert component definitions are present before interactive property assignment.
- Assert no duplicate-registration, hydration-mismatch, unknown-property, or invalid-binding console message.
- Exercise representative property assignment and event subscriptions in production build tests.
- Audit the rendered/imported tag set against the component usage registry.
