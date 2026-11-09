---
title: Establish the Foundation Before Asking AI to Build a Large Application
description: Large, complex applications need reusable components, global architecture and business context, AI skills, and specialist agents before features are composed.
order: 1
status: published
---

You can describe an application in ordinary language, ask an AI coding agent to build it, and see a working screen minutes later. That is the appeal of vibe coding: turn an idea into something tangible, then steer it with more requests.

For a prototype or a small experiment, asking an agent to build the whole application can be a useful way to explore. For a large, complex application, it is a risky place to start. A broad prompt gives the agent room to invent the architecture, user interface patterns, component APIs, and quality process all at once. It may produce a convincing first pass, but it can also create one-off controls and inconsistent patterns that become expensive to maintain as the application grows.

The better starting point is to prepare the foundation the agent will need: a reusable component library, documentation of the application's global architecture, explicit business knowledge, AI skills for recurring work, and specialist agents for focused review such as code quality and security. Then ask the agent to compose those building blocks into features and the larger application. AI can still work quickly, but it is working within shared context, reusable parts, and checks the team can guide and improve.

## Why large applications need a foundation first

AI coding agents are good at producing a visible result from a high-level description. This makes them useful for exploring a workflow, testing an idea, or creating a proof of concept. But a large, complex application is not just a collection of screens. It is a system of shared behaviors, data, architecture, visual rules, and quality expectations.

When the agent builds every screen and control directly from a broad request, it must make many decisions without enough shared context. Similar buttons may behave differently; forms may validate inconsistently; and a pattern that should be reused may be implemented again in each feature. The code can look complete while the application lacks a reliable foundation.

That changes the first question. Instead of asking the agent to invent an entire product in one pass, ask what shared foundation it needs to build the product consistently. Prepare five connected parts:

1. **Build or improve the component library.** Ask the agent to find what already exists and reuse it. Where there is a gap, define a component's purpose, behavior, states, accessibility needs, API, and styling contract; then implement and validate it before using it across features.
2. **Document the global architecture.** Explain modules, data models, ownership boundaries, APIs, integrations, and important flows so new components and features fit the whole application.
3. **Capture business knowledge.** Give the agent domain terms, business rules, user roles, workflows, constraints, and exceptions. This context helps it implement what the product is meant to do, not just what a screen appears to show.
4. **Create AI skills for recurring work.** Write project-specific instructions for tasks such as selecting and composing components, implementing a feature, and checking accessibility. Skills make the preferred workflow repeatable.
5. **Add specialist agents and checks.** Use focused reviewers—for example, a code review agent for correctness and project fit, and a security agent for vulnerabilities and risky patterns—along with automated tests. Keep people responsible for resolving findings and accepting the result.

With that foundation in place, give the agent the approved components, architecture, business context, skills, and acceptance criteria, then ask it to deliver a bounded user flow. Use review and tests to catch issues and feed lessons back into the foundation.

These parts reinforce one another: components provide reusable product building blocks, architecture and business knowledge provide context and boundaries, and skills and specialist agents guide and check the work. This does not mean finishing a whole design system or writing exhaustive documents before learning anything. Build the foundation in useful increments: reuse what is ready, improve what is missing, and let validation reveal what needs to change.

## The development cycle stays; the work shifts

Building that foundation is part of the development cycle, not a separate phase that replaces it. Teams still specify requirements, design the data and architecture, implement, and validate. AI can produce a first draft at each stage; people decide what is correct and refine the output before it becomes the next stage's foundation.

<div class="article-cycle-grid">
  <section class="article-cycle-stage">
    <h3>1. Specification</h3>
    <p><span class="article-comparison-label">Traditional</span>Teams write requirements and acceptance criteria for people to implement.</p>
    <p><span class="article-comparison-label">AI-assisted</span>People give the agent goals, constraints, edge cases, and acceptance criteria; the agent can help draft and refine them.</p>
  </section>
  <section class="article-cycle-stage">
    <h3>2. Design</h3>
    <p><span class="article-comparison-label">Traditional</span>Architects and engineers define the data model, system boundaries, and key interactions.</p>
    <p><span class="article-comparison-label">AI-assisted</span>Agents propose designs; people check them against the global architecture and make the decisions the agent must follow.</p>
  </section>
  <section class="article-cycle-stage">
    <h3>3. Implementation</h3>
    <p><span class="article-comparison-label">Traditional</span>Developers build features and apply project patterns and coding practices.</p>
    <p><span class="article-comparison-label">AI-assisted</span>Agents implement bounded tasks, such as a component or a feature composed from known components, using project guidance and review.</p>
  </section>
  <section class="article-cycle-stage">
    <h3>4. Validation</h3>
    <p><span class="article-comparison-label">Traditional</span>Teams use POCs, MVPs, and automated or manual tests to learn and check behavior.</p>
    <p><span class="article-comparison-label">AI-assisted</span>Agents create prototypes and tests; people define what must be proven and verify critical flows and results.</p>
  </section>
</div>

<figure class="article-cycle">
  <img
    src="/web-components/images/ai-development-cycle.svg"
    alt="A loop moves from specification to design, implementation, and validation, then returns to specification. An AI agent works at every stage while a human engineer reviews and refines each pass."
    width="900"
    height="495"
  />
  <figcaption>The stages remain the same. AI drafts at every stage; the human engineer steers the loop.</figcaption>
</figure>

A proof of concept checks whether an approach is feasible. An MVP helps a team learn whether a small product solves a real problem. End-to-end tests check whether an integrated application supports important user flows. Agents can speed up work at every stage, but people still define what success looks like and decide what to carry forward. That faster loop makes clear human direction more valuable: every specification, design, component, and test becomes input to the next agent pass.

## The human 20% shapes the AI's 80%

One useful way to picture the shift is that AI handles roughly 80% of the execution across the development cycle, while people contribute the remaining 20% that gives the work direction and quality. This is a mental model, not a measured split for every project. The smaller share can have an outsized effect on whether the application is coherent and dependable. In practice, much of that high-leverage work is preparing the five parts of the foundation and improving them as the agent works.

The developer's primary day-to-day interlocutor is now often an AI agent. So the human role is not only to inspect a finished pull request. It is to give the agent useful context and clear boundaries before and during implementation:

- **Write specs for agents to use.** State the outcome, constraints, edge cases, dependencies, and acceptance criteria in concrete terms. Keep important decisions out of scattered conversation history.
- **Define the application-wide architecture.** Document modules, data models, ownership boundaries, APIs, and key flows. A feature design describes one change; the global architecture explains how changes fit together.
- **Make quality a foundation.** Document the patterns and practices the agent should follow for accessibility, security, error handling, testing, and maintainability. A passing static-analysis scan is useful after code exists; it does not replace guidance that can shape the code from the beginning.
- **Set component boundaries.** Explain what belongs in a reusable component, which existing building blocks to prefer, and how components should be composed. This helps the agent avoid inventing a different solution in every feature.
- **Turn repeatable work into skills and focused agents.** A skill can show the agent how the team wants a component or feature built. A code review agent and a security agent can inspect a change against their areas of responsibility, with tests and human review completing the feedback loop.

The point of these decisions is to improve the agent's next pass, not to write documents for their own sake. The spec gives it a task, architecture gives it system boundaries, business knowledge gives it domain meaning, reusable components give it dependable pieces, and skills and specialist agents help carry quality expectations through the work. For those inputs to matter, the agent must be able to find and use them at the right moment. That is where the AI-era toolchain comes in.

## Tools are adapting to agent-led development

A coding agent alone is not a complete development workflow. It needs discoverable project context, structured work, reusable procedures, and feedback that reflects more than whether the code compiles. Several tools are beginning to support parts of this workflow:

<div class="article-tool-list">
  <section class="article-tool">
    <h3>Structure an agent-usable spec and plan</h3>
    <p><strong>Examples:</strong> <a href="https://github.github.com/spec-kit/">GitHub Spec Kit</a>, <a href="https://kiro.dev/docs/specs/">Kiro Specs</a></p>
    <p>Carry an idea through requirements, design, tasks, implementation, and review rather than relying on one large prompt.</p>
  </section>
  <section class="article-tool">
    <h3>Make project rules and workflows available</h3>
    <p><strong>Examples:</strong> <a href="https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions">Repository instructions</a>, <a href="https://developers.openai.com/api/docs/guides/tools-skills">Agent Skills</a></p>
    <p>Give agents access to architecture, code-quality expectations, and repeatable task guidance.</p>
  </section>
  <section class="article-tool">
    <h3>Review changes and security risks</h3>
    <p><strong>Examples:</strong> <a href="https://www.cubic.dev/">Cubic</a>, <a href="https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review">GitHub Copilot code review</a>, <a href="https://help.openai.com/en/articles/20001107">Codex Security</a> (research preview)</p>
    <p>Focused reviewers can check correctness, project fit, and security risks. Codex Security identifies, validates, and proposes fixes for vulnerabilities. People still judge findings and approve the result.</p>
  </section>
  <section class="article-tool">
    <h3>Create and maintain browser tests</h3>
    <p><strong>Example:</strong> <a href="https://playwright.dev/docs/test-agents">Playwright Test Agents</a></p>
    <p>Help plan, generate, and repair browser tests while people define expected behavior.</p>
  </section>
</div>

These are examples, not a required shopping list, and not every team needs a separate product for every role. The important step is to establish the workflow before asking an agent to generate a large application: give it project-specific skills, and make review and security checks part of how changes are produced. Contextual code review also complements static analysis. [SonarQube](https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-rules/security-related-rules) applies repeatable rules for bugs, maintainability issues, vulnerabilities, and security hotspots. An AI reviewer can consider change intent and project guidance. Both can provide useful signals, and people remain responsible for resolving them. The tools help carry the foundation into each task; the component library is the part the AI uses most visibly as it builds the interface.

## Design systems and component libraries matter more

A design system gives an application shared visual rules. A component library turns those rules and behaviors into usable building blocks: buttons, fields, menus, dialogs, and more. Together, they give the agent reliable patterns to reuse instead of leaving it to recreate every control from scratch. This is why the component library is not just one item on the foundation checklist: it is where architecture, business needs, and design rules become concrete pieces the agent can compose.

That only works when the library has enough coverage and the agent can find and understand what is available. Missing components, unclear APIs, and thin examples push the agent toward custom code. Improving component coverage and making components easy to discover, understand, and compose are therefore part of adapting software development for AI.

For a small prototype, asking the agent to build the whole application can be the fastest way to learn. For a large, complex application, prepare the foundation—components, global architecture, business knowledge, skills, and specialist agents—then let the agent build feature by feature within it. The aim is not simply to get AI to write more code; it is to give each fast iteration a stronger starting point than the last.

The next article will focus on the practical workflow: how to ask AI to build or extend a reusable component, validate it, and compose it into a complete feature.
