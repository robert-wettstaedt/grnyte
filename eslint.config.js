import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import drizzle from 'eslint-plugin-drizzle'
import perfectionist from 'eslint-plugin-perfectionist'
import storybook from 'eslint-plugin-storybook'
import svelte from 'eslint-plugin-svelte'
import { defineConfig, includeIgnoreFile } from 'eslint/config'
import globals from 'globals'
import path from 'node:path'
import ts from 'typescript-eslint'

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore')

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  { ignores: ['build/', 'drizzle/', 'src/lib/paraglide/'] },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  perfectionist.configs['recommended-natural'],
  prettier,
  svelte.configs.prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Allow underscore-prefixed args to mark deliberately unused parameters.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Prefer the '$lib' alias over relative paths that climb into the lib folder.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              message: "Use the '$lib' alias instead of a relative path into the lib folder.",
              regex: '^(\\.\\./)+lib/',
            },
          ],
        },
      ],
      // typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
      // see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
      'no-undef': 'off',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        projectService: {
          allowDefaultProject: ['.storybook/*.svelte'],
        },
      },
    },
  },
  {
    plugins: { drizzle },
    rules: {
      'drizzle/enforce-delete-with-where': ['error', { drizzleObjectName: ['db', 'tx'] }],
      'drizzle/enforce-update-with-where': ['error', { drizzleObjectName: ['db', 'tx'] }],
    },
  },
  {
    // Avoid barrel files: index.ts that re-exports a folder's modules.
    files: ['**/index.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          message: "Avoid barrel files: don't re-export a folder's modules from index.ts. Import the modules directly.",
          selector: 'ExportAllDeclaration',
        },
        {
          message: "Avoid barrel files: don't re-export a folder's modules from index.ts. Import the modules directly.",
          selector: 'ExportNamedDeclaration[source]',
        },
      ],
    },
  },
  {
    rules: {
      // Match TypeScript's "Organize Imports" (organize-imports-cli) style: one flat block, no blank
      // lines, sorted by code-point path ($ before @ before bare packages, relative last), and `type`
      // specifiers after values. $-imports get their own leading group because perfectionist's
      // alphabetical comparator otherwise orders '@' before '$' (TS uses raw code points: $ < @).
      'perfectionist/sort-imports': [
        'error',
        {
          customGroups: [
            { elementNamePattern: '^\\$', groupName: 'dollar' },
            { elementNamePattern: '^\\.', groupName: 'relative' },
          ],
          groups: ['dollar', 'unknown', 'relative'],
          newlinesBetween: 0,
          type: 'alphabetical',
        },
      ],
      'perfectionist/sort-named-imports': ['error', { groups: ['value-import', 'type-import'], type: 'alphabetical' }],
      // Off: it reorders executable switch cases for cosmetic gain and can break fallthrough semantics
      // (it left a switch here tripping no-fallthrough). Not worth the control-flow risk.
      'perfectionist/sort-switch-case': 'off',
    },
  },
  // eslint-plugin-storybook came with the Storybook install and was never registered, so none of
  // its rules ran. Its story rules only parse CSF `.stories.ts` and every story here is Svelte
  // CSF, which leaves the one check that does apply: an addon listed in main.ts but not installed.
  {
    files: ['.storybook/main.ts'],
    plugins: { storybook },
    rules: { 'storybook/no-uninstalled-addons': 'error' },
  },
)
