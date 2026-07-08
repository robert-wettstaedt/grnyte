# grnyte

## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm

## Commands

- `npm run dev`: serves the app on :3000 (also hosts the Zero get-queries endpoint)
- `npm run check`: svelte-check + tsc. `npm run lint` and `npm run format` for prettier/eslint
- `npm run generate`: regenerate Drizzle + Zero schemas. `npm run migrate` applies migrations
- `npm test`: vitest. `npm run storybook` to eyeball primitives
- `npm run machine-translate`: fill missing i18n locales from the English source

## Tech Stack

This project uses:

- **Skeleton** (UI toolkit): <https://www.skeleton.dev/llms.txt>
- **Paraglide JS** (i18n): <https://paraglidejs.com/>
- **Zero** by Rocicorp (sync engine): <https://zero.rocicorp.dev/llms.txt>
- **Supabase**: <https://supabase.com/docs>
- **Drizzle ORM**: <https://orm.drizzle.team/docs/overview>
- **SvelteKit**

## Conventions

- Mutations are SvelteKit remote functions (`command` / `authedCommand`), RLS-gated. Never Zero mutators.
- i18n: add keys to BOTH `messages/en.json` and `messages/de.json` (`domain_camelCase`, kept sorted). No em-dashes anywhere (UI copy, translations, code comments).
- Icons: use `<Icon name="...">`; only `icons.ts` and `Icon.svelte` may import lucide.
- Entity modules live in `src/lib/entities/<name>/`, mirroring `area/` as the template.
- Schema changes go through the pipeline: edit `schema.ts`, `generate:drizzle`, append any backfill SQL, `generate:zero`, `migrate`.
- Verify changes by driving the running app, not just typechecking.

Project workflow skills in `.claude/skills/`: `scaffold-entity`, `zero-schema-change`, `grnyte-verify`, `add-i18n-keys`.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Svelte MCP Tools

### 1. list-sections

Discovers all available documentation sections (titles, use_cases, paths). Use this first for non-trivial Svelte or SvelteKit work to find relevant sections.

### 2. get-documentation

Retrieves full documentation for specific sections. After list-sections, analyze the returned use_cases and fetch ALL sections relevant to the task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions. You MUST use this whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.
