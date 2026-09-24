# Feature Specification: Verifiable CSS Configuration Contracts

**Feature Branch**: `codex/style-contract-diagnostics`

**Created**: 2026-09-24

**Status**: Paused — diagnostic checkpoint implemented; full verification gate deferred

**Checkpoint decision (2026-09-24)**: Stop implementation at the non-blocking diagnostic stage. The requirements and success criteria below remain the original target, not completed acceptance criteria. See [audit-results.md](audit-results.md) and [tasks.md](tasks.md) for the remaining work before a blocking gate can be enabled.

**Input**: User description: "Ensure every c2n component can be configured through the configuration panel and detect errors where a documented CSS custom property is missing, misspelled, wired to the wrong style, or has no observable effect."

## Clarifications

### Session 2026-09-24

- Q: When an existing public CSS variable is misspelled, should the corrected name work alongside the old name during a deprecation period? → A: Replace the old name immediately and provide migration guidance.
- Q: For components generated from the same shared implementation, such as Feather icons, should every tag receive its own live styling test? → A: Check every tag's published property names, then live-test the shared implementation and a representative sample of generated tags.
- Q: Can generated icons use one live styling sample per icon set? → A: Yes. Check every generated tag's published contract statically, but live-test one representative icon per icon set for its shared CSS styling path. A genuinely different styling implementation needs its own sample.
- Q: Across which browsers should the live styling verification run for each ordinary component? → A: Verify every property in Chromium, with representative styling checks in Firefox and WebKit.
- Q: Should verification operate every styling property through the configuration panel itself, or can it check each property's visual effect directly while testing each panel control type separately? → A: Check every property's visual effect directly, validate every panel mapping, and interactively test each distinct control type and reset/export flow.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Catch Broken Styling Contracts Before Release (Priority: P1)

A component maintainer changes or adds a public CSS custom property and receives a clear verification result showing whether the documented property is actually connected to the intended visible presentation.

**Why this priority**: A configuration control is misleading when its variable is misspelled, unused, or connected incorrectly. Preventing those defects before release is the core value of this feature.

**Independent Test**: Introduce one documented-but-unused variable, one undocumented styling variable, one default mismatch, and one misspelled variable, then verify that each defect is rejected with the affected component and variable identified.

**Acceptance Scenarios**:

1. **Given** a documented styling property with a valid default and observable effect, **When** the component contract is verified, **Then** that property passes without requiring manual inspection.
2. **Given** a documented property whose name differs from the property consumed by the component, **When** verification runs, **Then** it fails and reports both the documented name and the closest consumed name.
3. **Given** a documented property that is never consumed, **When** verification runs, **Then** it fails and identifies the property as having no implementation connection.
4. **Given** an implemented public styling property that is missing from the component contract, **When** verification runs, **Then** it fails and identifies the undocumented property.
5. **Given** a documented default that disagrees with the component's effective default, **When** verification runs, **Then** it fails and shows both values.

---

### User Story 2 - Verify Observable Changes Across Component States (Priority: P1)

A component author can prove that each public styling property changes the intended region in every applicable state, including interaction states and programmatically rendered surfaces.

**Why this priority**: Name-level consistency alone cannot prove that a variable affects the correct element, is visible in the relevant state, or is honored by a non-CSS rendering path.

**Independent Test**: Verify a representative component with base, hover, focus, selected, disabled, and programmatically rendered styling properties, then deliberately disconnect one property from its target and confirm that the exact state-specific contract fails.

**Acceptance Scenarios**:

1. **Given** a base-state styling property, **When** a valid contrasting value is applied, **Then** the intended rendered region exhibits the corresponding observable change.
2. **Given** a state-specific property, **When** its required state is activated and the property is changed, **Then** the intended region changes while the verification result names that state.
3. **Given** a property consumed by programmatic rendering rather than normal element styling, **When** its value changes, **Then** the rendered output updates or the contract supplies an approved documented limitation.
4. **Given** a property that affects slotted content, a pseudo-element, or a delegated child component, **When** its verification context is prepared, **Then** the change is observed at the actual public styling boundary.
5. **Given** a value that is invalid for the property's declared type, **When** the component ignores it, **Then** that result is not misreported as a broken component contract.

---

### User Story 3 - Trust Configuration Panel Controls (Priority: P2)

A documentation-site user edits a component in the configuration panel and immediately sees the intended visual change, can reset it, and can reuse the resulting configuration without hidden or conflicting values.

**Why this priority**: The configuration panel is the interactive expression of the component contract. It must faithfully apply valid properties and must not expose controls that cannot work.

**Independent Test**: Open a representative component, edit single-value, four-side, state-specific, and delegated styling controls, then verify the live result, changed indicator, reset behavior, and generated configuration.

**Acceptance Scenarios**:

1. **Given** a valid configuration control, **When** the user changes its value, **Then** the target component receives the exact public property and the intended presentation updates immediately.
2. **Given** a group of four related side or corner properties, **When** the user edits linked or independent values, **Then** each control maps to exactly one intended property in the documented order.
3. **Given** both shorthand and longhand properties that would make one control ambiguous, **When** the panel builds its controls, **Then** it either presents unambiguous independent controls or rejects the conflicting contract.
4. **Given** a customized property, **When** the user resets it, **Then** the authored value and presentation are restored without changing unrelated properties.
5. **Given** a customized example, **When** the user copies or exports its configuration, **Then** the result contains only effective public overrides and reproduces the visible customization.

---

### User Story 4 - Audit the Existing Library (Priority: P2)

A library maintainer can review a complete inventory of existing component styling contracts, distinguish genuine defects from approved special cases, and track the library to zero unexplained configuration failures.

**Why this priority**: New safeguards do not establish trust until the current catalog has been assessed and existing failures have been resolved or explicitly documented.

**Independent Test**: Run the full-library audit and confirm that every public styling property is classified as verified, failed with an actionable reason, or covered by a reviewed exception.

**Acceptance Scenarios**:

1. **Given** all publishable components, **When** the audit completes, **Then** every documented public styling property has exactly one verification status.
2. **Given** a verified exception for a browser-owned or third-party-rendered surface, **When** the audit reports it, **Then** the limitation, supported alternative, scope, and review rationale are visible.
3. **Given** a component added after the initial audit, **When** its public contract is introduced, **Then** it is automatically included in the same completeness requirements.
4. **Given** a failed contract, **When** a maintainer reads the result, **Then** they can identify the component, property, expected target or state, observed problem, and required next action without reproducing the entire audit manually.

### Edge Cases

- A property falls back to another public property rather than to a literal default.
- Several properties intentionally affect the same rendered declaration or region.
- A shorthand and its longhands are both present and precedence depends on order.
- A state-specific value is invisible until hover, focus, active, selected, open, disabled, loading, success, warning, or error is active.
- The tested state is mutually exclusive with another state or requires valid component data before it can render.
- A property affects inherited text presentation, slotted content, a pseudo-element, or a child component rather than a normal shadow element.
- A property changes geometry, motion, opacity, a shadow, or a transform rather than a directly comparable color or length.
- A property is read programmatically to draw a chart, canvas, generated image, or third-party surface.
- A component delegates documented styling properties to an internal component with a different tag and contract.
- A property intentionally has no literal default, uses a browser default, or accepts a keyword such as `inherit`, `currentColor`, or `none`.
- The authored example already overrides the property's package default.
- A valid change is visually masked by another state, overlay, or higher-precedence public property.
- A generated family of properties cannot be enumerated from one literal source declaration.
- A component cannot render its meaningful state without dimensions, content, data, or an associated child element.
- A stale generated contract differs from the authoritative source declaration.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The verification scope MUST include every publishable c2n custom element exposed by component, icon, and open-package catalogs.
- **FR-002**: The system MUST build a complete inventory of every public CSS custom property, including its owning element, declared type, documented default when present, description, applicable part, and applicable state.
- **FR-003**: Every documented public styling property MUST be classified as directly consumed by styling rules, consumed programmatically, delegated through another public component contract, or covered by an approved exception.
- **FR-004**: Every public styling property consumed by a component MUST appear in that component's published contract unless it is explicitly private and cannot be set through the configuration panel or consumer API.
- **FR-005**: Property names MUST match exactly across authoritative source documentation, published contract data, configuration controls, delegated mappings, and component consumption.
- **FR-006**: Documented defaults MUST match effective component defaults, including fallback references to other public properties.
- **FR-007**: Verification MUST detect a documented property that is declared but never consumed, even when a similarly spelled property is consumed.
- **FR-008**: Verification MUST detect a consumed public property that is missing from documentation or published contract data.
- **FR-009**: Verification MUST confirm that applying a valid contrasting value to each property produces its documented observable effect in an appropriate component example or verification context.
- **FR-010**: Verification contexts MUST activate every applicable interaction or semantic state needed to observe state-specific properties.
- **FR-011**: Verification MUST support observable effects on normal rendered regions, pseudo-elements, slotted content, delegated child components, and programmatically rendered surfaces.
- **FR-012**: A property verification MUST distinguish an invalid test value from a valid value that exposes a broken styling contract.
- **FR-013**: A component MUST be able to declare the minimum content, data, dimensions, related elements, and state setup necessary to make a property observable.
- **FR-014**: Configuration controls MUST write the exact public property selected by the user to the intended component target.
- **FR-015**: Configuration controls that combine side or corner values MUST maintain a one-to-one mapping, stable documented order, and equal cardinality between displayed values and public properties.
- **FR-016**: The configuration panel MUST NOT silently combine shorthand and longhand properties when doing so creates ambiguous precedence, duplicate control, or an unequal value mapping.
- **FR-017**: Reset MUST restore the authored property value and observable presentation without removing unrelated customizations.
- **FR-018**: Copied, saved, or exported configuration MUST include only effective public overrides and MUST reproduce the same observable component presentation in the same state.
- **FR-019**: Every verification failure MUST report the component tag, public property, failure category, expected effect or target, relevant state, and available observed evidence; spelling mismatches SHOULD include the nearest known property name.
- **FR-020**: The full-library result MUST give each inventoried property exactly one status: verified, failed, or approved exception.
- **FR-021**: Approved exceptions MUST be limited to browser-owned or third-party-rendered surfaces that cannot expose the normal styling contract and MUST record the limitation, user impact, supported alternative, rationale, and review date.
- **FR-022**: Unexplained failures and incomplete property classifications MUST prevent the styling-contract quality gate from passing.
- **FR-023**: New publishable components and new public styling properties MUST enter the verification scope automatically and MUST satisfy the same quality gate before release.
- **FR-024**: Changes to authoritative styling declarations MUST detect stale published contract data rather than validating the stale data as current.
- **FR-025**: The initial delivery MUST correct or explicitly classify all existing no-op, misspelled, undocumented, default-mismatched, conflicting shorthand/longhand, and incorrectly targeted styling contracts found by the audit.
- **FR-026**: The verification result MUST remain deterministic for the same repository state and MUST not depend on subjective visual comparison.
- **FR-027**: The feature MUST preserve the existing public behavior of valid styling properties. When an established public CSS custom property is misspelled, its corrected name MUST replace the old name immediately, and the change MUST include migration guidance identifying the old name and its replacement.
- **FR-028**: For generated icon sets, verification MUST check each tag's published styling contract individually and MUST live-test one representative icon per icon set for its shared CSS styling path. A generated icon with a genuinely distinct styling implementation MUST receive its own observable verification.
- **FR-029**: Observable verification MUST cover every in-scope styling property in Chromium. Representative styling checks MUST also run in Firefox and WebKit, including the distinct rendering paths and state mechanisms used by the library.
- **FR-030**: Verification MUST check every public styling property's mapping to its configuration control and direct observable effect. Interactive panel verification MUST cover every distinct control type and the change, reset, save, copy, and export flows; it need not repeat the same interaction for every property that shares a verified control path.

### Key Entities

- **Styling Contract**: The public agreement for one custom element's configurable presentation, consisting of documented properties, defaults, types, descriptions, parts, states, and observable effects.
- **Styling Property**: One public CSS custom property with an exact name, owner, declared value type, optional default or fallback, intended target, applicable state, and consumption mode.
- **Verification Context**: The minimum renderable example and state setup needed to observe one or more styling properties reliably.
- **Observable Effect**: A deterministic presentation or geometry change attributable to a valid property value on its intended region or programmatic output.
- **Delegated Mapping**: A declared relationship in which one component forwards or maps a public styling property to a child component's public contract.
- **Contract Failure**: An actionable discrepancy such as a missing, unused, misspelled, stale, default-mismatched, incorrectly targeted, state-inaccessible, or ambiguously grouped property.
- **Approved Exception**: A reviewed limitation for a surface that cannot support normal verification, paired with a documented alternative and reassessment information.
- **Audit Result**: The complete set of verified properties, failures, and approved exceptions for a repository state.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: One hundred percent of public styling properties across publishable components receive exactly one verified, failed, or approved-exception status.
- **SC-002**: One hundred percent of seeded misspelling, no-consumer, missing-documentation, default-mismatch, wrong-target, stale-contract, and ambiguous-grouping defects are rejected with the affected component and property identified.
- **SC-003**: One hundred percent of public styling properties have a valid configuration-control mapping and observable effect; every distinct control type and the reset, save, copy, and export flows pass representative interactive verification.
- **SC-004**: Every applicable base, interaction, semantic, and programmatic rendering state represented in a component's public styling contract has at least one deterministic verification context. One representative icon per icon set satisfies runtime styling coverage for its shared CSS path only when every generated tag's published contract is checked individually.
- **SC-005**: The initial full-library audit finishes with zero unexplained failures and zero unclassified public styling properties.
- **SC-006**: A maintainer can identify the owning component, property, failure category, relevant state, and expected target from any failure report in under one minute without manual source tracing.
- **SC-007**: Adding a new component or public styling property without a valid consumption path and observable verification is rejected on its first quality-gate run.
- **SC-008**: Repeating the full verification against an unchanged repository produces the same property statuses and diagnostics in every supported run.
- **SC-009**: All approved exceptions include the required limitation, impact, alternative, rationale, and review date, and no ordinary shadow-DOM styling property is accepted as an exception.
- **SC-010**: Existing valid component configurations continue to produce the same observable results after the verification feature is introduced, except for corrected misspelled names; every such correction has migration guidance mapping the old name to the new one.
- **SC-011**: All in-scope styling properties pass observable verification in Chromium, and the representative Firefox and WebKit checks pass for each distinct rendering path and state mechanism.

## Assumptions

- The authoritative public styling inventory continues to originate from component source documentation and published custom-element contracts.
- The configuration panel remains a generic consumer of published contracts rather than maintaining a separate manually curated property inventory.
- Most public properties can be verified through deterministic observable style or geometry changes; programmatic renderers may require purpose-specific evidence.
- State-specific properties are verified only after their documented state has been activated.
- Property descriptions will be made specific enough to identify the intended region and state when the current text is ambiguous.
- Private implementation variables are outside scope unless they are exposed to consumers or appear in published contract data.
- CSS parts remain governed by the broader styling constitution, but verifying part behavior is outside this feature except where a property requires a part or slotted region as its observable target.
- Visual-regression baselines are not required for contract validity; the feature verifies attributable observable effects rather than subjective design quality.
- Misspelled public property names are corrected immediately without an alias; migration guidance maps each old name to its replacement. Other public API changes require a separate compatibility decision.
- Generated icons use one runtime styling sample per icon set when they share the same CSS path; differences in generated styling implementation require separate verification. Phosphor weight changes alter SVG shape but use the same host size/color CSS path.
- Chromium is the comprehensive observable-verification browser; representative cross-browser checks cover Firefox and WebKit.
- Direct observable verification covers every public styling property; representative interactive panel checks cover each distinct control path and shared configuration flow.
- A reviewed exception is a last resort for browser-owned or third-party-rendered surfaces, not a substitute for wiring an ordinary configurable property correctly.
