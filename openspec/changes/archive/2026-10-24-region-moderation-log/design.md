# Design

## Context

Decisions live in `moderation_decisions` and `moderation_decision_subjects`, which have RLS on and no policies, so only the login role reads them and no Zero query names them. The app-admin screen (`src/routes/(app)/settings/moderation/+page.svelte`) reads them through the remote query `listDecisions`, which calls `readDecisions()` in `moderation/admin.server.ts` on `pinnedTx` after `requireAppAdmin`. Its rows are `DecisionRow`, which already carries the acting admin's name. Undo after a removal is the mutator `moderation.undoRemoval({ id, kind })`, whose handler `undoRemovalRow` (`moderation/undo.server.ts`) finds the newest standing decision for that object and gates on `decision.actorFk === user.id && canModerate(userRegions, decision.regionFk)`, then calls `reverseDecision`. Admin-only region screens follow `regions/[regionId]/map-layers`: `RegionScreen` for chrome, `RegionAdminRequired` for the refusal, and an admin-only `SettingsSheetRow` on the region screen.

## Goals / Non-Goals

**Goals:**

- One reader and one list component serve both the app-admin screen and the region's, so the two cannot drift.
- One undo write path for the toast and the log.

**Non-Goals:**

- A Zero query or any policy on the decision tables: the log stays a privileged remote read gated in its handler.

## Decisions

- **Read: a region-scoped remote query on the existing reader.** `readDecisions()` takes an optional `regionFk` and filters on it; a new `listRegionDecisions({ regionFk })` remote query in `moderation.remote.ts` gates on `canModerate(locals.userRegions, regionFk)` (403 otherwise) and calls it. It is a remote `query` with `pinnedTx`, like `listDecisions` and `removalStatement`, rather than `authedQuery`, because the read is privileged and must not hold a second pool slot. Alternative: an RLS policy plus a Zero query, rejected because the decision tables are deliberately unreachable from the client and a policy would have to mirror `canModerate` exactly.
- **Rows: `DecisionRow` as it is, plus the object id.** The log needs `objectId` to undo through the existing mutator, so `DecisionRow` gains it. The region name stays in the row and the region screen simply does not render it. The list never includes `removed_body`, as today.
- **Write: one path, the existing `moderation.undoRemoval` mutator, gate widened.** `undoRemovalRow` drops the `actorFk === user.id` half and passes for `canModerate` on the decision's stored region or for an app admin, so the app-admin screen's Reverse uses it too and `reverseDecisionCommand` and `reverseById` (with its transaction cast and its own after-commit drain) are deleted. `ServerMutatorContext` gains `userPermissions`, filled where the context is built, for the app-admin half. Both screens call the entity's `writes.ts` `undoRemoval(kind, objectId)` and then refresh their list. `reverseDecisionCommand` never shipped, so no open tab calls it. The newest standing decision for an object is the row's own decision: an object cannot be removed again while a standing removal holds it down. Alternative: keep `reverseDecisionCommand` for app admins and add a decision-id command for region admins, rejected because it is two write paths with two gates for one action. The mutator's name and arguments are unchanged, so tabs loaded before the deploy keep working.
- **Screen: extract the list from the app-admin page.** The rows, the disclosure and the dialog in `settings/moderation/+page.svelte` move into `moderation/DecisionList.svelte`, taking the rows, whether to show the region, and an `onundo` callback that refreshes the caller's list. Both screens label the action Undo, keeping the dialog's text on what comes back, so the `moderation_reverse*` keys go. Copying the markup instead would add a jscpd clone and two places to fix.
- **Entry: an admin-only row on the region screen,** beside map layers and tags, shown when `canModerate` holds for the region, linking to `/regions/[regionId]/moderation` through `resolve()`.
- **No schema change and no backfill.** Everything shown is already stored.

## Risks / Trade-offs

- [Two admins undo the same decision at once] → `reverseDecision` already claims the row with `reversed_at is null` and answers 409 to the second; the list shows that refusal as a toast.
- [A co-admin quietly undoes another's removal] → the log shows the reversal and who made it; notifying the original admin is a non-goal for now.
- [A privileged read gated only in its handler] → `gates.test.ts` lists `listRegionDecisions` beside `listDecisions`, and a remote test pins that a maintainer and an admin of another region get 403.
- [App admins now reverse through a mutator, whose context had no app permissions] → `userPermissions` comes from the same verified session as `userRegions`; a server test pins that an app admin outside the region may undo and a member may not.
- [An already-loaded tab's toast Undo for a co-admin's decision] → it calls the same mutator, which now accepts it, which is the intended behaviour.

## Migration Plan

App-only deploy: no migration, no zero-cache change. The legal text changes (privacy section 5, terms clause 15) go out with it and need the member notice the earlier terms change used.
