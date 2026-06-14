import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import drizzle from 'eslint-plugin-drizzle'
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
  prettier,
  svelte.configs.prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
      // see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
      'no-undef': 'off',
      // Prefer the '$lib' alias over relative paths that climb into the lib folder.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(\\.\\./)+lib/',
              message: "Use the '$lib' alias instead of a relative path into the lib folder.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
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
          selector: 'ExportAllDeclaration',
          message: "Avoid barrel files: don't re-export a folder's modules from index.ts. Import the modules directly.",
        },
        {
          selector: 'ExportNamedDeclaration[source]',
          message: "Avoid barrel files: don't re-export a folder's modules from index.ts. Import the modules directly.",
        },
      ],
    },
  },
  {
    // Override or add rule settings here, such as:
    // 'svelte/button-has-type': 'error'
    rules: {},
  },
)
