# Design

## Context

`areas.restore`, `blocks.restore` and `routes.restore` are Zero custom mutators whose server defs run `restoreAreaRow`, `restoreBlockRow` and `restoreRouteRow` (`<entity>/lifecycle.server.ts`) under `asCaller`. Their soft branch gates on `canDeleteArea` / `canDeleteBlock` / `canDeleteRoute`, all `canDeleteCreatedRow`: region delete permission, or edit permission on a row the caller created. Each already refuses while an ancestor is deleted (`hasDeletedAncestor`, or the route's block), so a removed area's blocks and routes cannot come back on their own; only the removed object itself is exposed.

`moderation_decisions` has RLS on and no policies, so nothing running as the caller can read it. The delete mutators already reach it the way this change needs to: after their `asCaller` body, `recordPlanned(tx, ctx, removal)` writes the decision on Zero's transaction as the login role. Moderation Undo (`reverseDecision` in `moderation/reverse.server.ts`) claims the decision as reversed first and then calls the same three lifecycle functions directly, not through the mutators.

## Goals / Non-Goals

**Goals:**

- A standing decision is the only thing that can hold an area, block or route down for breaking the rules, and only its Undo lifts it.
- No change to tidy-up delete and restore, nor to Undo.

**Non-Goals:**

- A policy or a Zero query on the decision tables; they stay unreachable from the client.
- Guarding ascents, comments or media (see the proposal's non-goals).

## Decisions

- **Where the guard sits: in the three restore mutators, after the caller's body.** Each server def runs its existing `asCaller(...)` and then `await asPrivileged(tx, (db) => refuseWhileRemoved(db, kind, id))`, the same shape as `delete` plus `recordPlanned`. After, not before: the caller's own permission check answers first, so someone outside the region gets the ordinary refusal and cannot probe which ids were moderated, and a refusal rolls the restore back with the rest of the transaction. One transaction, one connection, the login role for the read, so no nested checkout (the pooler rule) and no schema change. Because Undo calls the lifecycle functions directly, it never meets the guard, whatever order it claims and restores in. Alternative: the check inside `restoreXRow`, rejected because those run as the caller and cannot see the table, and Undo calls them too. Alternative: a `SECURITY DEFINER` SQL function, rejected as a migration for what one privileged read on the existing transaction does.
- **What it checks: any standing decision on the object, soft mode only.** `refuseWhileRemoved(db, kind, id)` looks for a decision with that `object_type` and `object_id` and `reversed_at is null`, and throws `error(409, formError('moderation_restoreRefused'))` when one exists. Only the soft mode clears `deleted_at`; a hard restore inserts under the old id, and on a row that still exists, which a removal always leaves, it ends as a replay that changes nothing. Guarding it too would answer 409 for a removed row and success for a tidied one, telling any member with add permission which ids were moderated.
- **One place for "standing on this object".** `undoRemovalRow` (`moderation/undo.server.ts`) already builds that condition; it moves into a small exported helper both use, so the guard and Undo cannot disagree about what "standing" means. The helper and `refuseWhileRemoved` live in `moderation/undo.server.ts`, beside the only other reader of standing decisions.
- **Gates.** The restore mutators already name their gate (`restoreAreaRow` etc. in `gates.test.ts`); the new call adds a refusal, not a permission, so the gates list is unchanged.
- **Copy.** One key, `moderation_restoreRefused`: "This was removed for breaking the rules. Only a region admin can bring it back, from the region's moderation log." with its German counterpart.

## Risks / Trade-offs

- [A stale tidy-up Undo toast for a row since removed for the rules] → it now gets the refusal instead of silently undoing a moderation decision, which is the intent.
- [A decision whose region was deleted] → the region's content went with it, so there is nothing to restore.
- [No index on `(object_type, object_id)`] → `moderation_decisions` is indexed on `created_at` only, so this read, like the Undo lookup, scans a table holding three years of decisions. That is small at this scale, and restores are rare; an index is a schema change left out until it shows up in a trace.
