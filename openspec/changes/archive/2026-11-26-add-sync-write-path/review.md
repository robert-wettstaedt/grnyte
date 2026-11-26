# Plan review

Status: clean

## Rounds

- Round 1, snapshot `ef2f1390b4e5b47786ccb5973b83936fb72ed281`: stopped early for usage. reader and security reported what they had; grounding not run. Not clean.
- Round 2, snapshot `e2f69fef9b85a4fe6a9fc10d10db135a503ecb9d`: reader, grounding, security, all on Opus, all reported. Not clean.
- Round 3, snapshot `177bb969bf4b89b332add82e9a95c0003b86d6c5`: reader (fresh), grounding and security (resumed), all reported. Not clean. Cap reached.
- Round 4 (user, 2026-11-25), snapshot `3161d291886075fcff0c8589592894e595b4b2f7`, limited to the fixes of round 3: grounding clean; security and reader report no blocker and three majors on those fixes. Fixed after the round, not reviewed; the user accepted the plan as clean with that known (2026-11-25).
- After round 4 (user, 2026-11-25): edits after issue 1184 merged (D15 and the proposal in the past tense, task 1.7 and D12 also run `src/lib/remote`, the `sync/mutations` delta, D5's sentence on a second 401, one case in 10.4). Not reviewed; the user accepted them without another round.

## Paraphrases

Round 1, reader:

> **What this proposes.** The first of seven R1 packages (issue 1177). It adds `POST /api/sync/mutate`, a Bearer-authenticated route on the app server that runs an existing server mutator in Zero's own server transaction and records a client-made write id in a new `applied_writes` table (kept 30 days), so a write sent twice applies once and gets the first answer. In the PowerSync build, `write()` gets a twin that posts to that route and retries under the same id, and every resource without a PowerSync twin reads through one remote function, `readQuery`, which runs the Zero query definition on the app server as the caller under row-level security, fetched again after an own write and on return to the app. It also adds two trigger-kept marker tables (`region_counters`, `user_counters`), stream entries for them and for the caller's own open `content_reports`, a build guard listing the modules still allowed to import the Zero client, a PowerSync build step in CI, one privacy-page item and record updates.
>
> **How the existing system works, per this plan.** 65 Zero custom mutators in 14 entity modules all reach the server through one client function, `write()` in `src/lib/zero/write.ts`, which refuses offline, awaits Zero's server answer and maps a refusal to a `WriteRejection`; zero-cache forwards those pushes to `/api/zero/mutate`, Zero's push processor, which needs client groups and sequential mutation ids. Reads go through `createResource` over a `QuerySource` (a default one inside `resource.svelte.ts`, and `ttlSource.svelte.ts`); in the PowerSync build a module with a `*.powersync.*` twin reads from PowerSync, while `event`, `notification`, `reaction` (which holds comments) and `report` still read, and every write still goes, through the Zero client. `/api/zero/` and `/api/app/` are header-authenticated, so no hook loads a cookie session there, and only `/api/zero/` skips the rate limit. Nine non-test modules import the Zero client module `z.svelte.ts`, nothing guards a PowerSync build against it, and CI builds only Zero.

Round 2, reader:

> **What this proposes.** The first of seven R1 packages (issue 1177), started after the dead remote writes are deleted (1184). It adds `POST /api/sync/mutate`, which runs one existing server mutator for a Bearer caller in one transaction and records a client-made write id in `applied_writes` for 30 days, so a resend applies once. In the PowerSync build a `write()` twin sends every write there with retries, and a twin of the data source answers reads without a PowerSync twin through `readQuery`, which runs the Zero definition as the caller under RLS. These are fetched again after an own write, on return, and on reconnect. It also adds two trigger-kept marker tables, three stream entries, a shrinking list of allowed Zero-client importers, a PowerSync CI build, a privacy item and records.
>
> **How the existing system works, per this plan.** 65 mutators in 14 modules all go through `write()` to the Zero client, then through zero-cache to `/api/zero/mutate`, Zero's push processor with sequential ids. `createResource` takes rows from a `QuerySource` and derives the phase from `data`, `details.type` and `view`. In the PowerSync build, `event`, `notification`, `reaction` (comments) and `report` have no twin and still read through Zero. `/api/zero/` and `/api/app/` are header-authenticated. Publications differ: PowerSync's lists tables by name, zero-cache's covers the schema.

Round 3, reader:

> **What this proposes.** The first of seven R1 packages. The app server gains a Bearer-only `POST /api/sync/mutate` that runs the existing server mutators in one transaction and records a client-made write id for 30 days, so a repeat applies once and gets the first answer. In the PowerSync build, `write()` and every resource without a twin stop using the Zero client: writes go to that route, and reads go through one remote function, `readQuery`, that runs the Zero query definition as the caller, refetched after own writes and on return. It also adds commit-time change-marker tables, three stream entries, a build guard with a shrinking list, a CI build and a privacy item.
>
> **How the existing system works, per this plan.** 65 Zero mutators all pass through one client `write()`, which zero-cache forwards to `/api/zero/mutate`, a push processor with sequential ids. Reads use `createResource` over a `QuerySource`. In the PowerSync build, twinned modules read PowerSync, but events, notifications, reactions/comments, reports and all writes still use the Zero client. Nine modules import that client and nothing guards against more; CI builds only Zero.

Round 4, reader:

> **What this proposes.** A `POST /api/sync/mutate` route runs the existing Zero server mutators in one transaction, keyed by a client write id so replays return the first answer. The PowerSync build's `write()` posts there, and resources without a PowerSync twin read through a `readQuery` remote function. It adds `applied_writes`, two commit-time change-marker tables, stream entries, an import guard, a CI build, retention and a privacy entry.
>
> **How the existing system works, per this plan.** All 65 mutators go through one `write()` to zero-cache's push processor, in both builds. Four resource modules still read through Zero, via `createResource` over a `QuerySource`. Hooks treat `/api/zero/` and `/api/app/` as header-authenticated. The server runs mutators in `asCaller` or `asPrivileged` transactions.

## Claims

Round 2, grounding: every claim checked holds except P31 and P32 (both fixed). Not checked: the zero.rocicorp.dev pages, the issue texts, the privacy page list, the "about 2,800 lines" and "170-line tree", the two-condition stream query (task 6.1 stops on it).

Round 3, grounding: D9's trigger pair was built and run on a throwaway Postgres 16 and behaves as described; only the path of P42 was contradicted.

## Findings

Line numbers are those of the snapshot that raised the finding.

| #   | raised by | file:line | severity | claim | status | reason/evidence |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | reader | design.md:84, tasks.md:51 | blocker | `waitForRow` also uses the Zero client, so moving one constant does not free `resource.svelte.ts` | fixed | `resource.svelte.ts:412`; D6 and 4.1 move it to `waitForRow.ts` |
| P2 | security | design.md:39 | blocker | `tx.retryOn` does not work outside the push processor | fixed | D1 says it throws and that nothing in production calls it; 1.6 says per request |
| P3 | security | design.md:114, tasks.md:62 | blocker | deletes do not need a branch of their own, and the red step of 5.3 cannot be reached | fixed | `region/delete.server.ts:50`; D9 drops the branch, 5.3 goes red by dropping the cascades |
| P4 | reader | tasks.md:69, design.md:128 | major | the publication branch is never run before production | fixed | 6.4 runs it twice against a publication; owner check in the Migration Plan |
| P5 | reader | server-reads/spec.md:44, design.md:88 | major | a new window tears the list down | fixed | D6: `limit` and `upTo` keep the rows as arriving; spec scenario, 4.4, 10.4 |
| P6 | reader | design.md:106 | major | a failed refetch replaces answered rows with an error | fixed | D6, D8, spec scenario, 4.5 |
| P7 | reader | tasks.md:52 | major | the unreadable-memberships case cannot be produced, and the read loads them twice | fixed | D7 takes them from `locals` |
| P8 | security | design.md:182, tasks.md:52 | major | no test fails when `applyRls` is left out | fixed | 4.2's `app_admin` membership case; spec scenario |
| P9 | implementer (security's open check) | design.md:114 | major | row triggers lock counter rows in opposite orders (push claim against fan-out) | fixed | `directed.server.ts:155`, `notification.server.ts:137`; D9 statement-level in key order; 5.2 case |
| P10 | reader | tasks.md:51 | apply-note | the mock in `similarMatches.svelte.test.ts` points at the old path | fixed | 4.1 |
| P11 | reader, security | design.md:49 | apply-note | the claim insert runs before the search path is pinned | fixed | D2, 1.3 |
| P12 | reader, security | design.md:71, design.md:43 | apply-note | `randomUUID` is missing on an insecure origin; ids must be unguessable | fixed | D1, D5, 3.1 |
| P13 | reader | tasks.md:79 | apply-note | the sweep's count is shared with parallel tests | fixed | 8.1 |
| P14 | reader | tasks.md:7 | apply-note | an edited migration needs the database rebuilt | fixed | tasks.md intro, 5.2 |
| P15 | reader | tasks.md:28 | apply-note | the caller block would be a duplicate | fixed | D1, 1.1 export one function |
| P16 | reader | design.md:88 | apply-note | the source needs a query context | fixed | D6, 3.4 |
| P17 | reader | design.md:106 | apply-note | a second hidden-time clock | fixed | D8 uses `watchVisibility` |
| P18 | reader | write-path/spec.md:74 | apply-note | no standing test of a permission refusal through the route | fixed | 1.2 |
| P19 | security | tasks.md:39 | apply-note | 2.1 is green without the prefix | fixed | 2.1 |
| P20 | security | tasks.md:32 | apply-note | invalid arguments become a 500 | fixed | D3, 1.2 |
| P21 | security | tasks.md:81 | apply-note | a stored answer can hold an invited address | fixed | 8.3 names it; the wording is the user's |
| P22 | reader | tasks.md:87 | nit | seven or eight packages | fixed | seven, after the groundwork |
| P23 | reader | tasks.md:99 | nit | the gate is not explained | fixed | one clause |
| P24 | reader | design.md:183 | nit | no task runs e2e | fixed | claim dropped |
| P25 | reader | design.md:10 | nit | comments live in `reaction` | fixed | said once |
| P26 | reader | proposal.md:19 | nit | ambiguous "design D15" | fixed | reworded |
| P27 | reader (reopens P4) | design.md:201 | major | the hand step names tables that do not exist before the migration | fixed | D10 catches the privilege error; list checked after the migration |
| P28 | reader (reopens P5, P6), grounding | design.md:92 | major | a failed window move destroys the carried rows; a failure while offline is an error | fixed | D6, spec, 4.4 |
| P29 | reader | server-reads/spec.md:32 | major | two requirements contradict for a caller row-level security refuses | fixed | first requirement qualified |
| P30 | security (reopens P9), grounding | design.md:195 | blocker | a lost deadlock is not sent again, and ordinary edits can deadlock on the region marker; a mixed fan-out can too | fixed | `area/lifecycle.server.ts:94`; D9 takes every counter lock at commit, in one order |
| P31 | grounding | design.md:26 | blocker | the Zero build's schema changes, so every device re-syncs | fixed | stated in Goals, Risks, Migration Plan, proposal; 10.4 drives it |
| P32 | grounding | design.md:160 | blocker | a remote module can live under `server/` | fixed | reason dropped |
| P33 | security, reader | design.md:78 | major | nothing binds a read or write to the account of the screen | fixed | D5, D6, D7; both specs; 3.1, 3.3, 4.2, 4.4 |
| P34 | security | tasks.md:61 | major | the opposite-order test cannot go red | fixed | 5.2, deterministic form |
| P35 | security | design.md:98 | apply-note | an uncapped limit on the app's pool | fixed | D7 statement timeout |
| P36 | security, grounding | tasks.md:29 | apply-note | `mustGetMutator` finds namespaces and inherited names | fixed | D1, 1.2 |
| P37 | grounding | tasks.md:55 | apply-note | a remote module in `db.svelte.ts`'s imports breaks browser tests | fixed | D8 `onStaleReturn` |
| P38 | grounding, reader | tasks.md:43 | apply-note | the id helper has no named file | fixed | `src/lib/forms/randomId.ts` |
| P39 | grounding | tasks.md:60 | apply-note | `HANDLED_TABLES` and `regionTables` need the new table | fixed | 5.1 |
| P40 | reader | design.md:88 | apply-note | a disabled resource can share rows | fixed | D6, 4.4 |
| P41 | reader | design.md:206 | apply-note | rollback order | fixed | Migration Plan |
| P42 | reader, grounding, security (reopen P39) | tasks.md:60 | blocker | the path of `regionMove.ts` is wrong | fixed | the edit is dropped (P43) |
| P43 | reader | tasks.md:60 | major | `HANDLED_TABLES` would make `split-region` abort on a marker row | fixed | edit dropped; the list is already stale without this change, so the preflight already fails |
| P44 | reader (reopens P33) | design.md:76 | major | `start()` runs again for another account without a reload, so a mounted form submits as it | fixed | D5: another account reloads the document; keying on the account dropped; 3.4, 10.4 |
| P45 | all three | tasks.md:52 | apply-note | task text behind the design; the token's account is not named | fixed | D5, D6, 4.2, 4.4 |
| P46 | reader | tasks.md:69 | apply-note | the non-owner run never warns | fixed | 6.4 |
| P47 | reader, grounding | tasks.md:61 | apply-note | dropping `ORDER BY` may stay green | fixed | 5.2 |
| P48 | reader, security | design.md:93 | apply-note | refusals are retried every 5 s | fixed | D6, 4.4 |
| P49 | reader | tasks.md:46 | apply-note | refetch callbacks multiply | fixed | D8 single slot |
| P50 | reader, security | design.md:123 | apply-note | old and new region on an update | fixed | D9 |
| P51 | grounding | design.md:132 | apply-note | "cannot deadlock" is too strong | fixed | D9 |
| P52 | security, reader (reopen P44) | design.md:79 | major | a bare reload leaves the first account's store on the device | fixed | D5 clears it first; 10.4 |
| P53 | reader (reopens P48) | design.md:93 | major | a refused window change replaces the list, against the spec | fixed | D6 keeps the rows; 4.4 |
| P54 | reader | tasks.md:94 | major | the drive would reach the existing wipe, not the new reload | fixed | 10.4 names the route and how to tell |
| P55 | security, reader | design.md:79 | apply-note | null session, and what runs after the reload is asked for | fixed | D5 |
| P56 | grounding, reader (reopen P45) | tasks.md:46, tasks.md:24 | apply-note | the getter answers only a token; stale "one line" | fixed | 3.4, seams |
| P57 | reader | tasks.md:60 | apply-note | no case moves an event between regions | fixed | 5.1 |
