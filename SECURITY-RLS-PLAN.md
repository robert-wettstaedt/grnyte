# RLS keeps the region, the app keeps everything else

**Status: app-code half shipped on `feature/events-rls-v2`, six commits, green. The migration half is
written but not landed, waiting on `feature/events` to stop moving.**

This replaces an earlier plan on the abandoned `feature/events-rls` branch, which tried to make RLS
express attribution as well as tenancy: bind every write policy to its author, add triggers to pin
columns a policy cannot name, split the write role. That work was correct and is not what shipped.
What changed is the premise it rested on.

## The decision

RLS in this project answers one question: **may this caller touch a row belonging to this region.**
It was built for that in 1.0, when every read and write went through drizzle. Everything else the
attribution branch was teaching it to say (whose name is on the row, which column may move, whether
the thing a row points at lives in the same region) moves into application code.

Three facts make that defensible, and all three were verified rather than assumed:

1. **The Supabase Data API is off.** With `/rest/v1` and `/graphql/v1` closed and Realtime disabled,
   no browser can reach Postgres except through this app's own endpoints. The codebase has 17
   `supabase.auth` call sites and 3 `supabase.storage`, and **zero** `supabase.from()`, `.rpc()` or
   `.channel()`, so nothing is lost by closing it.
2. **Zero never used RLS anyway.** `zero-cache` builds its own replica and evaluates queries against
   it; the read path is `src/routes/api/zero/get-queries/+server.ts` on the privileged handle, with
   scoping in `src/lib/zero/permissions.ts`. Rocicorp state the position outright: "Zero does not
   have (or need) a first-class permission system like RLS."
3. **The policies were never the only gate anyway.** Every `authedCommand` already runs inside
   `createDrizzleSupabaseClient`, so the policies evaluate on this app's own statements. Removing a
   caller from PostgREST does not remove the enforcement layer; it just makes clear that the
   enforcement layer only ever had one client.

### The argument against, recorded because it is the real cost

A policy is unforgettable. It applies to a handler written next month by someone who never read this
document. An application check has to be remembered. That is a genuine loss and the two rails below
exist to replace as much of it as can be replaced.

The argument for is that a control the team cannot read is not a control. The abandoned branch is the
evidence: six review rounds, and it still shipped a tautology (`EXISTS (SELECT authorize_in_region(...))`
is unconditionally true, so seven tables had no region check at all) that nobody caught by reading.

## What is NOT negotiable, whichever way this goes

These are bugs or data-integrity problems, not access-control preferences. All are fixed here.

- The `EXISTS (SELECT ...)` tautology. A wrong boolean in committed SQL.
- The claims interpolation in `createDrizzle`. `user_metadata` is attacker-writable through GoTrue,
  which keeps serving with the Data API off, and it was being pasted into a single-quoted literal on
  the connection holding every write privilege.
- The favorites polymorphic-to-foreign-key reshape, its dedupe, and its unique indexes.
- The `user_settings` split-brain repair and its unique index.

## What shipped

Six commits on `feature/events-rls-v2`, cut from `feature/events` at `ce26c3d4`.

| Commit     | What                                                                                |
| ---------- | ----------------------------------------------------------------------------------- |
| `bd66ca79` | Vitest project split, so remote handlers are testable at all, plus `testHarness.ts` |
| `e15fd54b` | `no-drizzle-mass-assignment` lint rule                                              |
| `a584f180` | Each handler writes only the columns it owns, and scopes its own statements         |
| `de95bebc` | The reads and writes only RLS was protecting now gate themselves                    |
| `a84af2b7` | `gates.test.ts`: every handler names a gate or a written reason                     |
| `ba69b8b5` | A topo may only point at its own block's image                                      |

### The twelve gaps

Each is a handler that was relying on a policy to narrow it, with a test that went red first.

`updateArea` (a rename could move an area and its subtree to another region), `softRestoreArea` and
`softRestoreBlock` (three UPDATEs keyed on a client-supplied timestamp and nothing else, while the
permission check ran on an unrelated id), `reassignActivityEntity` (no region predicate at all),
`deleteActivity` (a `Partial` filter, so it constrained only what a caller bothered to spell),
`subscribeToPush`, `toggleFavorite`, `listRegionInvitations`, `regionTagUsage`,
`userContributionCount`, `/image`, and `createTopo`/`replaceTopoImage`/`deleteTopo`.

Found while fixing, beyond the original list: `setBlockLocation` took unbounded coordinates and is a
live command rather than an undo path; `restoreArea` could mint a `type: 'crag'` row that `createArea`
refuses and `canAddParking` accepts; `hardRestoreBlock` trusted the snapshot's region over the
authorized one; `updateArea`'s `parentFk` was unguarded and **no policy has ever read that column**,
so cross-region reparenting was open regardless of any of this.

### The two rails, and what they cannot do

**`no-drizzle-mass-assignment`** (`eslint.config.js`) bans spreading a payload into a drizzle write.
The columns a schema carries are not the columns a handler may change, and zod validates the shape of
each field, never whether this caller may touch it.

**`gates.test.ts`** parses every `*.remote.ts` and requires each export to name a permission gate or
carry a written reason. Filling its registry was the audit: of 35 handlers naming no gate, 12 reach
one through another module, 20 are gate-free by design, and 3 were real findings.

Neither catches a gate that checks the wrong thing. `updateArea` called `requireEditableArea`
throughout the entire period it was broken. Only a test that drives the handler covers that, which is
what the Vitest split exists for.

## What is still to come

The migration chain is designed and proven from empty, but not landed: `feature/events` has three
more migrations coming (watermarks moving from activity ids to event ids, the notifications reshape,
and dropping `activities`), and two of those touch tables the policy migration also modifies. Landing
mine first would mean reconciling twice.

Intended contents, numbering to be assigned against whatever tip `feature/events` settles at:

1. **favorites**, polymorphic pair to three foreign keys, with the dedupe and partial unique indexes.
2. **region policies**: the tautology fix, the `user_settings` repair and unique index, the
   unused-policy sweep, the `region_members` identity binding, the restrictive `regions` insert deny.
   Explicitly NOT included: the four trigger functions and the attribution bindings.
3. **`app_writer`**, the role split and its grants.
4. **The data API closure**, `REVOKE SELECT` from `authenticated` and `anon`, so "the Data API is off"
   becomes a versioned, testable fact rather than a dashboard toggle nobody can review.

Also owed: `files_path_idx`, which `schema.ts` declares with no migration behind it. `/image` is now
the only gate on that route and it reads by `path`, a column with no index, on every thumbnail.

## Accepted regressions

Written down because they are the deal, not oversights.

- **`region.read can update routes` grants UPDATE on every column of `routes`.** It exists so logging
  an ascent can fold a grade in, and a policy cannot name a column. `canEditRoute` is now the only
  thing between a reader and a route's name or description.
- **Attribution columns are mutable at the database level.** `created_by`, `user_fk`, `auth_user_fk`,
  `actor_fk` and the invitation identity columns. No handler writes them from client input, and the
  lint rule is what keeps that true.
- **`users.user_settings_fk` is unvalidated.** `users can update own users` compares `auth_user_fk`
  and nothing else, so the column may point at another person's settings row. Latent rather than
  live: no reachable path writes it from a request.

## Open

- **Browser verification.** None of the twelve fixes has been driven in a real browser. The worktree
  is isolated from the dev database by design, so this needs one session in the main checkout.
- **`deleteActivity`'s shelf life.** `feature/events` drops `activities` at its step 7, so the scoping
  work in `a584f180` protects the table only until `events` replaces it.
- **The `supabase_admin` default-privileges branch cannot be tested locally.** `postgres` is not a
  member of that role on the dev stack, so that half of the closure silently no-ops; only CI or
  hosted exercises it.
- **Production is unchanged by design.** The data API closure is what protects it today; the policies
  arrive with the v2 merge.
