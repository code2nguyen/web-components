# Article roadmap: Building applications in the AI era

## Purpose

Build visibility for c2n by publishing a series about how AI is changing application development and what developers need to build good applications with coding agents. The series should make a broader case first, then use c2n as a practical example of the ideas in action.

## Series thesis

AI-assisted coding is changing how applications are built. Getting reliable, maintainable results takes more than a coding agent: it takes a development workflow designed for AI, including useful project context, reusable skills, well-described components, and effective code review. Design systems and component libraries can give agents dependable building blocks, but only when they offer enough coverage and make those building blocks easy for agents to discover, understand, and compose.

## Intended readers

- Developers and product builders using Claude, Codex, or other coding agents
- Design-system and component-library maintainers
- Teams deciding how to adapt their development practices for AI-assisted work

## Article sequence

### 1. Establish the Foundation Before Asking AI to Build a Large Application

**Purpose:** Explain how AI agents can generate whole applications quickly, then make the case for preparing reusable components, global architecture documentation, business knowledge, AI skills, and specialist agents before building a large, complex application.

**Core points:**

- Whole-application prompting is useful for prototypes and small experiments, but can lead to inconsistent, one-off patterns in a large product.
- For a large, complex application, ask the agent to inspect the existing component library, reuse what fits, and build focused reusable components where there are gaps.
- Document the application's global architecture and capture business knowledge so agents have the system boundaries and domain rules they need.
- Prepare the AI workflow with project-specific skills and specialist agents or checks for code review, security, and testing.
- Compose validated components into features and the larger application rather than delegating the whole product in one broad prompt.
- The traditional specification, design, implementation, and validation cycle remains; AI can work at every stage while people provide the direction, architecture, quality standards, and review.
- AI-era tools such as specs, project instructions, skills, contextual review, and test agents help carry human decisions into the agent's work.

**Leads to:** How can we use AI to define, implement, and validate reusable components with an agent workflow designed for quality?

### 2. Build Reusable Components with AI, Then Compose the Application

**Purpose:** Show a component-first way to use AI on a large application: find existing building blocks, create focused reusable components when needed, then compose them into complete features.

**Core points:**

- Start by asking the agent to inspect the project's existing component library and reuse what fits.
- When a component is missing, define its behavior, API, accessibility, and quality expectations before asking AI to implement it.
- Build and refine a focused component, then compose it with existing components to deliver the larger feature.
- Smaller component tasks give the agent clearer boundaries and leave the team with reusable building blocks.

**Leads to:** Component availability matters, and the library must make its components understandable to both people and agents.

### 3. A Component Library for Humans Isn’t Automatically a Library for AI

**Purpose:** Describe what agents need from a component library in addition to what human developers expect.

**Core points:**

- Clear, machine-readable APIs and accurate documentation
- Examples that show realistic composition, states, and customization
- Predictable behavior, accessible defaults, and stable styling contracts
- Discovery mechanisms that help an agent select the right component rather than guess

**Leads to:** Even an agent-friendly library needs a sound process around it.

### 4. The Missing Layer: Skills, Workflows, and Review for AI Coding

**Purpose:** Make the case that a coding agent by itself is not a complete software-development workflow.

**Core points:**

- Agents need project-specific instructions and reusable skills.
- Work should be broken into steps that include implementation and review.
- Code review should check behavior, accessibility, consistency, and long-term fit, not only whether code compiles.
- Teams need feedback loops that turn recurring agent mistakes into better tools and guidance.

**Leads to:** Design systems can supply some of the structure and constraints that make this workflow work.

### 5. Design Systems as Guardrails for AI-Built Applications

**Purpose:** Show how a design system can help agents create applications that feel consistent and behave reliably.

**Core points:**

- Tokens and documented component APIs give the agent a shared visual and behavioral vocabulary.
- Accessible, composable primitives reduce the need for bespoke controls.
- A design system can constrain variation while still allowing product-specific expression.
- The system becomes more valuable when its rules are explicit and usable by tools as well as people.

**Leads to:** These ideas imply a more concrete set of requirements for component libraries.

### 6. What an AI-Ready Component Library Needs

**Purpose:** Synthesize the series into practical principles for designing and evaluating component libraries in the AI era.

**Core points:**

- Broad coverage of real application patterns
- Discoverable components with explicit APIs and composition guidance
- Strong defaults for accessibility, theming, and behavior
- Copyable examples that work in real projects and frameworks
- Feedback, tests, and review practices that keep generated usage dependable

**Leads to:** Show how these principles shape the work on c2n.

### 7. Building c2n for the Way Software Is Being Built

**Purpose:** Connect the broader argument to c2n’s implementation and invite developers to follow or contribute to the work.

**Core points:**

- What c2n provides today: components, variants, documentation, and agent-facing tools
- How those pieces fit into an AI-assisted development workflow
- Where the library still has gaps and how those gaps are prioritized
- What the team is learning from real use and feedback

**Editorial note:** Keep this grounded in concrete examples. Treat c2n as an evolving case study, not as proof that every problem is already solved.

## Editorial approach

- Write the articles one at a time, in sequence, so later pieces can build on reader questions and experience from earlier ones.
- Make each article useful on its own and end with a natural question that leads into the next article.
- Support broad claims with examples from real coding-agent workflows and applications.
- Be candid about the limitations of current design systems and of c2n itself.
- Keep the focus on the changing way applications are built; mention c2n where it illustrates the argument rather than turning every article into a product announcement.
