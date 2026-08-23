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

/**
 * no-drizzle-mass-assignment
 *
 * Spreading a payload into a write means the columns that move are whichever ones the caller chose
 * to send, and the columns a schema carries are not the columns a given handler may change. Zod
 * validates the SHAPE of each field, never whether this caller may touch it, and the permission gate
 * runs against the STORED row, so nothing compares the two.
 *
 * `updateArea` is the worked example. `areaActionSchema` is shared with `createArea`, so it carries
 * `regionFk` and `parentFk` as well as the two fields an edit means, and `.set({ ...value })` wrote
 * all four: a plain rename could move an area and its whole subtree into another region, long after
 * `requireEditableArea` had passed on the old row. No policy covered `parentFk` at all.
 *
 * So name the columns. It is longer, and it is the only form where reading the line tells you what
 * the statement can do. `src/lib/entities/area/areas.remote.test.ts` is the proof.
 *
 * DESCENDANT selectors, not direct children, so the array and mapped forms are covered too:
 * `.values([{ ...v }])` and `.values(list.map((v) => ({ ...v })))` are the same bug written with one
 * more layer. And a bare identifier argument is flagged on its own, because there the columns are
 * not visible at the call site at all: on all three writes, not just `.set(payload)`, since
 * `.values(payload)` and `onConflictDoUpdate({ set: payload })` hand over exactly the same thing.
 *
 * Spreading the result of a CALL stays legal: that value was built here rather than handed over,
 * which is why `:matches(Identifier, MemberExpression)` and not a bare `SpreadElement`.
 *
 * Exported as a shared const because flat config REPLACES a rule's options rather than merging them:
 * any later block that also sets `no-restricted-syntax` (the barrel-file one does) silently turns
 * these off for the files it matches unless it spreads them back in.
 */
const noDrizzleMassAssignment = [
  {
    message:
      'Do not spread a value into a drizzle update. Name the columns this handler may change (no-drizzle-mass-assignment).',
    selector:
      "CallExpression[callee.property.name='set'][callee.object.callee.property.name='update'] ObjectExpression > SpreadElement > :matches(Identifier, MemberExpression)",
  },
  {
    message:
      'Do not spread a value into a drizzle insert. Name the columns this handler may write (no-drizzle-mass-assignment).',
    selector:
      "CallExpression[callee.property.name='values'][callee.object.callee.property.name='insert'] ObjectExpression > SpreadElement > :matches(Identifier, MemberExpression)",
  },
  {
    message:
      'Do not spread a value into an upsert. Name the columns the conflict path may change (no-drizzle-mass-assignment).',
    selector:
      "CallExpression[callee.property.name='onConflictDoUpdate'] ObjectExpression > SpreadElement > :matches(Identifier, MemberExpression)",
  },
  {
    message:
      'Pass an object literal naming the columns, not a prebuilt value: the columns this write can move must be readable at the call site (no-drizzle-mass-assignment).',
    // Anchored on `arguments.0`, not a child selector: a CallExpression's direct children include
    // its own callee, so `> MemberExpression` matches `db.update(x).set` itself on every call.
    selector:
      "CallExpression[callee.property.name='set'][callee.object.callee.property.name='update'][arguments.0.type='Identifier']",
  },
  {
    message:
      'Pass an object literal naming the columns, not a prebuilt value: the columns this write can move must be readable at the call site (no-drizzle-mass-assignment).',
    selector:
      "CallExpression[callee.property.name='values'][callee.object.callee.property.name='insert'][arguments.0.type='Identifier']",
  },
  {
    message:
      'Pass an object literal naming the columns, not a prebuilt value: the columns the conflict path can move must be readable at the call site (no-drizzle-mass-assignment).',
    // `[value.type=...]`, because `Property > Identifier` also matches the key `set` itself.
    selector:
      "CallExpression[callee.property.name='onConflictDoUpdate'] ObjectExpression > Property[key.name='set'][value.type=/^(Identifier|MemberExpression)$/]",
  },
]

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
        // Pin the root so a nested worktree (.claude/worktrees/*) isn't a second candidate.
        tsconfigRootDir: import.meta.dirname,
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
    rules: {
      'no-restricted-syntax': ['error', ...noDrizzleMassAssignment],
    },
  },
  {
    // Avoid barrel files: index.ts that re-exports a folder's modules.
    files: ['**/index.ts'],
    rules: {
      // The mass-assignment selectors come along, because flat config replaces this rule's options
      // wholesale rather than merging them: without them an `index.ts` could mass-assign and lint
      // clean, which is exactly the file a shared helper ends up in.
      'no-restricted-syntax': [
        'error',
        ...noDrizzleMassAssignment,
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
