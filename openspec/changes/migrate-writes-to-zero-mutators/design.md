# Design

## Context

See proposal.md for why. Today every read is a Zero query from an entity module's `queries.ts`,
aggregated in `src/lib/zero/queries.ts`, and every write is a remote function in an entity's
`*.remote.ts` (`authedCommand` / `authedForm` from `src/lib/remote/authed.server.ts`), run in one
RLS transaction with `afterCommit` work drained before the response.

The spike on `feature/zero-mutators` (uncommitted, Zero 1.11) already contains the pieces this
design generalises:

- `src/routes/api/zero/mutate/+server.ts` and `src/lib/zero/mutate.server.ts`: verifies the
  bearer token (401 on any failure), loads the caller like `authedCommand` does, and runs
  `handleMutateRequest` with `zeroDrizzle(schema, db)`.
- `src/lib/zero/mutators.server.ts`: `asCaller(tx, ctx, write)` applies `applyRls` (extracted from
  `createDrizzle` in `db.server.ts`) and maps errors to `ApplicationError`.
- `src/lib/entities/favorite/favorite.server.ts` (`setFavorite`) and
  `src/lib/entities/route/update.server.ts` (`updateRouteRow`): handler bodies moved out of the
  remote function so both callers share them.
- `src/lib/forms/Form.svelte` `mutate` prop: a placeholder that reads the DOM through Kit's
  unexported `convert_formdata`. Kit 3 rejects fields not created with `.as()` and changes that
  converter's signature, so this does not survive.

Zero 1.9 facts verified by the spike and still true on 1.11: `lastMutationID` is bumped as the
login role before the mutator runs, a thrown mutator rolls back but is still marked processed (no
resend loop), and `ZERO_ENABLE_CRUD_MUTATIONS=false` closes zero-cache's own write path.

## Goals / Non-Goals

**Goals:**

- One server body per write, shared by the remote function (for one release) and the mutator.
- The permission model is unchanged: `requireRow` / `requireRowForm` and the `can*` predicates
  keep deciding, now inside the mutator's transaction.
- A form layer that holds every field in one store and can show a server refusal on its field.

**Non-Goals:**

- Moving reads off Zero queries or remote queries.
- Changing what any write does to the database, except the invitation delivery column.
- `retryOn` and isolation levels above read committed. No write here needs serializable; the row
  and advisory locks already cover the races.

## Decisions

### 1. Mutators live in entity modules, aggregated like queries

Each entity gets `mutators.ts` (client defs, `defineMutatorWithType`) and `mutators.server.ts`
(server defs), exported as `<entity>MutatorDefs`, and `src/lib/zero/mutators.ts` /
`mutators.server.ts` aggregate them with `defineMutators`, mirroring `src/lib/zero/queries.ts`.
Argument schemas live in the entity's `dto.ts` beside the form schemas they already share.

Alternative: one registry file, as in the spike. It would grow to every write in the app, and
entity modules are where AGENTS.md puts entity code.

### 2. One body, two callers

Every migrated handler body moves into `<entity>/*.server.ts` as a function taking the existing
context (`db`, `user`, `userRegions`, `afterCommit`) plus a `refuse(message, field?)` callback,
exactly as `updateRouteRow` does. The remote function becomes a one-line caller and stays deployed
for the overlap release; the server mutator is the other caller. Gating stays where it is
(`requireRow` / `requireRowForm` inside the body), so moving a body does not move its check.

Alternative: write each mutator fresh. That doubles every handler for a release and invites the
two to drift, which is exactly what the `known` fingerprint rule in AGENTS.md warns about.

### 3. Two server wrappers: caller and privileged

`asCaller` runs the body on Zero's transaction after `applyRls`. `asPrivileged` runs it on the same
transaction with only `search_path` pinned (`PINNED_SEARCH_PATH`), for the five writes that use
`pinnedTx` today (`createRegion`, `acceptRegionInvitation`, `acceptMyInvitation`,
`subscribeToPush`, `submitFeedback`). This is not a new privilege: `zeroDrizzle` and `pinnedTx`
both run on `db` from `db.server.ts`, the same login role. What changes is atomicity: the
privileged write and Zero's `lastMutationID` now commit together. The `pinnedTx` rule against
nesting inside an RLS transaction does not apply, because no second connection is taken.

Both wrappers map errors the same way: `HttpError` to `ApplicationError(body.message, { details:
{ status } })`, Kit's `ValidationError` to `ApplicationError(issue, { details: { field } })`,
`ApplicationError` passes through, and anything else is logged and becomes
`formError('error_server_title')`. Zero forwards an error's text to the client, and Postgres
errors can quote row values.

Alternative for the privileged five: keep them endpoints. They need nothing an endpoint offers,
and the native app would then need a second write path for them.

### 4. Client halves: optimistic for toggles, empty for the rest

Toggles write the local store optimistically: `favorites.set` (a leaf row with a negative,
deterministic temporary id that Zero replaces with the server row), `reactions.toggle`,
`files.setVisibility`, `users.updateSettings`, `notifications.markRead`,
`notifications.markFeedSeen`. Everything else (forms, creates, deletes, restores, reorders,
membership) has a client half that validates its arguments and writes nothing; the caller awaits
`.server`. A client write for a row with a serial id the client cannot know would show a row the
server then replaces, which is worse than waiting.

`isOnline()` gates every call: offline, the toggle toasts `error_offline_title` and the form shows
its offline overlay, as `Form.svelte` does today. A result of `type: 'zero'` is treated as offline
and Zero's text is never shown; `type: 'app'` carries our message.

### 5. Return values replace `MutationResult.data`, the client decides where to go

Creates return `{ id }`, deletes return their undo snapshot, through Zero 1.11 return values. A
server mutator never returns `redirectTo`: the client knows the destination (`entityHref`) and
navigates after `.server` resolves, through the same `exit` / `waitFor*` helpers as now.
One helper, `write(mutation, { redirectTo? })` in `src/lib/zero/write.ts`, runs a mutation and answers
in the envelope remote commands used: `{ data, redirectTo }` on success, a Kit-shaped rejection
(`body.message`, plus `body.field`) on a refusal, the offline message for a `zero` error or while
offline. `runCommand` and `withUndo` therefore stay as they are: `runCommand` still navigates and
waits for the row to sync, now to a destination the client names. Callers swap `deleteRoute(x)` for
`write(mutators.routes.delete(x), { redirectTo })`.

Proven in the harness: 1.11 writes a return value into Zero's shard table (`<app>_0.mutations`)
inside the same transaction, after the mutator returns. `app_writer` may not write it, so the
wrappers switch the role back (`set_config('role', 'none', true)`) once the body succeeds, which
leaves Zero's bookkeeping on the login role it already uses before the mutator. No grant, and
nothing tied to the shard schema's name, which differs per app id.

The same run showed Zero reporting a failure of its own query as the mutation's message, SQL and
parameters included, outside the wrappers' error mapping. `handleMutate` therefore replaces every
error message that is not an authored `formError` with the generic one before answering, and logs
the original. That covers the native client too.

### 6. Side effects run after commit, once per mutation

`afterCommit` keeps its meaning. The mutate handler collects deferred work per mutation, drops it
when that mutation's result is an error (its transaction rolled back), and drains the rest before
answering, so `.server` resolving means the side effects have run. Exactly-once comes from three
existing mechanisms, not a new table:

- Zero never re-runs a mutation whose id is at or below `lastMutationID`, and that bump commits
  with the write.
- Notifications collapse on their natural unique key (`onConflictDoUpdate` in
  `notification.server.ts`).
- Email takes an idempotency key (`sendEmail`'s `idempotencyKey`) built from stored data, as
  `invitation-${id}` already is. `resendRegionInvitation` keys on `Date.now()` today; it keys on
  the `last_sent_at` its own transaction wrote instead, so the key is stable for the mutation.
  No key derived from Zero's client or mutation ids is needed.

Storage teardown (`removeFileStorage`) must treat an already-missing object as done; task 9.1
verifies it does.

The invitation email moves from inside the transaction to after commit. `sendInvitationEmail`
keeps writing `last_sent_at` (the attempt, which feeds the throttle) and now also writes
`last_delivered_at` when `sendEmail` returns true. `InvitationRow` reads both: delivered shows the
existing "sent ..." line, an attempt newer than the last delivery shows "not delivered" with the
resend action. The region page already calls `refreshInvitations()` after an invite, and because
side effects drain before the answer, the refreshed row is already true.

### 7. A store-backed form layer beside `Form.svelte`

A new `createFormStore(schema, initial)` in `src/lib/forms/` holds values in `$state`, validates
with the entity's zod schema, keeps a field-to-issues map, and exposes `setIssue(field | null,
message)` for a refusal (`details.field` from decision 3). `Form.svelte` is rewritten around the
store with one mode: its `submit(values)` prop resolves to success or a refusal, whether it runs a
mutator or a remote command. `FormGate`, `waitFor`, `seed` and the `{#key seeded}` remount keep
working, and `seed` writes the store. The two `Form` screens that stay remote functions
(`settings/email`, `settings/password`) call `command` exports added beside their `form` ones,
which stay deployed one release for open tabs like every other replaced export.

That leaves nothing that needs Kit's remote-form machinery outside the auth pages (`AuthField`):
`seed.svelte.ts` (`seedForm`, `seedOnKeyChange`), `submit.ts` and `offlineFailure.ts` are deleted
with their tests once the last form moves, and the entity `*FormFields` components stop using
`RemoteFormInputWrapper`, which stays for `AuthField` only. Fields that live in component state
today (grade, rating, tags, first ascensionists, pins) write into the store instead of posting
hidden inputs, so a submit reads exactly what the store holds and nothing is lost the way the
spike lost route 115's grade.

Because the store is created per mount, the singleton-fields leaks AGENTS.md describes for remote
forms cannot happen, so those conventions (clearing in the `enhance` callback, `seedForm` versus
a DOM reset, never `form.for(key)`) are cut from AGENTS.md once the last form moves, not
rewritten. The route edit form is the pilot (group 3); every other form follows its pattern.

Alternatives: Kit remote forms with every field moved to `.as()` (still no client-side issue
setter, and values set from code are not what gets submitted, kit#16015), and TanStack Form (the
Svelte adapter has open hydration-id and server-error bugs and a v2 rewrite in alpha). The schemas
and the `details.field` refusal shape are what the native app shares, not the form library.

### 8. The permission ratchet covers mutators

`src/lib/remote/gates.test.ts` scans `*.remote.ts` exports today. It also scans every server
mutator def (`mutators.server.ts`), with the same `GATES` set and a written reason for each
exemption. Privileged mutators get no stricter rule: `createRegion` and `subscribeToPush` are
privileged and already carry a reasoned exemption.

### 9. Tests run through the mutate endpoint

`zeroClient` in `src/lib/remote/testHarness.ts` pushes real mutations with a signed token through
`handleMutate`. Each entity commit adds tests of its mutator path (what it answers, how a refusal
arrives), seen red; the `*.remote.test.ts` suites keep covering the shared bodies while the remote
functions stay, and are ported to the harness before those are deleted.

### 10. Callers write through the entity's `writes.ts`, as they read through its resources

Each entity gets `writes.ts` with one plain function per write, named like the remote function it
replaces (`updateRoute(values)`), returning the `write()` envelope. Components import those and
never `mutators` or `write`, the way nothing outside entity modules imports `$lib/zero/queries`.
The function also owns the destination (`entityHref`), so a call site never builds one. Writes that
stay endpoints get the same kind of function, so a caller cannot tell a mutator from a remote
call, and moving one write to another transport is a one-line change in its entity module. Timing is
the part no signature hides: a toggle is instant because its mutator writes locally first.

Alternative: callers name the mutator, as the pilot first did. That leaks the transport into every
component, the thing the read side was built to avoid.

## Risks / Trade-offs

- [A delete's sync removes the row before `.server` resolves, so a detail screen showed "not found"
  for about 65 ms before it left] → decided: `writes.ts` marks the entity as being deleted for the
  length of the write; a detail resource whose row vanishes under its own pending delete keeps its
  last content, and after the skeleton delay (~250 ms) the screen shows a generic "Deleting…"
  (`common_deleting`). A refusal clears the mark and leaves the content; another client's delete
  still shows "not found" at once.
- [After-commit work runs before the answer, so slow storage teardown delays the next write in the
  same client group] → teardown already ran before the response under remote functions; measure
  the delete path in task 9.4 and move teardown to a background task only if it is measurably slow.
- [A `zero` error may still be sent after reconnect (inferred from 1.9 source), so a resubmitted
  create could land twice] → creates are awaited and refused offline; the open question is noted
  for the offline-queue change, which needs client ids anyway.
- [Deploy skew: a tab on the old client, or zero-cache on an old schema] → mutator arguments are
  only ever widened within a release; deploy zero-cache, then the app; remote functions stay one
  release.
- [Zero 1.11 drops unsent 1.9 mutations on upgrade] → prod runs no mutators before this release,
  so there is nothing to drop.
- [Field-level issues for a field the store does not render] → `setIssue` falls back to the form
  level, the same place `FormError` shows Kit's unattached issues today.

## Migration Plan

1. Deploy zero-cache 1.11 with `ZERO_MUTATE_URL` and `ZERO_ENABLE_CRUD_MUTATIONS=false`
   (`deployment/docker-compose.zero.yml`).
2. Migrate the database (`last_delivered_at` plus its backfill).
3. Deploy the app. Open tabs keep using the remote functions until the service worker reloads them.
4. In the next ordinary release, delete the migrated remote functions and their tests.

Rollback: redeploy the previous app (its remote functions still exist and the new column is
nullable), then roll zero-cache back. Clients roll back before zero-cache, as the 1.11 notes
require.
