import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Shared flat ESLint config for the monorepo.
 * Consumed by the root `eslint.config.js`.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/out/**',
      '**/coverage/**',
      '**/types/**',
      '**/node_modules/**',
      '**/.astro/**',
      '**/.wireit/**',
      '**/custom-elements.json',
      'apps/ui/public/demo/**',
      'playwright-report/**',
      'test-results/**',
      '**/*.min.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-prototype-builtins': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // `@typescript-eslint/ban-types` was removed in typescript-eslint v8 and split
      // into the two rules below; both stay off to preserve the previous behaviour.
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      // Every component merges an interface into its class to declare typed `addEventListener` overloads
      // (see `@c2n/core/event-helper.js`). That is the one sanctioned use of class/interface merging — the
      // members are inherited from `HTMLElement`, not left unimplemented — and it is the repo's idiom.
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // build/tooling scripts and the MCP server run in Node
    files: [
      '**/*.config.{js,mjs,cjs,ts}',
      '**/plopfile.{js,ts}',
      'scripts/**/*.{js,mjs,ts}',
      '**/scripts/**/*.{js,mjs,ts}',
      'apps/ui/plugin/**/*.mjs',
      'packages/tools/mcp/**/*.ts',
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/*_test.ts', '**/custom_typings/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
