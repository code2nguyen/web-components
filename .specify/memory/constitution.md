<!--
Sync Impact Report
- Version change: template (unratified) -> 1.0.0
- Modified principles:
  - Placeholder Principle 1 -> I. AI-First Component Contracts
  - Placeholder Principle 2 -> II. Complete Styling Control
  - Placeholder Principle 3 -> III. Real-World Examples Are Product Surface
  - Placeholder Principle 4 -> IV. One Contract, Every Documentation Surface
  - Placeholder Principle 5 -> V. Accessible, Portable Web Standards
- Added sections:
  - Component Contract Requirements
  - Development Workflow and Quality Gates
- Removed sections: none
- Follow-up TODOs: none
-->

# c2n Web Components Constitution

## Core Principles

### I. AI-First Component Contracts

AI models are the primary discovery and composition audience for every component. Each public
component MUST expose an explicit, machine-readable contract covering its tag name, purpose,
attributes, properties, methods, events, slots, CSS custom properties, CSS parts, defaults, value
ranges, state interactions, and accessibility responsibilities. Descriptions MUST explain observable
behavior and usage intent rather than merely repeat a symbol's name. APIs MUST use consistent,
predictable naming and MUST avoid behavior that depends on undocumented context. The same contract
MUST remain understandable to a developer reading it without AI tooling.

Rationale: complete, semantic metadata lets an AI select and compose components reliably while
clear prose keeps the library practical for direct human use.

### II. Complete Styling Control

Every user-visible presentation choice MUST be customizable without editing component source or
replacing its shadow DOM. Components MUST expose CSS custom properties for visual values such as
color, typography, spacing, sizing, borders, radii, shadows, opacity, motion, and state styling.
Components MUST expose stable CSS parts for meaningful internal regions whose composed or
structural styling cannot be expressed adequately through variables alone. Styling hooks MUST cover
all applicable interaction and semantic states, including hover, active, focus, selected, disabled,
loading, success, warning, and error. Defaults MUST remain usable without a theme, and every public
variable and part MUST be documented with its purpose and, where applicable, default value.

Rationale: consumers need full visual ownership while the component retains its behavior,
accessibility, and implementation boundary.

### III. Real-World Examples Are Product Surface

Every component MUST have examples in `apps/ui` that demonstrate realistic tasks, data, labels, and
surrounding context. A component's examples MUST cover its primary use case, meaningful variants,
interactive states, accessibility-sensitive behavior, and at least one substantial customization
using CSS custom properties or CSS parts. Complex components MUST include composition examples with
related components. Examples MUST be runnable, copyable, and explicit about imports, markup,
configuration, event handling, and styling; isolated toy snippets alone are insufficient.

Rationale: concrete, production-shaped examples are the strongest source of intent for AI models
and the fastest learning path for developers.

### IV. One Contract, Every Documentation Surface

Source documentation, TypeScript types, package README files, `custom-elements.json`, the UI
documentation, examples, and AI-facing tools MUST describe the same public API. Public API changes
MUST update all affected surfaces in the same change. Generated metadata MUST be produced from
authoritative source declarations and MUST be reviewed as a release artifact. Documentation MUST
include when to use the component, when not to use it, complete API and styling references,
accessibility guidance, and working examples. Examples MUST use only public, documented behavior.

Rationale: one coherent contract prevents both AI models and developers from learning stale or
contradictory usage patterns.

### V. Accessible, Portable Web Standards

Components MUST work as standards-based custom elements in supported browsers and MUST not require
a specific application framework. Keyboard operation, focus management, semantic roles, accessible
names, state announcements, reduced-motion behavior, and contrast MUST be designed and tested where
applicable. Public behavior MUST be verified at the element boundary through attributes, properties,
events, slots, CSS custom properties, and CSS parts. Framework adapters MAY improve ergonomics but
MUST NOT become the only complete or documented way to use a component.

Rationale: an AI-generated interface is only useful when the resulting component works for real
users across frameworks, input methods, and assistive technologies.

## Component Contract Requirements

Each publishable component MUST ship as an independently consumable package and MUST provide:

- a concise purpose statement and decision guidance;
- typed public attributes, properties, methods, events, slots, and their defaults;
- a complete inventory of CSS custom properties and CSS parts with semantic descriptions;
- framework-neutral installation and usage instructions;
- realistic `apps/ui` examples, including interaction and customization;
- browser tests for public behavior, meaningful states, keyboard use, focus, and accessibility; and
- synchronized package README and custom-elements manifest output.

New public APIs MUST prefer small, composable primitives over overlapping modes. Native HTML
semantics and platform conventions MUST be used before inventing custom behavior. Breaking changes
MUST include migration guidance. Exceptions to complete styling exposure are permitted only for
browser-owned or third-party rendered surfaces that cannot support CSS custom properties or parts;
the limitation and the supported alternative MUST be documented explicitly.

## Development Workflow and Quality Gates

Specifications and plans MUST identify the component's user task, public contract, styling hooks,
accessibility behavior, documentation changes, and real-world examples before implementation is
considered complete. Reviews MUST verify both audiences: an AI can discover enough structured
information to select and compose the component correctly, and a developer can understand and use
it from the written documentation alone.

Every component change MUST pass the relevant build, type, documentation, and browser-test checks.
Behavior changes require tests that exercise observable results through real pointer or keyboard
input. Styling-contract changes require verification that documented variables and parts affect the
intended regions and states. Documentation checks MUST detect missing or stale public API entries,
and UI examples MUST build successfully. A change MUST NOT be merged with undocumented public
behavior, private implementation details presented as API, or examples that depend on unpublished
interfaces.

## Governance

This constitution supersedes conflicting local practices and feature-specific guidance. Every
specification, implementation plan, task list, code review, and release review MUST include an
explicit constitution compliance check. Any exception MUST be recorded in the relevant design or
pull request with its scope, technical reason, user impact, and a dated plan to remove or reassess
it; convenience or schedule pressure alone is not sufficient justification.

Amendments require a documented proposal, review of affected components and workflows, approval by
a project maintainer, and a migration plan when existing work becomes non-compliant. Constitution
versions follow semantic versioning: MAJOR for removal or incompatible redefinition of a principle,
MINOR for a new principle or materially expanded obligation, and PATCH for non-semantic
clarification. Compliance MUST be reviewed whenever a public component contract changes and before
each release.

**Version**: 1.0.0 | **Ratified**: 2026-09-20 | **Last Amended**: 2026-09-20
