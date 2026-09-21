# Feature Specification: Complete Slot Styling Contract

**Feature Branch**: `feat/ship-manifests-and-llms-txt`

**Created**: 2026-09-20

**Status**: Implemented

**Input**: User description: "Allow framework consumers using CSS Modules or scoped styles to customize slot regions by exposing CSS parts for meaningful slot placeholders and containers."

## User Scenarios & Testing

### User Story 1 - Style a Slotted Region Without Replacing It (Priority: P1)

A component consumer can customize the component-owned layout and presentation around projected content without replacing the component's shadow tree or depending on private selectors.

**Why this priority**: This is the core interoperability gap. Consumers can already style the light-DOM node they supply, but they cannot reliably style a component-owned slot wrapper, placement region, or fallback surface unless the component exposes it.

**Independent Test**: Choose a component whose slot sits in a visible internal region, apply the documented public styling hook, and verify that the region changes while the assigned content, fallback content, interaction, and accessibility behavior remain intact.

**Acceptance Scenarios**:

1. **Given** a public slot with a component-owned wrapper or visible fallback, **When** a consumer applies the documented styling hook, **Then** the intended internal region changes without private shadow-tree access.
2. **Given** a public slot whose assigned node is already directly styleable by its owner, **When** a consumer reviews the contract, **Then** the documentation distinguishes styling the assigned node from styling the component-owned slot region.
3. **Given** a slot with no meaningful component-owned visual or structural surface, **When** the slot is audited, **Then** no redundant public part is added solely to satisfy a one-part-per-slot count.
4. **Given** a slot containing a bare text node, **When** a consumer reviews its styling route, **Then** the documentation identifies whether presentation is inherited from the host, controlled by a public hook, or requires an author-owned wrapper element.

---

### User Story 2 - Discover the Correct Styling Hook (Priority: P2)

A developer or AI tool can inspect the component contract and determine how to style each public slot's assigned content, internal placement region, and fallback presentation.

**Why this priority**: A styling hook only helps when its purpose and boundary are machine-readable and consistent across source documentation, manifests, and the API page.

**Independent Test**: Inspect the published contract for a component with several slot types and identify, without reading its implementation, which public hook styles the internal region and which selector or class styles the assigned node.

**Acceptance Scenarios**:

1. **Given** a component with public slots, **When** its contract is generated, **Then** every exposed slot-region part has a semantic name and a description identifying the slot and the exact region it controls.
2. **Given** a slot that intentionally has no corresponding part, **When** a developer reads the slot documentation, **Then** it explains that assigned content is styled directly and does not imply that a part can pierce into the assigned component.
3. **Given** a styling-contract change, **When** documentation is generated, **Then** source declarations, manifests, package documentation, API pages, and AI-facing references agree.

---

### User Story 3 - Use Slot Styling From Scoped Application Styles (Priority: P3)

A framework application using locally scoped styles can customize both a supplied slot component and the web component's public internal slot region using supported public selectors.

**Why this priority**: This proves that the contract works in the environment that motivated the feature and gives consumers a copyable integration pattern.

**Independent Test**: Run a documented example in a scoped-style or CSS-module application, verify that a local class styles the assigned node and a public part selector styles its component-owned placement region, and confirm no global private shadow selector is required.

**Acceptance Scenarios**:

1. **Given** a consumer-supplied element placed in a slot, **When** a locally scoped class is applied to that element, **Then** its own public surface is styleable.
2. **Given** the same slotted element, **When** the host's documented part selector is applied, **Then** the component-owned slot region changes independently of the supplied element.
3. **Given** a supplied custom element with its own shadow tree, **When** consumers need to style inside it, **Then** the guidance directs them to that element's own styling contract rather than promising cross-shadow styling through the parent slot.

### Edge Cases

- Default slots have no authored name, so their public part names must remain semantic and unambiguous.
- Multiple slots may share one meaningful internal region; the contract must not expose duplicate aliases unless consumers need independent control.
- A slot may render fallback text, icons, buttons, loading, empty, or error states that require separate styling from assigned content.
- A conditional slot or wrapper may not exist in every state; its documentation must identify when the corresponding part is present.
- A slot may receive a native element, text node, or custom element; the styling guidance must not assume one assigned-node type.
- Nested custom elements retain their own shadow boundaries; a parent component's part cannot expose a descendant component's internals.
- Existing part names are public API and must not be renamed or repurposed while filling gaps.

## Requirements

### Functional Requirements

- **FR-001**: Every public slot in every publishable component MUST be audited for a component-owned wrapper, placement region, or visible fallback that consumers may need to style.
- **FR-002**: Every meaningful component-owned slot region identified by the audit MUST expose a stable, semantically named public styling part unless an existing public variable or part already provides equivalent control. A `delegated` decision is permitted only when the relevant presentation belongs to another published custom element and that element's public styling contract is identified.
- **FR-003**: A part MUST NOT be added solely because a slot exists; slots with no meaningful internal styling surface MUST instead document how consumers style their assigned content directly. For a bare text node that cannot be targeted directly, the documented route MUST identify inherited host styling, an applicable public hook, or the need for an author-owned wrapper element.
- **FR-004**: When fallback content has an independently meaningful presentation, consumers MUST be able to style that fallback through a documented public part or an existing equivalent hook.
- **FR-005**: Part descriptions MUST identify the related slot, the exact internal element or region controlled, the states in which it exists, and whether it affects fallback content, assigned content placement, or both.
- **FR-006**: Slot descriptions MUST distinguish the assigned light-DOM node from component-owned shadow content and MUST NOT imply that a part styles inside a nested custom element.
- **FR-007**: New part names MUST follow the library's existing semantic naming conventions; the default slot MUST receive a purpose-based name rather than the literal name `default` when that better describes the region.
- **FR-008**: Existing part names and behavior MUST remain backward compatible; equivalent existing hooks MUST be reused instead of introducing aliases.
- **FR-009**: Source declarations, generated manifests, package documentation, the API reference, realistic examples, and AI-facing documentation MUST expose the same slot styling contract.
- **FR-010**: Automated contract validation MUST fail when a public slot-region part lacks a description or when generated metadata drifts from the authoritative source declaration.
- **FR-011**: Representative browser validation MUST prove that public parts change component-owned slot regions without changing slot assignment, interaction, focus, semantics, or fallback behavior.
- **FR-012**: Integration guidance MUST show both sides of the boundary: styling the consumer-owned assigned node with local styles and styling the component-owned region through its public part.

### Key Entities

- **Public Slot**: A named or default projection point exposed by a component, including its purpose, accepted content, fallback, and availability by state.
- **Slot Styling Route**: The documented way to style either consumer-owned assigned content or a component-owned internal region.
- **CSS Part Contract**: A stable public name and semantic description for a component-owned shadow element or region.
- **Slot Audit Entry**: The record of a slot, its internal wrapper/fallback, existing styling coverage, required action, and verification evidence.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of public slots in publishable components have exactly one recorded audit decision: `part`, `variables`, `assigned-content`, or `delegated`.
- **SC-002**: 100% of meaningful component-owned slot regions identified by the audit can be restyled through documented public hooks without replacing or directly querying a private shadow tree.
- **SC-003**: 100% of new or reused slot-region hooks appear with matching names and descriptions across all generated and human-facing contract surfaces.
- **SC-004**: A developer can identify and apply the correct styling route for a representative slot in under five minutes using only published documentation.
- **SC-005**: Representative validation covers at least one named slot, one default slot, one visible fallback, one conditional slot region, and one nested custom-element boundary with no regression in behavior or accessibility.
- **SC-006**: All existing component, documentation, type, and browser quality gates continue to pass after the contract expansion.

## Assumptions

- Consumers own and can directly class or otherwise style light-DOM elements they assign to slots; bare text nodes rely on inherited host styling, another documented public hook, or an author-owned wrapper element.
- Public parts expose only component-owned shadow elements; they do not cross into the shadow tree of an assigned custom element.
- The feature is an audit and contract-completion effort, not a redesign of slot layouts or visual defaults.
- Existing CSS custom properties remain the preferred hook for scalar visual values; parts are added for structural or composed regions that variables cannot adequately address.
- The first delivery may batch components by independent package while preserving one repository-wide audit and naming policy.
