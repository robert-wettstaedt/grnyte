# grnyte

## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm

## Commands

- `npm run dev`: serves the app on :3000 (also hosts the Zero get-queries endpoint)
- `npm run check`: svelte-check + tsc. `npm run lint` and `npm run format` for prettier/eslint
- `npm run generate`: regenerate Drizzle + Zero schemas and the GoTrue email templates.
  `npm run migrate` applies migrations
- `npm run check:prod`: assert a deployed environment's signup/mail config (reads only, no writes)
- `npm test`: vitest. `npm run storybook` to eyeball primitives
- `npm run test:e2e`: Playwright. Needs the local Supabase stack, `npm run dev`, `npm run dev:zero`,
  a live `RESEND_API_KEY` and `E2E_PASSWORD` in `.env`; the spec names whatever is missing
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

- Read `CONTEXT.md` before writing user-facing copy, i18n keys, or naming a domain concept. It is short, and it records distinctions the code depends on (a crag is a typed area, `send` is the umbrella over `flash`/`redpoint`/`repeat`).
- Mutations are SvelteKit remote functions (`command` / `authedCommand`), RLS-gated. Never Zero mutators.
- A mutation that acts on an existing row gates through `requireRow` / `requireRowForm` (`$lib/remote/require.server`): they fetch the row and hand it to the permission predicate, so the check's subject is always stored data, never request input. Do not hand-roll `findFirst` + 404 + `can*` in a handler.
- i18n: add keys to BOTH `messages/en.json` and `messages/de.json` (`domain_camelCase`, kept sorted). One prefix per domain: never split singular and plural (`areas_*`, not `area_*` alongside it). No em-dashes anywhere (UI copy, translations, code comments).
- Icons: use `<Icon name="...">`; only `icons.ts` and `Icon.svelte` may import lucide.
- Reuse before building: grep for an existing component/function first. If one fits but is not reusable, refactor it to be reusable and composable rather than hand-rolling a copy. Promote shared pieces to `$lib`. Prefer passing an entity DTO over a long list of individual props.
- Entity modules live in `src/lib/entities/<name>/`, mirroring `area/` as the template.
- An entity's display name comes from its mapper and nowhere else: `routeDisplayName` (`route/mapper.ts`), `blockName` (`block/mapper.ts`). Names are genuinely optional in the DB, so an entity must never render as an empty string; the fallback (`common_unnamed`, `Block <order+1>`) belongs in the mapper so a feed card, a push notification and the screen they link to cannot disagree. Never inline `name ?? ''`, `name || 'Unnamed'` or a second copy of the fallback, on the client or the server.
- Schema changes go through the pipeline: edit `schema.ts`, `generate:drizzle`, append any backfill SQL, `generate:zero`, `migrate`.
- Verify changes by driving the running app, not just typechecking.
- `*-PLAN.md` files are scratch for the agent, not repo documentation: never commit one, and never reference one (or a "Decision N" inside it) from code, comments or JSDoc, because the file is deleted when the feature lands and the reference rots. A decision worth keeping moves into the artifact it governs: a column comment in `schema.ts`, a term in `CONTEXT.md`, a line here.

Project workflow skills in `.claude/skills/`: `scaffold-entity`, `zero-schema-change`, `grnyte-verify`, `add-i18n-keys`, `review-triage`, `run-plan`.

## Worktrees and parallel agents

Several agents often work this repo at once, each in its own worktree, against one shared local dev stack.

- **Commit only your own files.** Never `git add -A`, `git add .` or `git commit -a`: another agent's edits and the user's untracked files live in the same tree. Stage the paths you touched, by name.
- **Never migrate the shared dev DB from a worktree.** Only the main checkout writes it. A worktree that needs a database spins a throwaway one and points `DATABASE_URL` at it: `docker run --rm -d -p <free-port>:5432 -e POSTGRES_PASSWORD=postgres postgres:16`, then `psql -f ci/shim.sql`, `npm run migrate`, `psql -f ci/seed.sql` (the same recipe CI uses, see `.github/workflows/ci.yml`).
- **Coordinate migration numbers.** Two worktrees generating `drizzle/NNNN_*.sql` in parallel collide, and the collision only surfaces at merge. Check what the other branch has generated before running `generate:drizzle`, and renumber on merge rather than shipping two migrations with the same prefix.
- **Say which worktree you are in** when reporting, and don't reach into another one to "fix" what an agent there is mid-way through.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Svelte MCP Tools

### 1. list-sections

Discovers all available documentation sections (titles, use_cases, paths). Use this first for non-trivial Svelte or SvelteKit work to find relevant sections.

### 2. get-documentation

Retrieves full documentation for specific sections. After list-sections, analyze the returned use_cases and fetch ALL sections relevant to the task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions. You MUST use this whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.
