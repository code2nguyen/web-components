import { z } from 'astro:content'

export const COMPONENT_CATEGORIES = [
  'Inputs',
  'Buttons',
  'Navigation',
  'Layout',
  'Data display',
  'Table',
  'Editors & viewers',
  'Chart',
  'Planning',
  'Feedback',
  'Chat',
] as const

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number]

export const componentSchema = z.object({
  title: z.string(),
  description: z.string().default(''),
  category: z.enum(COMPONENT_CATEGORIES).default('Layout'),
  /** Workspace package name, e.g. `@c2n/checkbox` (published through `@c2n/components`). Defaults to `@c2n/<id>` when omitted. */
  package: z.string().optional(),
  /**
   * The package's primary custom element, when the package name is not itself a tag — `@c2n/chart` ships
   * `c2-line-chart` and four siblings, and has no `c2-chart`. Defaults to `c2-<id>`.
   */
  tag: z.string().optional(),
  /**
   * Elements to document on the API page, when `[tag, ...siblingTags]` is not the right set — `@c2n/chart`
   * ships five chart tags on five pages, each of which documents only itself and `c2-chart-series`.
   * Defaults to the page's tag followed by every other tag of its package.
   */
  apiTags: z.array(z.string()).optional(),
})

export const iconSetSchema = z.object({
  title: z.string(),
  description: z.string().default(''),
  package: z.string().optional(),
})

/** Gallery pages (`src/content/gallery/<component-id>.mdx`): styled variants of a component, one MdxCodeBlock fence per card. */
export const gallerySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
})

/** Guide pages (`src/content/guides/<id>.mdx`): long-form documentation such as theming and the application workflow. */
export const guideSchema = z.object({
  title: z.string(),
  description: z.string().default(''),
  /** Sidebar order, ascending. */
  order: z.number().default(100),
})

/** Blog articles (`src/content/blogs/<id>.md`): long-form articles in the AI-assisted application development series. */
export const blogSchema = z.object({
  title: z.string(),
  description: z.string().default(''),
  /** Article order in the series. */
  order: z.number().default(100),
  /** Drafts are available in development and are omitted from production builds until published. */
  status: z.enum(['draft', 'published']).default('draft'),
})

export const EXAMPLE_FRAMEWORKS = ['html', 'react', 'nextjs', 'angular', 'vue', 'sveltekit', 'astro'] as const

export type ExampleFramework = (typeof EXAMPLE_FRAMEWORKS)[number]

/** Human label for an example's framework, used on cards and in the sidebar. */
export const EXAMPLE_FRAMEWORK_LABELS: Record<ExampleFramework, string> = {
  html: 'HTML',
  react: 'React',
  nextjs: 'Next.js',
  angular: 'Angular',
  vue: 'Vue',
  sveltekit: 'SvelteKit',
  astro: 'Astro',
}

/**
 * Example apps (`apps/examples/<id>/app.config.json`): complete applications that consume the published
 * packages the way an outside project would. The metadata lives with the app, not in the docs site, so
 * adding an example is a directory drop plus a wireit entry.
 */
export const exampleSchema = z.object({
  title: z.string(),
  description: z.string().default(''),
  framework: z.enum(EXAMPLE_FRAMEWORKS),
  outputDir: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default('dist'),
  sourcePath: z
    .string()
    .regex(/^[a-zA-Z0-9_./-]+$/)
    .optional(),
  evaluationPath: z
    .string()
    .regex(/^[a-zA-Z0-9_./-]+$/)
    .optional(),
  tags: z.array(z.string()).default([]),
  /** Card order, ascending. */
  order: z.number().default(100),
})

// ── Component lab (lab/ at the repository root, read by the /lab pages) ──────────────────────────────────────────

/** A requirement's outcome in a build report (lab/reports/TEMPLATE.md). */
export const LAB_OUTCOMES = ['met', 'workaround', 'hand-rolled', 'failed'] as const

/** One run record, as `lab/scripts/lib/record.mjs` writes it (schema 1). Unknown fields are kept, so a newer record still loads. */
export const labRunSchema = z
  .object({
    schema: z.literal(1),
    id: z.string(),
    startedAt: z.string(),
    durationSeconds: z.number(),
    mode: z.enum(['run', 'replay']),
    target: z.string(),
    spec: z.string().nullable(),
    direction: z.string().nullable(),
    library: z.object({ version: z.string(), commit: z.string().nullable(), branch: z.string().nullable().optional(), dirty: z.boolean() }),
    runner: z.object({ personas: z.array(z.string()), repeat: z.number(), journeys: z.array(z.string()), full: z.boolean() }).passthrough(),
    build: z
      .object({
        report: z.string(),
        builder: z.string().nullable(),
        date: z.string().nullable(),
        outcomes: z.record(z.string(), z.object({ outcome: z.string(), components: z.array(z.string()).optional() }).passthrough()),
      })
      .nullable(),
    summary: z.object({
      journeys: z.number(),
      passed: z.number(),
      flakyJourneys: z.number(),
      failed: z.number(),
      findings: z.object({ new: z.number(), known: z.number(), flaky: z.number() }),
    }),
    journeys: z.array(z.object({ persona: z.string(), journey: z.string(), runs: z.number(), passed: z.number(), failedStep: z.number().nullable() })),
    findings: z.array(
      z.object({
        key: z.string(),
        kind: z.string(),
        severity: z.string(),
        component: z.string().nullable(),
        rule: z.string().nullable(),
        status: z.enum(['new', 'known']),
        reproducible: z.boolean(),
        seen: z.record(z.string(), z.number()),
        message: z.string(),
      }),
    ),
    change: z
      .object({ previous: z.string(), appeared: z.array(z.string()), gone: z.array(z.string()), unverified: z.array(z.string()).default([]) })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()

/** A spec's front matter (lab/specs/TEMPLATE.md); the requirements and tasks are read from its body. */
export const labSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  size: z.enum(['scenario', 'feature', 'app']),
  focus: z.array(z.string()).default([]),
  directions: z.array(z.string()).default(['default']),
})

/** A build report's front matter (lab/reports/TEMPLATE.md); the outcomes are read from its table. */
export const labReportSchema = z.object({
  spec: z.string(),
  direction: z.string().default('default'),
  build: z.string().optional(),
  target: z.string().optional(),
  builder: z.string().optional(),
  // A YAML date (2026-11-17) arrives as a Date; keep the day as written.
  date: z.preprocess((value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value), z.string()).optional(),
})
