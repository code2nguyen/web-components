# Data Model: Verifiable CSS Configuration Contracts

This is a design model for audit inputs and results. It does not replace component JSDoc or `custom-elements.json` as the public styling contract.

## Entities and relationships

### Publishable package

- **Identity**: npm package name and workspace path.
- **Fields**: `name`, `path`, `private`, manifest path, source entries, Sass entries, generated-family identifier when applicable.
- **Relationships**: contains one or more custom-element declarations; may contain a shared styling implementation.
- **Validation**: include only publishable packages in component, open-package, and icon workspaces. A publishable package with no readable manifest is a failure.

### Element contract

- **Identity**: exact custom-element tag name, unique across publishable packages.
- **Fields**: tag, package, declaration source, manifest declaration, optional generated-family/styling-path key, documented parts/states.
- **Relationships**: owns zero or more styling properties; may delegate some styling to another element contract.
- **Validation**: source and manifest must agree on tag identity; generated tags each retain an individual contract even when they share runtime evidence.

### Styling property

- **Identity**: `(tag, exact CSS variable name)`; no case folding or typo normalization.
- **Fields**: name, type, description, source location, manifest location, authored default, effective default, fallback references, intended part, intended state, consumption mode, control descriptor, verification-case IDs.
- **Relationships**: belongs to exactly one element contract, though the same variable spelling may also be documented by related tags; has one or more consumers or an approved exception; may depend on another public property as a fallback.
- **Validation**: public name follows the repository naming convention and appears exactly in source and manifest. A source-only, manifest-only, unused, ambiguous, or stale property fails. A default may be absent when the component deliberately inherits a browser or another public value; the absence must be represented explicitly.

### Consumption path

- **Identity**: property identity plus source location and target declaration or programmatic sink.
- **Fields**: mode (`compiled-css`, `inline-style`, `programmatic`, `delegated`), source file/line, selector or child tag, rendered CSS declaration or programmatic output, fallback order, applicable state.
- **Relationships**: connects a styling property to an observable target; a delegated path links to a child's public property.
- **Validation**: a name appearing in a theme map or `getPropertyValue` call without an effect path does not count as consumed. Delegation must identify both parent and child properties and the target host. Cyclic or unresolved fallback/delegation chains fail.

### Inspector control descriptor

- **Identity**: `(host tag, row key)`.
- **Fields**: control family, group/part, ordered property names, emitted value count, write target for each property, source manifest entries.
- **Relationships**: maps one or several styling properties to a visible panel row and a host or delegated child write target.
- **Validation**: each public property has one unambiguous control mapping. A four-side or four-corner control has one or four values and exactly the same number of names; ordering follows the documented side/corner order. Shorthand and longhands cannot silently share one row when precedence is ambiguous.

### Verification context and case

- **Context identity**: stable context ID, usually associated with an element tag or a shared styling path.
- **Case identity**: stable case ID plus property and state; one case may cover an identical generated-family path for several tags only when each tag separately passes contract validation.
- **Context fields**: fixture markup or data source, required dimensions/content, related child elements, state setup, stable wait condition.
- **Case fields**: property identity, valid contrasting value, optional reviewed second `controlValue`, expected target, assertion kind (`computed-style`, `geometry`, `pseudo-style`, `slotted-style`, `delegated-style`, `programmatic-output`), expected declaration or output, applicable browsers, reset procedure.
- **Relationships**: a property has a case for every applicable state/target path; generated-family members can reference shared runtime evidence under the spec's conditions.
- **Validation**: value is valid for the declared property type and differs meaningfully from the baseline. The assertion must inspect the intended target or downstream output, never merely the custom property on the host. Cases must be deterministic and independent of execution order.

### Approved exception

- **Identity**: `(tag, property name)` plus review record ID.
- **Fields**: browser-owned or third-party surface, limitation, user impact, supported styling alternative, technical rationale, reviewer/date, reassessment or removal date.
- **Relationships**: substitutes for ordinary observable verification only for the specified property and surface.
- **Validation**: ordinary component shadow styles cannot qualify. Missing fields or an expired review fail the audit. An exception does not suppress source/manifest name or default drift.

### Contract failure

- **Identity**: `(tag, property name, failure category, evidence location)`.
- **Fields**: category, expected target/state, observed result, authored and effective values where relevant, source/manifest location, nearest-name suggestion where relevant, remediation hint.
- **Validation**: categories include `missing-manifest`, `stale-manifest`, `undocumented-consumer`, `unused-property`, `name-mismatch`, `default-mismatch`, `invalid-fallback`, `ambiguous-control`, `missing-case`, `invalid-test-value`, `wrong-target`, `no-observable-change`, and `invalid-exception`.

### Audit result

- **Identity**: repository revision plus audit schema version; deterministic content for the same source state and browser/project.
- **Fields**: package/tag/property counts, property entries, failures, approved exceptions, browser coverage, generated-family reuse, duration, pass/fail status.
- **Relationships**: each discovered public property has exactly one final status: `verified`, `failed`, or `approved-exception`.
- **Validation**: counts reconcile with the per-property ledger; any failed or unclassified entry makes the gate fail. Sort by package, tag, property, state, and failure category for stable output.

### Name migration

- **Identity**: `(tag, old property name)`.
- **Fields**: corrected property name, affected release, migration instructions, links to changed examples/docs.
- **Validation**: a corrected misspelling has no old-name alias; each old name maps to one replacement and appears in migration guidance.

## Lifecycle

```text
discovered
  → source/manifest reconciled
  → consumption and defaults validated
  → inspector mapping validated
  → observable case executed
  → verified | failed | approved-exception
```

- `failed` may occur at any validation stage and retains the specific evidence and category.
- `approved-exception` is reachable only after source/manifest validation and a valid reviewed exception record.
- A source or manifest change invalidates prior verification; the next audit reconstructs the ledger rather than carrying forward a stale status.
- A generated tag may inherit the result of a shared runtime case only after its own manifest and identical styling-path checks pass.
