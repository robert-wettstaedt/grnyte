# grnyte

TypeScript, npm. SvelteKit, Skeleton (<https://www.skeleton.dev/llms.txt>), Paraglide JS (i18n),
Zero sync (<https://zero.rocicorp.dev/llms.txt>), Supabase, Drizzle ORM.

## Commands

- `npm run dev`: app on :3000 (also hosts the Zero get-queries endpoint)
- `npm run check`: svelte-check + tsc. Its `svelte-kit sync` 500s a running dev server (the sandbox
  cannot read `.env`; tell: `$env/static` "has no exported member"). Beside a live server run
  `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` instead. `npm run lint`, `npm run format`
- `npm run generate`: Drizzle, Zero and PowerSync schemas and GoTrue email templates. `npm run migrate` applies migrations
- `npm run check:prod`: assert a deployed env's signup/mail config (read-only)
- `npm run secrets:pull`: rewrite `.env` from Bitwarden Secrets Manager; `BWS_ACCESS_TOKEN` picks the
  environment. `deployment/SECRETS.md` covers Vercel, the VPS and rotation
- `npm test`: vitest. `npm run storybook` for primitives
- `npm run test:e2e`: Playwright. Needs local Supabase, `npm run dev`, `npm run dev:zero`, a live
  `RESEND_API_KEY` and `E2E_PASSWORD` in `.env`; the spec names whatever is missing
- `npm run machine-translate`: fill missing locales from English

## Conventions

- Read `CONTEXT.md` before writing user-facing copy, i18n keys, or naming a domain concept (a sector
  is a typed area and "crag" is prose only; `send` covers `flash`/`redpoint`/`repeat`).
- Writes are Zero custom mutators: client def in `<entity>/mutators.ts`, server def in
  `<entity>/mutators.server.ts`, aggregated in `$lib/zero/mutators*.ts`. The server def wraps a
  handler from `<entity>/*.server.ts` in `asCaller` (RLS), or `asPrivileged` only where the body
  used `pinnedTx` or a merge repoints other people's rows after caller-run gates; `gates.test.ts`
  holds both to a named gate. Toggles write optimistically (a toggle on a synced row shows its tap
  through `createWanted`, `$lib/state/wanted.svelte`, so the PowerSync build keeps it); forms,
  creates and deletes await `.server` (ids are serial). Remote functions remain for auth/account, upload steps,
  `sendTestPush`, `replyToFeedback` and remote reads; every new server-owned auth step also gets an
  `/api/app/v1/` endpoint through `appEndpoint`, over the same handler body. Components write
  through the entity's `writes.ts`, never `mutators` or `write` directly. In the PowerSync build `write()`
  posts to `/api/sync/mutate`, outside Zero's push processor (no `tx.retryOn`); a write id makes a resend apply once.
- A mutation on an existing row gates through `requireRow` / `requireRowForm`
  (`$lib/remote/require.server`), so the permission check sees stored data, never request input.
  Never hand-roll `findFirst` + 404 + `can*`. Exception: writers of `regions.settings`, which need a lock.
- Every write to `regions.settings` goes through `entities/region/settings.server.ts` (locks, proves
  the key read whole, merges). Read it first. Only `e2e/fixtures.ts` inserting a region skips it,
  typing the blob as `RegionSettings` (a mistyped `attributions` is silently dropped on read).
- Form fields live in a per-mount `createFormStore` (`$lib/forms/store.svelte`). Only auth pages,
  invite accept and sign-out use Kit remote forms.
- Add/edit forms on a parameterised route seed per entity (`/areas/1/blocks/add` and
  `/areas/2/blocks/add` are one route). Wait on rows through `Form`'s (or `FormGate`'s) `waitFor` +
  `seed`; `initial` when nothing to wait for. A form seeding from RELATED rows (tags, first
  ascensionists, a pin) marks the wait `whole: true`: relations arrive after the row, and
  `updateRoute` deletes what the submit omits, so an unloaded list is data loss
  (`routes/[id]/edit`, `e2e/form-seeding.spec.ts`). Outside a gate use `seedOnKeyChange`
  (`$lib/forms/seed.svelte.ts`).
- A handler that REPLACES a list or related row requires a `known` fingerprint of what the form
  loaded and refuses a mismatch before its first write (`updateRoute`, `updateBlock`,
  `saveTopoLines`, `updateRegionMapLayers`). One hash function only (`$lib/forms/fingerprint.ts`),
  never a count. Measure exactly what the handler can DELETE (topo omits paths: `erased()` keys on
  route ids). Capture it where the loaded value stops being observable: the seed for a form, the
  FIRST EDIT for the topo editor. Computed at submit time it protects nothing.
- Code comments are one or two lines: the non-obvious fact, then stop. Existing long comments are
  not a model. Reasoning goes here, in `CONTEXT.md`, or a `schema.ts` column comment.
- i18n: keys in BOTH `messages/en.json` and `messages/de.json` (`domain_camelCase`, sorted), one
  prefix per domain (`areas_*`, never `area_*` beside it). No em-dashes anywhere.
- Icons: `<Icon name="...">`; only `icons.ts` and `Icon.svelte` import lucide.
- An entity detail URL used as a VALUE (`redirectTo`, `cancelTo`, `back()`/`exit()`/`push()`, an
  href prop) comes from `entityHref(kind, id)` (`$lib/entities/href`). An `<a href>` that
  `svelte/no-navigation-without-resolve` can trace keeps its literal `resolve()`, as do routes
  without params (`/settings`, `/explore`, `/legal/*`). Both spellings coexist on purpose.
- Scroll containers come from `$lib/state/scroll`: `createScrollSurface()` on the layout's `<main>`
  (re-exported as `snapshot`), or `resetOnNavigate` for surfaces without a history entry (explore
  sheet and panel). The PATHNAME decides reset vs keep. Forwarding to a canonical URL uses
  `redirectTo`. Sheets reset, never restore.
- Every OpenLayers map comes from `createBaseMap` (`$lib/map/base.svelte.ts`); `.osm-layer` styles
  live only in `app.css`. `StaticMap.svelte` is the exception. Never pass a region's
  `attributions` to an OL layer (admin-written HTML, so XSS); `$lib/map/attribution` parses them.
- Conditional UI an `{#if}` toggles on a press gets a `svelte/transition`: `slide` disclosure or
  row, `fade` overlay or swap, `scale` badge, `fly` from an edge. 150ms unless a neighbour differs,
  duration always from `motion(base)` (`$lib/state/motion.svelte`), `prefersStill()` to skip.
  Never build your own media query. Tailwind `transition-*` only for already-mounted elements.
  Example: `EventCard.svelte`.
- A section backed by a non-primary query decides its space before it loads: known from on-screen
  data, reserve exactly that or render nothing; unknown with an empty state, always render it;
  unknown without one, place it low. Never insert above rendered content or collapse reserved
  space. Skeletons wait ~250 ms
  (`openspec/changes/archive/2026-10-08-zero-latency-and-loading-states/design.md`).
- Collection summaries (counts, charts, "n of N", sibling nav) read `summaryOf(phase, value)`
  (`$lib/zero/resource.svelte`), never `phase.kind === 'answered'`, which is for absence claims,
  form seeds and action gates. No component draws its own syncing pill: use
  `createPillSurface` / `pillSurface().offer` (`$lib/state/pill.svelte`); incidental lookups use `quietly`.
- Page chrome renders in every state: `PageHeader` and the width container sit outside
  `QueryState`. Form screens get this from `Form`'s `waitFor`; one seeding at mount outside `Form`
  (`BlockForm`) is wrapped in `FormGate` by its caller.
- A nested `Modal` must not unmount its opener in the same flush (zag throws, the app stays
  `aria-hidden`): close, `await tick()`, then unmount (`topos/edit`'s `addRouteLine`).
  `Modal.svelte` closes itself in `beforeNavigate` on a PATHNAME change only. Desktop-only
  (`panel` + `backdrop={true}`); neither 375px nor jsdom can show it.
- Reuse before building: grep first; refactor a near fit into `$lib` instead of copying. Prefer an
  entity DTO prop over many props. Entity modules live in `src/lib/entities/<name>/`, `area/` as template.
- Display names come from the mapper only, typed as branded `DisplayName`
  (`entities/displayName.ts`): `toDisplayName`, or an own helper only if it answers differently
  (`blockName`). Never inline `name ?? ''`; pass `locale` on the server; fixtures use the helpers.
- Block ordering lives in `block/order.ts` and `order.server.ts`. Read `order.ts` before changing either.
- Check a value at its point of use, not a re-derivation of it: green means nothing until the probe
  is shown to reach the code that runs. In prose too: name the thing, don't count it.
- Schema changes: edit `schema.ts`, `generate:drizzle`, append backfill SQL, `generate:zero`, `generate:powersync`,
  `migrate`.
- Joining `auth.users` and `public.users` needs `alias(authUsers, 'auth_user')`
  (`drizzle-orm/pg-core`), or it throws `42P09` at runtime with nothing catching it earlier
  (`adminRecipients.server.ts`).
- Deploys are not atomic for open tabs. These break them silently:
  - Moving a `.remote.ts` file or renaming a remote export (the endpoint id hashes the path).
  - Changing `manifest.id` in `vite.config.ts` (pinned to `/`; changing it orphans installed apps).
  - Renaming a mutator or narrowing its args: args only widen within a release, removed
    remotes/mutators stay one more release. Deploy zero-cache, then the app.
  - Deleting or reshaping a route. Prefer id-based URLs.
  - Narrowing an `/api/app/v1/*` request or response: shapes only widen, a narrowing ships as a new
    version prefix. The only exceptions are the three fixed answers `refused_for_security`,
    `app_update_required` and `api_version_retired`. Every app build sends `X-App-Version`, a
    compatibility lever under `APP_MIN_VERSION`, never a security control.
    `src/lib/auth/app/v1.contract.json` and its test hold the shapes.
- Verify by driving the running app at BOTH 375x667 and 1280x800, not just typechecking.
- A new test is evidence only once seen red: make the one production edit that should break it, run,
  revert. Check the fixture for vacuity, and grep that the mutation applied. `npm run test:mutation
-- --mutate <file>` (`test:mutation:server` for DB tests) does it mechanically; read
  `stryker/README.md` first. The survivor list is the output.
- Answering clarification or grilling questions is not a go-ahead. Write the plan and stop until an
  explicit "start" / "do #1-#3".
- Two sync engines, one per build (`PUBLIC_SYNC_ENGINE`, see CONTEXT.md "engine seam"). A module that differs per
  engine gets a `*.powersync.*` twin, listed in `src/lib/powersync/twins.ts`; PowerSync code imports twins by
  that path. A change to a read or a write is checked on both builds before merging; e2e and drives run on the
  Zero build, and the PowerSync build locally with `PUBLIC_SYNC_ENGINE=powersync`. There a read without a twin is a
  server read (`readQuery`), not live. `ZERO_CLIENT_IMPORTERS` (`vite.sync-engine.ts`) only shrinks.
- Before handing back, over your paths only: `npx prettier --write`, `npx eslint`,
  `npx vitest run --project server` (`*.server.test.ts`, `*.remote.test.ts`) or `--project browser`,
  then typecheck. Tests that count rows across a whole table run alone in `--project server-serial`
  (`SERIAL_TESTS` in `vite.config.ts`); a new such test goes there.
- Also run `npm run lint:unused`, `lint:duplication`, `lint:health` (fallow, in CI). `lint:unused`
  has no baseline. The other two baselines only shrink: `npm run lint:baseline` removes stale
  entries, never accepts new ones. A deliberate finding gets
  `// fallow-ignore-next-line <kind> -- <reason>`, as do Svelte template reads fallow misses.
- Browser floor: check features against `build.target` pinned in `vite.config.ts`. It lowers syntax
  but never polyfills, so a missing JS built-in (`Object.groupBy`, `Set.prototype.union`) needs a
  feature check and fallback. Raise the floor only as a product decision, never to `safari17.5`
  (breaks Skeleton's `light-dark()`). The pin skips pre-bundled deps and `src/sw.ts`.
- Server runtime: `engines.node` mirrors Vercel's newest runtime. Server files may use current-Node
  built-ins; anything under `src/lib/` a client can reach inherits the browser floor.
- `*-PLAN.md` files are agent scratch: never commit or reference one (nor a "Decision N" in it).
  Durable decisions go into `schema.ts`, `CONTEXT.md` or here.

Project workflow skills live in `.claude/skills/`; prefer them over generic ones.

## Worktrees and parallel agents

Several agents share this repo and one local dev stack.

- **Commit only your own files**, staged by name. Never `git add -A`, `git add .`, `git commit -a`.
- **Never migrate the shared dev DB from a worktree.** Use a throwaway Postgres on a free port with
  `ci/shim.sql`, `npm run migrate`, `ci/seed.sql` (the CI recipe, `.github/workflows/ci.yml`):
  `ci/local.sh up`, then `ci/local.sh test <files>`, then `ci/local.sh down`.
- **Coordinate migration numbers** across branches before `generate:drizzle`; renumber on merge.
- **Report your worktree and `ListAgents` name** unprompted. Don't edit another agent's worktree.
- **Review the COMMITTED state** in a shared checkout: pin `git rev-parse HEAD` and
  `git status --short`, read with `git show <rev>:<path>`.
- **Relay findings in full**: every finding with `file:line` and failure case, numbered, with the
  pinned HEAD and status.
- **Review loops run through `/review-loop`**; offer it after non-trivial work. A review fanned to
  several sessions is one round: touch no tracked file until all have reported. Squash fixes into
  the commit they fix.
- **The browser is exclusive**: close your pages and say "browser is free". If you could not drive,
  report a finding as read, not driven.
- **Subagent fan-out shares the usage window**: keep it narrow, delegate via `/efficient-frontier`.
- **Start roadmap work with `/start-issue <n>`** from the main checkout: it links the change to its
  issue (`x-issue`), whose comment then shows the change's open tasks (`scripts/issue-sync/README.md`).
- **Record found work before acting on it**: in scope, under `## Discovered` in `tasks.md`, marked
  `[blocks-PR]`, `[later] #n` or `[you]`; out of scope, `npm run issues:followup`, never `gh issue create`.
- **Stay inside the change's `x-paths`**; widen them in `.openspec.yaml` first. `npm run issues:gate -- <change>`
  decides when a pull request may open.
- **Nothing personal or environment-specific in anything written** (specs, tasks, comments, commits,
  issues): no names, hostnames, local paths, addresses or keys. Task text becomes public on its issue.

---

Use the Svelte MCP server for non-trivial Svelte 5 / SvelteKit work, and run `svelte-autofixer` on
Svelte code you write.
