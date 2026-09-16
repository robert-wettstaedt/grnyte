# grnyte

## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm

## Commands

- `npm run dev`: serves the app on :3000 (also hosts the Zero get-queries endpoint)
- `npm run check`: svelte-check + tsc. Its `svelte-kit sync` step rewrites `.svelte-kit` under a
  running `npm run dev` and 500s the shared dev server (the sandbox cannot read `.env`, so the
  regenerated env module comes back empty; `$env/static` "has no exported member" is the tell).
  Beside a live server run `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` instead.
  `npm run lint` and `npm run format` for prettier/eslint
- `npm run generate`: regenerate Drizzle + Zero schemas and the GoTrue email templates.
  `npm run migrate` applies migrations
- `npm run check:prod`: assert a deployed environment's signup/mail config (reads only, no writes)
- `npm run secrets:pull`: rewrite `.env` from Bitwarden Secrets Manager, which holds every variable
  for all three environments. `BWS_ACCESS_TOKEN` alone picks the environment. `deployment/SECRETS.md`
  covers the Vercel push, the VPS half and rotation
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

- Read `CONTEXT.md` before writing user-facing copy, i18n keys, or naming a domain concept. It is short, and it records distinctions the code depends on (a sector is a typed area and "crag" is prose only, `send` is the umbrella over `flash`/`redpoint`/`repeat`).
- Mutations are SvelteKit remote functions (`command` / `authedCommand`), RLS-gated. Never Zero mutators.
- A mutation that acts on an existing row gates through `requireRow` / `requireRowForm` (`$lib/remote/require.server`): they fetch the row and hand it to the permission predicate, so the check's subject is always stored data, never request input. Do not hand-roll `findFirst` + 404 + `can*` in a handler. The one exception is a writer of `regions.settings`, which must load its row under a lock `requireRow` cannot express; converting one back silently removes the lock.
- Every write to `regions.settings` goes through `settings.server.ts` and nothing else: it is one
  jsonb blob with two independently edited keys, so every write locks the row, proves the key read
  whole, and merges. Read that module before touching any of it. The one exception is a fixture
  INSERTING a region (`e2e/fixtures.ts`): no other writer exists yet and there is nothing to merge
  with, so locking buys nothing. It types the blob as `RegionSettings` instead, which is the half
  that matters: an `attributions` written as a string where the schema wants `string[]` is dropped
  on read, the form then refuses to seed, and nothing fails until a browser renders it.
- A remote form clears itself after a successful submit, but `<form {...myForm.enhance(cb)}>`
  **replaces** the callback that does it, so `cb` has to clear it, and a surface that reopens rather
  than navigating away clears on open too. Fields live on a module-level singleton outliving the
  component, so whatever you skip leaks into every screen bound to that function. `fields.set({})`
  clears values; only a real DOM reset clears Kit's issues, which is wrong mid-edit because it
  blanks work in progress. `Form.svelte` and `TopoAddRouteModal` say why.
- Every add or edit form on a parameterised route seeds through `seedOnKeyChange`
  (`$lib/forms/seedOnKeyChange.svelte.ts`): `/areas/1/blocks/add` and `/areas/2/blocks/add` are one
  route, so anything seeded once follows the reader to the next entity. Pass the route parameter
  when seeding to blank, the loaded row's id when seeding from data, and gate the key on that data
  having loaded, not on a selection or a count. Child state seeded from props is out of reach: key
  those with `{#key}` on the same id, never `form.for(key)`, which posts the key as an `id` field.
  The module says what a key may and may not be. `{#key}` on the id is still not enough when the
  child seeds from a RELATED row, because "loaded" is not one event: a resource is ready as soon as
  its own row is local, so tags or first ascensionists are still in flight while the id is already
  correct, the key never re-fires, and the form seeds empty. Gate the mount on `isComplete`, latched per id
  because it drops whenever the socket parks (`routes/[id]/edit` is the worked example). It matters
  because `updateRoute` deletes what the submit leaves out, so an unloaded list is silent data loss,
  not a blank field. `e2e/form-seeding.spec.ts` caught it.
- A handler that REPLACES a list or a related row rather than patching it has to prove what it is
  replacing: the form posts a `known` fingerprint of what it loaded, and the handler refuses a
  mismatched submit before its first write. Four handlers are that shape and all four carry it
  (`updateRoute`, `updateBlock`, `saveTopoLines`, `updateRegionMapLayers`). A count is no substitute,
  since a delete plus an add leaves it unchanged. Keep one hash function
  (`$lib/forms/fingerprint.ts`): browser and server must agree byte for byte forever, and a second
  copy is one widened hash away from permanently refusing one entity and nothing else. Two things
  decide whether the guard is real. Measure it over exactly what the handler can DELETE and no more,
  or it refuses saves that took nothing away (paths are deliberately absent from the topo one because `erased()`
  keys on route ids). And capture it where the loaded value stops being observable: the seed for a
  form, the FIRST EDIT for the topo editor, whose committed set is read live. Computed at submit
  time it describes whatever has synced by then, matches itself every time, and protects nothing,
  which no test of the handler can see.
- Code comments are one or two lines: state the non-obvious fact and stop. Neither this repo's
  existing long comments nor this file's prose is a model for source comments. Reasoning worth
  keeping goes here, in `CONTEXT.md`, or as a `schema.ts` column comment. Re-read the comment lines
  you added and cut them before you typecheck, not after being asked.
- i18n: add keys to BOTH `messages/en.json` and `messages/de.json` (`domain_camelCase`, kept sorted). One prefix per domain: never split singular and plural (`areas_*`, not `area_*` alongside it). No em-dashes anywhere (UI copy, translations, code comments).
- Icons: use `<Icon name="...">`; only `icons.ts` and `Icon.svelte` may import lucide.
- Every OpenLayers instance comes from `createBaseMap` (`$lib/map/base.svelte.ts`): never
  `new OlMap` elsewhere, and never restyle `.osm-layer` in a component, those rules live in
  `app.css`. `StaticMap.svelte` is the deliberate exception, drawing raw `<img>` tiles.
  Never hand a region's map layer its `attributions`: OL renders them as HTML and a region admin
  writes them, so that is an XSS against everyone in the region. The credits sheet parses them
  through `$lib/map/attribution` instead, and `base.svelte.test.ts` pins it.
- Conditional UI animates in and out. An element an `{#if}` adds or removes in response to a press
  (a disclosure, a toast, an inline form, a sheet) gets a `svelte/transition`, so it reads as growing
  out of the control that opened it instead of snapping into place. `slide` for a
  disclosure or list row, `fade` for an overlay or a swap in place, `scale` for a small badge, `fly`
  for something arriving from an edge. 150ms unless a neighbour already picked another, and always
  gated on reduced motion, which a Svelte transition ignores on its own:
  `const still = new MediaQuery('(prefers-reduced-motion: reduce)')` (from `svelte/reactivity`) plus
  `const duration = $derived(still.current ? 0 : 150)`, then `transition:slide={{ duration }}`.
  `EventCard.svelte` is the shortest example.
  A Tailwind `transition-*` class is no substitute: it cannot animate an element that does not exist
  yet, so it stays on hover, focus and state changes of things already mounted.
- Reuse before building: grep for an existing component/function first. If one fits but is not reusable, refactor it to be reusable and composable rather than hand-rolling a copy. Promote shared pieces to `$lib`. Prefer passing an entity DTO over a long list of individual props.
- Entity modules live in `src/lib/entities/<name>/`, mirroring `area/` as the template.
- An entity's display name comes from its mapper and nowhere else, and that is a TYPE:
  `entities/displayName.ts` brands `DisplayName`, so a list item's `name` will not take a plain
  string. Most entities call `toDisplayName`; one earns its own helper only by answering differently
  (`blockName` falls back to "Block 3"). Names are optional in the DB, so an entity must never render as an
  empty string: keep the fallback in the mapper, never inline `name ?? ''` or `name || 'Unnamed'`,
  on the client or the server. Pass `locale` on the
  server, and build fixture names through the helpers too.
- Block ordering is stated once in `block/order.ts` (inside an area by slot, across areas by name),
  with the drizzle half in `order.server.ts` under a deliberately different export name. Read
  `order.ts` before changing either half; it carries the reasoning, and this file will not repeat it.
- Check a value at its point of use, not a re-derivation of it. A guard that calls the builder
  again pins different values than the comparison reads; a comment saying a type is `any` is not
  the type; a test exercising the helper does not show the call site still calls it. The failure is
  a sound method aimed one level off the thing that runs, which never feels like carelessness at
  the time, so green means nothing until the probe is shown to have reached the code. It applies to
  prose: a count written into a comment is a re-derivation, so name the thing rather than count it.
- Schema changes go through the pipeline: edit `schema.ts`, `generate:drizzle`, append any backfill SQL, `generate:zero`, `migrate`.
- `auth.users` and `public.users` are both `users` to drizzle, so a query joining them needs
  `alias(authUsers, 'auth_user')` from `drizzle-orm/pg-core`. Without it nothing catches it first: it typechecks, it lints, no
  test covers a handler needing both tables, and it throws `42P09 table reference "users" is
ambiguous` the first time a person triggers it. Has bitten
  twice. Reach for the alias whenever a query wants an address or login record alongside a profile;
  `adminRecipients.server.ts` is the shortest correct example.
- A deploy is not atomic on the client: the server updates instantly, the service worker within the hour, and an open document only when it reloads. Three things break already-loaded tabs across that gap, all of them silently, with no build or type error:
  - **Moving a `.remote.ts` file or renaming an exported remote function.** The endpoint id is `hash(module path) + '/' + exportName`, a path hash, so any move 404s every call an open tab makes. Reorganising entity modules is the usual way to trip this. `src/lib/state/serviceWorker.ts` gets stale tabs reloaded eventually, but not instantly.
  - **Changing `manifest.id` in `vite.config.ts`.** It is pinned to `/` (1.0's `start_url`, frozen as an identifier) and must never move: an id a browser does not recognise is a different application, so every installed home-screen app is orphaned beside a new one. Because it is pinned, `start_url` itself is free to change.
  - **Deleting or reshaping a route.** Bookmarks, shared links, push targets and history live outside the database and cannot be migrated. Prefer id-based URLs (`/routes/<id>`); they cost nothing to keep forever, while a slug-based one dies with the column it resolved against.
- Verify changes by driving the running app, not just typechecking. Drive a UI change at BOTH
  375x667 and 1280x800: an interaction gated on hover (which a touch device never gets) and a
  composition that only reads with all of it on screen are one-size defects, and neither typechecks.
- A new test is not evidence until it has been seen red. Name the one production edit that should
  break it, make that edit, run it, revert. Vacuity usually sits in the FIXTURE, not the assertion
  (two entities identical in the dimension asserted on, a value truthy on both branches). Grep the
  mutated text first: a mutation that never applied looks exactly like one that was not caught.
  `npm run test:mutation -- --mutate <file>` does the same thing mechanically for every edit at
  once, which is worth it on a module you are about to trust; without arguments it runs the
  configured scope, and `test:mutation:server -- <file>` the DB-backed half, which takes a target
  rather than defaulting to one (needs docker, one throwaway Postgres per worker). Both configs and
  the runner live in `stryker/`, so a bare `npx stryker run` finds nothing.
  Aim it at a module whose contract is written down, read every survivor, and expect a third of them
  to be equivalent mutants. The score is not the output, the survivor list is; never track it.
- Answering clarification or grilling questions is not a go-ahead. After a planning round, write the
  plan down and stop. Start on an explicit instruction ("start", "do #1-#3"), not on "ok" or "yes".
- Before handing back, over the paths you touched and nothing else: `npx prettier --write`,
  `npx eslint`, `npx vitest run --project server` for `*.server.test.ts` and `*.remote.test.ts` or
  `--project browser` for the rest, then typecheck (see `npm run check` above).
- Run `npm run lint:duplication` and `npm run lint:unused` BEFORE handing work back: both are in CI,
  so a late miss still costs you the cheap moment to reuse something. jscpd fails only on clones
  absent from `.jscpd-baseline.json` and marks them `[NEW]`; if a new one is deliberate, say so and
  run `npm run lint:duplication:accept` to rewrite the baseline. It is fingerprint-based, so moving
  existing duplicated code also reads as new.
- Browser floor: `vite.config.ts` pins `build.target`; check a feature against that pinned list, never
  against "Baseline Widely" in the abstract. Unpinned it inherits Vite's `baseline-widely-available`
  default, which is Baseline Widely as of a date frozen per Vite major, so the floor drifts on an
  upgrade.
  The target lowers syntax and never polyfills, which decides how a feature may be adopted: a
  missing CSS feature degrades (`@supports` is enough), while a missing JS built-in
  (`Object.groupBy`, `Set.prototype.union`, `Intl.DurationFormat`) is a `TypeError` on a user's
  phone with no build error. Guard those with a feature check and a fallback, or do not use them.
  Raising the floor was measured and moves zero JS bytes, so raise it only as a product decision
  about which devices to stop serving, never to save bytes, and never to `safari17.5`, where lightningcss stops lowering
  `light-dark()` and Skeleton's palette breaks for Safari 16.4 to 17.4. The pin does not reach
  pre-bundled `node_modules` deps or `src/sw.ts`, which Kit builds with `configFile: false`.
- Server runtime: `engines.node` mirrors the newest runtime Vercel Functions offers, not a
  preference; raising it past that fails the build. Kit compiles SSR at `node18.13`, which restricts
  syntax only and never removes a built-in, so `*.server.ts`, `+server.ts` and `*.remote.ts` may use
  current-Node built-ins freely. The trap is the other direction: anything under `src/lib/` a client
  component can reach inherits the browser floor above.
- `*-PLAN.md` files are scratch for the agent, not repo documentation: never commit one, and never reference one (or a "Decision N" inside it) from code, comments or JSDoc, because the file is deleted when the feature lands and the reference rots. A decision worth keeping moves into the artifact it governs: a column comment in `schema.ts`, a term in `CONTEXT.md`, a line here.

Project workflow skills live in `.claude/skills/`; prefer them over generic equivalents. Their names are not listed here: the harness already injects the list, and a hand-copied one goes stale.

## Worktrees and parallel agents

Several agents often work this repo at once, each in its own worktree, against one shared local dev stack.

- **Commit only your own files.** Never `git add -A`, `git add .` or `git commit -a`: another agent's edits and the user's untracked files live in the same tree. Stage the paths you touched, by name.
- **Never migrate the shared dev DB from a worktree.** Only the main checkout writes it. A worktree that needs a database spins a throwaway one and points `DATABASE_URL` at it: `docker run --rm -d -p <free-port>:5432 -e POSTGRES_PASSWORD=postgres postgres:16`, then `psql -f ci/shim.sql`, `npm run migrate`, `psql -f ci/seed.sql` (the same recipe CI uses, see `.github/workflows/ci.yml`).
- **Coordinate migration numbers.** Two worktrees generating `drizzle/NNNN_*.sql` in parallel collide, and the collision only surfaces at merge. Check what the other branch has generated before running `generate:drizzle`, and renumber on merge rather than shipping two migrations with the same prefix.
- **Say which worktree you are in and your own `ListAgents` name** when reporting, unprompted, so a
  relay can be wired without asking. Don't reach into another worktree to "fix" what an agent there
  is mid-way through.
- **Sessions often share the one main checkout**, not a worktree each, and a peer applies fixes while
  your review runs. Review the COMMITTED state: pin `git rev-parse HEAD` plus `git status --short`
  at the start and read files with `git show <rev>:<path>`. A peer describing code you cannot find is
  usually a version gap, not a misreading.
- **Relay findings in full, never a summary.** `SendMessage` the named agent every finding with its
  `file:line` and failure case, numbered so the user can answer per item, and pin the HEAD and
  `git status --short` you reviewed beside them.
- **A review fanned out to two sessions is one round.** Wait until every reviewer has reported before
  applying anything, and touch no tracked file until they all have: an edit under an in-flight
  reviewer forces a reconcile and costs the round. Then merge, dedupe, fix, and request again.
- **Squash a review round's fixes into the commit they fix**, don't stack fix-of-fix commits.
- **The browser is exclusive.** One Chrome profile serves every session, so close the pages you
  opened before handing back and say "browser is free" in the message you relay. A "wedged" browser
  is usually a leaked session, a peer's or your own. If you could not drive, report the finding as
  read rather than driven.
- **Subagent fan-out spends a usage window shared with every other agent on this machine.** Keep it
  narrow, and delegate through `/efficient-frontier` rather than doing broad analysis inline.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Svelte MCP Tools

### 1. list-sections

Discovers all available documentation sections (titles, use_cases, paths). Use this first for non-trivial Svelte or SvelteKit work to find relevant sections.

### 2. get-documentation

Retrieves full documentation for specific sections. After list-sections, analyze the returned use_cases and fetch ALL sections relevant to the task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions. You MUST use this whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.
